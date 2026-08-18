/*
# Admin 2FA enforcement, grace tracking, and Super-Admin recovery

## Plain-English summary
This change supports requiring two-factor authentication (2FA) for Admin and
Super Admin accounts. It stores, per account, when their 2FA grace period
started and how many times they have postponed setup, so the app can allow a
short grace window before blocking access. It also adds a secure, server-side
recovery action that lets a Super Admin wipe another account's 2FA enrollment
(so a locked-out colleague can start over) — and that recovery itself can only
be performed by a Super Admin who is currently 2FA-verified.

## Modified tables
- `profiles`
  - New column `mfa_grace_started_at` (timestamptz, nullable): the moment the
    2FA grace window began for this account. Null until enforcement first sees
    the account without a verified factor.
  - New column `mfa_skip_count` (integer, not null, default 0): how many times
    the account chose "remind me later" during the grace window.

## Security changes
1. Column-level UPDATE on the two new columns is granted to `authenticated`
   so each user can update ONLY their own grace tracking (already constrained
   by the existing self-only UPDATE policy on profiles). No table-wide UPDATE
   is re-granted; the role column remains locked by the existing trigger.
2. New SECURITY DEFINER function `admin_reset_user_mfa(target_user_id)`:
   - Requires the caller to be a Super Admin (via get_my_role()).
   - Requires the caller's current session to be 2FA-verified (JWT aal = aal2).
     This is a genuine database-level AAL2 gate on a highly sensitive action.
   - Refuses to reset the caller's own factors.
   - Deletes the target account's TOTP factors and resets that account's grace
     window so they must re-enroll from scratch.
   - EXECUTE is revoked from PUBLIC/anon and granted only to authenticated;
     the function enforces the Super Admin + AAL2 checks internally.

## Important notes
1. Fully idempotent: columns use IF NOT EXISTS, the function is CREATE OR
   REPLACE, and grants are safe to re-run.
2. No existing policy is weakened. The new AAL2 requirement lives only inside
   the new recovery function.
3. Bootstrap note: the recovery function requires the Super Admin to already be
   2FA-verified. Once the Super Admin has enrolled (which enforcement requires),
   they can reset any locked-out Admin.
*/

-- 1. Grace-tracking columns on profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles'
      AND column_name = 'mfa_grace_started_at'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN mfa_grace_started_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles'
      AND column_name = 'mfa_skip_count'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN mfa_skip_count integer NOT NULL DEFAULT 0;
  END IF;
END $$;

-- 2. Allow each user to update their own grace-tracking columns
GRANT UPDATE (mfa_grace_started_at, mfa_skip_count) ON public.profiles TO authenticated;

-- 3. Super-Admin, AAL2-gated 2FA recovery
CREATE OR REPLACE FUNCTION public.admin_reset_user_mfa(target_user_id uuid)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = 'public', 'pg_temp', 'auth'
AS $$
DECLARE
  caller_role text;
  caller_aal  text;
  removed     integer;
BEGIN
  caller_role := public.get_my_role();
  IF caller_role IS DISTINCT FROM 'Super Admin' THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;

  caller_aal := (auth.jwt() ->> 'aal');
  IF caller_aal IS DISTINCT FROM 'aal2' THEN
    RAISE EXCEPTION 'AAL2_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF target_user_id IS NULL OR target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'INVALID_TARGET' USING ERRCODE = '22023';
  END IF;

  DELETE FROM auth.mfa_factors WHERE user_id = target_user_id;
  GET DIAGNOSTICS removed = ROW_COUNT;

  UPDATE public.profiles
     SET mfa_grace_started_at = now(),
         mfa_skip_count = 0
   WHERE id = target_user_id;

  RETURN jsonb_build_object('success', true, 'factors_removed', removed);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_reset_user_mfa(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_reset_user_mfa(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_reset_user_mfa(uuid) TO authenticated;