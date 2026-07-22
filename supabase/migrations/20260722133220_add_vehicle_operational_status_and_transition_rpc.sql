/*
# Add vehicle operational status and transition RPC

## Summary
Enables per-vehicle departure/cancellation lifecycle independent of the movement.
Adds columns to transport_vehicles for operational_status tracking and an RPC to
transition vehicles atomically. Notifications are sent to event members on state changes.
When all non-cancelled vehicles in a movement have departed, the movement auto-transitions
to departed. Reopening a vehicle reverts the movement to open if needed.

## Modified Tables
- `transport_vehicles`
  - `operational_status` text NOT NULL DEFAULT 'boarding' — ('boarding','departed','cancelled')
  - `departed_at` timestamptz nullable — set when vehicle departs
  - `departed_by` uuid nullable FK profiles(id) — who marked departure
  - `cancelled_at` timestamptz nullable — set when vehicle cancelled
  - `cancelled_by` uuid nullable FK profiles(id) — who cancelled
  - `cancellation_reason` text nullable — reason (min 5 chars when cancelled)

## New Functions
- `transition_transport_vehicle(p_vehicle_id uuid, p_action text, p_reason text DEFAULT NULL)`
  Actions: depart, cancel, reopen.
  Returns jsonb with operation result (vehicle label, departed_at, occupants, capacity).

## Security
- SECURITY DEFINER, search_path = public, pg_temp
- EXECUTE revoked from PUBLIC/anon, granted to authenticated only
- Authorization: auth.uid() + has_event_permission (can_access_onsite OR can_manage_registration)

## Notifications
- Inserted into notifications for all event_members of the event (excluding the acting user)
- type = 'transport_vehicle_status'
- related_entity_type = 'transport_vehicle'
- No PII in message (only vehicle label, time, occupant count)

## Movement auto-transition
- All non-cancelled vehicles departed → movement set to 'departed' with closed_at/closed_by audit
- Any vehicle reopened while movement is departed → movement reverted to 'open', audit cleared

## Realtime
- transport_vehicles already in supabase_realtime — verified, not re-added

## Data Safety
- No data deleted or modified
- New columns have safe defaults (boarding, NULL audit fields)
- CHECK constraints prevent invalid state combinations
*/

-- ═══════════════════════════════════════════════════════════════════════════════
-- Step 1: Add columns to transport_vehicles
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'transport_vehicles' AND column_name = 'operational_status'
  ) THEN
    ALTER TABLE public.transport_vehicles
      ADD COLUMN operational_status text NOT NULL DEFAULT 'boarding';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'transport_vehicles' AND column_name = 'departed_at'
  ) THEN
    ALTER TABLE public.transport_vehicles
      ADD COLUMN departed_at timestamptz;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'transport_vehicles' AND column_name = 'departed_by'
  ) THEN
    ALTER TABLE public.transport_vehicles
      ADD COLUMN departed_by uuid REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'transport_vehicles' AND column_name = 'cancelled_at'
  ) THEN
    ALTER TABLE public.transport_vehicles
      ADD COLUMN cancelled_at timestamptz;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'transport_vehicles' AND column_name = 'cancelled_by'
  ) THEN
    ALTER TABLE public.transport_vehicles
      ADD COLUMN cancelled_by uuid REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'transport_vehicles' AND column_name = 'cancellation_reason'
  ) THEN
    ALTER TABLE public.transport_vehicles
      ADD COLUMN cancellation_reason text;
  END IF;
END $$;

-- Status value constraint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.transport_vehicles'::regclass AND conname = 'tv_operational_status_check'
  ) THEN
    ALTER TABLE public.transport_vehicles
      ADD CONSTRAINT tv_operational_status_check
      CHECK (operational_status IN ('boarding', 'departed', 'cancelled'));
  END IF;
END $$;

