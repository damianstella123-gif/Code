/*
# Add wellness consent to profiles

1. Modified Tables
- `profiles`
  - New column `wellness_consent_at` (timestamptz, nullable). Records when the
    user agreed to let the wellness features (mood check-in, break reminders)
    run for them. NULL means the user has not yet been asked / has not consented.

2. Security
- Extend the existing self-editable column grant so an authenticated user can
  set/clear their own `wellness_consent_at` value. Table-level UPDATE remains
  revoked; only this explicit column is grantable, matching the existing pattern.

3. Notes
1. The column is nullable and has no default, so existing rows are unaffected
   and treated as "not consented yet".
2. Idempotent: the column add is guarded by an IF NOT EXISTS check; GRANT is
   naturally idempotent.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'wellness_consent_at'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN wellness_consent_at timestamptz;
  END IF;
END $$;

GRANT UPDATE (wellness_consent_at) ON public.profiles TO authenticated;
