/*
# Add vehicle arrived status and update transition RPC

## Summary
Extends transport_vehicles with an 'arrived' operational status and arrival audit
columns. Updates constraints and the transition_transport_vehicle RPC to support
the new 'arrive' action. Notifications are sent on arrival.

## Modified Tables
- `transport_vehicles`
  - `operational_status`: added 'arrived' to allowed values
  - `arrived_at` timestamptz nullable — server time on arrival
  - `arrived_by` uuid nullable FK profiles(id) — who marked arrival

## Updated Constraints
- `tv_operational_status_check`: added 'arrived'
- `tv_departed_requires_audit`: departed OR arrived require departed_at/departed_by;
  boarding and cancelled must have them NULL
- NEW `tv_arrived_requires_audit`: arrived requires arrived_at/arrived_by;
  all other statuses must have them NULL

## Updated Functions
- `transition_transport_vehicle`: added 'arrive' action
  - arrive: only from departed; sets arrived status, arrived_at=now(), arrived_by=auth.uid()
  - cancel: also allowed from 'arrived'; clears departure AND arrival audit
  - reopen: also allowed from 'arrived'; clears departure AND arrival audit
  - Movement auto-transition: 'arrived' counts as "done" alongside 'departed' for
    the all-departed check

## Notifications
- On arrive: "{label} arrivato alle HH:mm." sent to event members

## Security
- No changes to signature, SECURITY DEFINER, or grants
*/

-- ═══════════════════════════════════════════════════════════════════════════════
-- Step 1: Add arrived columns
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'transport_vehicles' AND column_name = 'arrived_at'
  ) THEN
    ALTER TABLE public.transport_vehicles
      ADD COLUMN arrived_at timestamptz;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'transport_vehicles' AND column_name = 'arrived_by'
  ) THEN
    ALTER TABLE public.transport_vehicles
      ADD COLUMN arrived_by uuid REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Step 2: Update constraints
-- ═══════════════════════════════════════════════════════════════════════════════

-- Drop and recreate status check
ALTER TABLE public.transport_vehicles DROP CONSTRAINT IF EXISTS tv_operational_status_check;
ALTER TABLE public.transport_vehicles
  ADD CONSTRAINT tv_operational_status_check
  CHECK (operational_status IN ('boarding', 'departed', 'arrived', 'cancelled'));

-- Drop and recreate departed audit constraint
-- New logic: departed_at/departed_by required when status is 'departed' or 'arrived';
-- null otherwise (boarding, cancelled)
ALTER TABLE public.transport_vehicles DROP CONSTRAINT IF EXISTS tv_departed_requires_audit;
ALTER TABLE public.transport_vehicles
  ADD CONSTRAINT tv_departed_requires_audit
  CHECK (
    CASE
      WHEN operational_status IN ('departed', 'arrived') THEN
        departed_at IS NOT NULL AND departed_by IS NOT NULL
      ELSE
        departed_at IS NULL AND departed_by IS NULL
    END
  );

-- Arrived audit constraint: arrived_at/arrived_by required only when 'arrived'
ALTER TABLE public.transport_vehicles DROP CONSTRAINT IF EXISTS tv_arrived_requires_audit;
ALTER TABLE public.transport_vehicles
  ADD CONSTRAINT tv_arrived_requires_audit
  CHECK (
    CASE
      WHEN operational_status = 'arrived' THEN
        arrived_at IS NOT NULL AND arrived_by IS NOT NULL
      ELSE
        arrived_at IS NULL AND arrived_by IS NULL
    END
  );

-- Cancelled constraint stays the same but re-apply to be safe with dropped audit fields
ALTER TABLE public.transport_vehicles DROP CONSTRAINT IF EXISTS tv_cancelled_requires_audit;
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

-- ═══════════════════════════════════════════════════════════════════════════════
-- Step 3: Replace transition_transport_vehicle with arrive support
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
  v_all_done boolean;
  v_movement_status text;
  v_time_str text;
  v_new_status text;