-- Departed requires audit
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.transport_vehicles'::regclass AND conname = 'tv_departed_requires_audit'
  ) THEN
    ALTER TABLE public.transport_vehicles
      ADD CONSTRAINT tv_departed_requires_audit
      CHECK (
        CASE
          WHEN operational_status = 'departed' THEN departed_at IS NOT NULL AND departed_by IS NOT NULL
          ELSE departed_at IS NULL AND departed_by IS NULL
        END
      );
  END IF;
END $$;

-- Cancelled requires audit + reason
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.transport_vehicles'::regclass AND conname = 'tv_cancelled_requires_audit'
  ) THEN
    ALTER TABLE public.transport_vehicles
      ADD CONSTRAINT tv_cancelled_requires_audit
      CHECK (
        CASE
          WHEN operational_status = 'cancelled' THEN
            cancelled_at IS NOT NULL AND cancelled_by IS NOT NULL
            AND cancellation_reason IS NOT NULL AND length(trim(cancellation_reason)) >= 5
          ELSE cancelled_at IS NULL AND cancelled_by IS NULL AND cancellation_reason IS NULL
        END
      );
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Step 2: RPC transition_transport_vehicle
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.transition_transport_vehicle(
  p_vehicle_id uuid,
  p_action text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_event_id text;
  v_movement_id uuid;
  v_current_status text;
  v_label text;
  v_capacity int;
  v_occupants int;
  v_all_departed boolean;
  v_movement_status text;
  v_time_str text;
BEGIN
  -- Auth required
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Autenticazione richiesta.' USING ERRCODE = 'P0001';
  END IF;

  -- Validate action
  IF p_action IS NULL OR p_action NOT IN ('depart', 'cancel', 'reopen') THEN
    RAISE EXCEPTION 'Azione non valida.' USING ERRCODE = 'P0002';
  END IF;

  -- Lock and fetch vehicle
  SELECT tv.event_id, tv.movement_id, tv.operational_status, tv.label, tv.capacity
  INTO v_event_id, v_movement_id, v_current_status, v_label, v_capacity
  FROM transport_vehicles tv
  WHERE tv.id = p_vehicle_id
  FOR UPDATE;

  IF v_event_id IS NULL THEN
    RAISE EXCEPTION 'Veicolo non trovato.' USING ERRCODE = 'P0003';
  END IF;

  -- Authorization
  IF NOT has_event_permission(v_event_id, 'can_access_onsite')
     AND NOT has_event_permission(v_event_id, 'can_manage_registration') THEN
    RAISE EXCEPTION 'Permessi insufficienti per questa operazione.' USING ERRCODE = 'P0004';
  END IF;

  -- Count occupants (boarded on this vehicle in this movement)
  SELECT count(*) INTO v_occupants
  FROM transport_assignments
  WHERE vehicle_id = p_vehicle_id
    AND movement_id = v_movement_id
    AND assignment_status = 'boarded';

  -- ─── DEPART ──────────────────────────────────────────────────────────────
  IF p_action = 'depart' THEN
    IF v_current_status <> 'boarding' THEN
      RAISE EXCEPTION 'Il mezzo non è in fase di imbarco.' USING ERRCODE = 'P0005';
    END IF;

    UPDATE transport_vehicles
    SET operational_status = 'departed',
        departed_at = v_now,
        departed_by = v_uid,
        updated_at = v_now
    WHERE id = p_vehicle_id;

  -- ─── CANCEL ──────────────────────────────────────────────────────────────
  ELSIF p_action = 'cancel' THEN
    IF v_current_status = 'cancelled' THEN
      RAISE EXCEPTION 'Il mezzo è già annullato.' USING ERRCODE = 'P0006';
    END IF;

    IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
      RAISE EXCEPTION 'Motivo annullamento obbligatorio (min 5 caratteri).' USING ERRCODE = 'P0007';
    END IF;

    -- Clear departed audit if transitioning from departed to cancelled
    UPDATE transport_vehicles
    SET operational_status = 'cancelled',
        departed_at = NULL,
        departed_by = NULL,
        cancelled_at = v_now,
        cancelled_by = v_uid,
        cancellation_reason = trim(p_reason),
        updated_at = v_now
    WHERE id = p_vehicle_id;

  -- ─── REOPEN ──────────────────────────────────────────────────────────────
  ELSIF p_action = 'reopen' THEN
    IF v_current_status = 'boarding' THEN
      RAISE EXCEPTION 'Il mezzo è già in imbarco.' USING ERRCODE = 'P0008';
    END IF;

    UPDATE transport_vehicles
    SET operational_status = 'boarding',
        departed_at = NULL,
        departed_by = NULL,
        cancelled_at = NULL,
        cancelled_by = NULL,
        cancellation_reason = NULL,
        updated_at = v_now
    WHERE id = p_vehicle_id;
  END IF;

  -- ─── Movement auto-transition ───────────────────────────────────────────
  SELECT tm.movement_status INTO v_movement_status
  FROM transport_movements tm
  WHERE tm.id = v_movement_id
  FOR UPDATE;

  IF p_action = 'depart' OR p_action = 'cancel' THEN
    -- Check if all non-cancelled vehicles have departed
    SELECT NOT EXISTS (
      SELECT 1 FROM transport_vehicles
      WHERE movement_id = v_movement_id
        AND operational_status NOT IN ('departed', 'cancelled')
    ) INTO v_all_departed;

    IF v_all_departed AND v_movement_status NOT IN ('departed', 'cancelled') THEN
      UPDATE transport_movements
      SET movement_status = 'departed',
          closed_at = v_now,
          closed_by = v_uid,
          updated_at = v_now
      WHERE id = v_movement_id;
    END IF;
  ELSIF p_action = 'reopen' THEN
    -- Revert movement to open if it was departed
    IF v_movement_status = 'departed' THEN
      UPDATE transport_movements
      SET movement_status = 'open',
          closed_at = NULL,
          closed_by = NULL,
          updated_at = v_now
      WHERE id = v_movement_id;
    END IF;
  END IF;

  -- ─── Notifications ─────────────────────────────────────────────────────
  v_time_str := to_char(v_now AT TIME ZONE 'Europe/Rome', 'HH24:MI');

  INSERT INTO notifications (user_id, title, message, type, related_entity_type, related_entity_id)
  SELECT
    em.user_id,
    CASE p_action
      WHEN 'depart' THEN 'Mezzo partito'
      WHEN 'cancel' THEN 'Mezzo annullato'
      WHEN 'reopen' THEN 'Mezzo riaperto'
    END,
    CASE p_action
      WHEN 'depart' THEN v_label || ' partito alle ' || v_time_str || ' con ' || v_occupants || ' partecipanti a bordo.'
      WHEN 'cancel' THEN v_label || ' annullato alle ' || v_time_str || '.'
      WHEN 'reopen' THEN v_label || ' riaperto alle ' || v_time_str || '.'
    END,
    'transport_vehicle_status',
    'transport_vehicle',
    p_vehicle_id::text
  FROM event_members em
  WHERE em.event_id = v_event_id
    AND em.user_id <> v_uid;

  -- Return result
  RETURN jsonb_build_object(
    'vehicle_label', v_label,
    'action', p_action,
    'operational_status', CASE p_action
      WHEN 'depart' THEN 'departed'
      WHEN 'cancel' THEN 'cancelled'
      WHEN 'reopen' THEN 'boarding'
    END,
    'departed_at', CASE WHEN p_action = 'depart' THEN v_now ELSE NULL END,
    'occupants', v_occupants,
    'capacity', v_capacity
  );
END;
$$;

-- Revoke/grant
REVOKE ALL ON FUNCTION public.transition_transport_vehicle(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transition_transport_vehicle(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.transition_transport_vehicle(uuid, text, text) TO authenticated;