BEGIN
  -- Auth required
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Autenticazione richiesta.' USING ERRCODE = 'P0001';
  END IF;

  -- Validate action
  IF p_action IS NULL OR p_action NOT IN ('depart', 'cancel', 'reopen', 'arrive') THEN
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

    v_new_status := 'departed';

  -- ─── ARRIVE ──────────────────────────────────────────────────────────────
  ELSIF p_action = 'arrive' THEN
    IF v_current_status <> 'departed' THEN
      RAISE EXCEPTION 'Il mezzo non è in stato partito.' USING ERRCODE = 'P0009';
    END IF;

    UPDATE transport_vehicles
    SET operational_status = 'arrived',
        arrived_at = v_now,
        arrived_by = v_uid,
        updated_at = v_now
    WHERE id = p_vehicle_id;

    v_new_status := 'arrived';

  -- ─── CANCEL ──────────────────────────────────────────────────────────────
  ELSIF p_action = 'cancel' THEN
    IF v_current_status = 'cancelled' THEN
      RAISE EXCEPTION 'Il mezzo è già annullato.' USING ERRCODE = 'P0006';
    END IF;

    IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
      RAISE EXCEPTION 'Motivo annullamento obbligatorio (min 5 caratteri).' USING ERRCODE = 'P0007';
    END IF;

    -- Clear departed AND arrived audit
    UPDATE transport_vehicles
    SET operational_status = 'cancelled',
        departed_at = NULL,
        departed_by = NULL,
        arrived_at = NULL,
        arrived_by = NULL,
        cancelled_at = v_now,
        cancelled_by = v_uid,
        cancellation_reason = trim(p_reason),
        updated_at = v_now
    WHERE id = p_vehicle_id;

    v_new_status := 'cancelled';

  -- ─── REOPEN ──────────────────────────────────────────────────────────────
  ELSIF p_action = 'reopen' THEN
    IF v_current_status = 'boarding' THEN
      RAISE EXCEPTION 'Il mezzo è già in imbarco.' USING ERRCODE = 'P0008';
    END IF;

    -- Clear departed AND arrived audit
    UPDATE transport_vehicles
    SET operational_status = 'boarding',
        departed_at = NULL,
        departed_by = NULL,
        arrived_at = NULL,
        arrived_by = NULL,
        cancelled_at = NULL,
        cancelled_by = NULL,
        cancellation_reason = NULL,
        updated_at = v_now
    WHERE id = p_vehicle_id;

    v_new_status := 'boarding';
  END IF;

  -- ─── Movement auto-transition ───────────────────────────────────────────
  SELECT tm.movement_status INTO v_movement_status
  FROM transport_movements tm
  WHERE tm.id = v_movement_id
  FOR UPDATE;

  IF p_action IN ('depart', 'cancel', 'arrive') THEN
    -- Check if all non-cancelled vehicles are done (departed or arrived)
    SELECT NOT EXISTS (
      SELECT 1 FROM transport_vehicles
      WHERE movement_id = v_movement_id
        AND operational_status NOT IN ('departed', 'arrived', 'cancelled')
    ) INTO v_all_done;

    IF v_all_done AND v_movement_status NOT IN ('departed', 'cancelled') THEN
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
      WHEN 'arrive' THEN 'Mezzo arrivato'
      WHEN 'cancel' THEN 'Mezzo annullato'
      WHEN 'reopen' THEN 'Mezzo riaperto'
    END,
    CASE p_action
      WHEN 'depart' THEN v_label || ' partito alle ' || v_time_str || ' con ' || v_occupants || ' partecipanti a bordo.'
      WHEN 'arrive' THEN v_label || ' arrivato alle ' || v_time_str || '.'
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
    'operational_status', v_new_status,
    'departed_at', CASE WHEN v_new_status IN ('departed', 'arrived') THEN
      (SELECT tv2.departed_at FROM transport_vehicles tv2 WHERE tv2.id = p_vehicle_id)
    ELSE NULL END,
    'arrived_at', CASE WHEN v_new_status = 'arrived' THEN v_now ELSE NULL END,
    'occupants', v_occupants,
    'capacity', v_capacity
  );
END;
$$;

-- Revoke/grant (same signature, idempotent)
REVOKE ALL ON FUNCTION public.transition_transport_vehicle(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transition_transport_vehicle(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.transition_transport_vehicle(uuid, text, text) TO authenticated;
