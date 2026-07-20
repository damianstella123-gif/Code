/*
# Create normalized transport foundation tables

## Summary
Creates three tables for concurrent bus/vehicle operations at events:
transport_movements (trip/run definitions), transport_vehicles (vehicles per movement),
and transport_assignments (participant-to-vehicle assignments with boarding state).

## New Tables

### transport_movements
- id (uuid, PK)
- event_id (text, FK events, NOT NULL)
- label (text, NOT NULL) - human-readable name e.g. "Transfer Hotel-Venue AM"
- movement_type (text) - arrival/departure/transfer/shuttle/other
- departure_at (timestamptz, nullable) - scheduled departure
- origin (text) - departure location name
- destination (text) - arrival location name
- movement_status (text) - draft/open/closed/departed/cancelled
- closed_at / closed_by - manifest closure audit fields
- created_by (uuid, FK profiles) - who created the movement
- created_at / updated_at

### transport_vehicles
- id (uuid, PK)
- event_id (text, NOT NULL)
- movement_id (uuid, NOT NULL) - composite FK to movement
- label (text) - e.g. "Bus A", "Navetta 1"
- vehicle_type (text) - bus/minibus/van/car/other
- capacity (integer, nullable)
- plate, driver_name, driver_phone - operational info
- sort_order (integer)

### transport_assignments
- id (uuid, PK)
- event_id (text, NOT NULL)
- movement_id (uuid, NOT NULL)
- vehicle_id (uuid, NOT NULL) - composite FK to vehicle
- registration_id (uuid, NOT NULL) - composite FK to event_registrations
- assignment_status (text) - assigned/boarded/no_show/cancelled
- boarded_at / boarded_by - boarding timestamp + operator
- last_moved_at / last_moved_by / previous_vehicle_id - move audit trail
- notes (text)
- created_by (uuid, FK profiles)
- UNIQUE(movement_id, registration_id) - one assignment per participant per movement

## Modified Tables
- event_registrations: added UNIQUE(id, event_id) to support composite FK from transport_assignments

## Security
- RLS enabled on all three tables.
- SELECT-only policies gated by can_access_event(event_id) for authenticated users.
- No INSERT/UPDATE/DELETE policies — writes will go through validated RPCs.

## Important Notes
1. Composite FKs ensure event_id consistency across the hierarchy.
2. CHECK constraints enforce state machine rules (boarded requires timestamps, etc.).
3. No existing data, RPCs, RLS policies, or frontend code is modified.
*/

-- ═══════════════════════════════════════════════════════════════════════════════
-- Supporting unique constraint on event_registrations for composite FK
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'event_registrations'::regclass
    AND conname = 'event_registrations_id_event_id_key'
  ) THEN
    ALTER TABLE event_registrations
      ADD CONSTRAINT event_registrations_id_event_id_key UNIQUE (id, event_id);
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- transport_movements
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS transport_movements (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      text NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  label         text NOT NULL,
  movement_type text NOT NULL DEFAULT 'transfer'
    CONSTRAINT tm_movement_type_check CHECK (movement_type IN ('arrival','departure','transfer','shuttle','other')),
  departure_at  timestamptz,
  origin        text NOT NULL DEFAULT '',
  destination   text NOT NULL DEFAULT '',
  movement_status text NOT NULL DEFAULT 'draft'
    CONSTRAINT tm_status_check CHECK (movement_status IN ('draft','open','closed','departed','cancelled')),
  closed_at     timestamptz,
  closed_by     uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_by    uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT tm_id_event_id_key UNIQUE (id, event_id),

  CONSTRAINT tm_closed_requires_audit CHECK (
    CASE WHEN movement_status IN ('closed','departed')
      THEN closed_at IS NOT NULL AND closed_by IS NOT NULL
      ELSE true
    END
  )
);

CREATE INDEX IF NOT EXISTS idx_tm_event_id ON transport_movements(event_id);
CREATE INDEX IF NOT EXISTS idx_tm_departure_at ON transport_movements(departure_at);
CREATE INDEX IF NOT EXISTS idx_tm_status ON transport_movements(movement_status);

DROP TRIGGER IF EXISTS trg_transport_movements_updated_at ON transport_movements;
CREATE TRIGGER trg_transport_movements_updated_at
  BEFORE UPDATE ON transport_movements
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════════
-- transport_vehicles
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS transport_vehicles (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     text NOT NULL,
  movement_id  uuid NOT NULL,
  label        text NOT NULL,
  vehicle_type text NOT NULL DEFAULT 'bus'
    CONSTRAINT tv_vehicle_type_check CHECK (vehicle_type IN ('bus','minibus','van','car','other')),
  capacity     integer CONSTRAINT tv_capacity_positive CHECK (capacity > 0),
  plate        text NOT NULL DEFAULT '',
  driver_name  text NOT NULL DEFAULT '',
  driver_phone text NOT NULL DEFAULT '',
  sort_order   integer NOT NULL DEFAULT 0 CONSTRAINT tv_sort_order_gte0 CHECK (sort_order >= 0),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT tv_movement_fk FOREIGN KEY (movement_id, event_id)
    REFERENCES transport_movements(id, event_id) ON DELETE CASCADE,

  CONSTRAINT tv_movement_label_key UNIQUE (movement_id, label),
  CONSTRAINT tv_id_movement_event_key UNIQUE (id, movement_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_tv_movement_id ON transport_vehicles(movement_id);
CREATE INDEX IF NOT EXISTS idx_tv_event_id ON transport_vehicles(event_id);

DROP TRIGGER IF EXISTS trg_transport_vehicles_updated_at ON transport_vehicles;
CREATE TRIGGER trg_transport_vehicles_updated_at
  BEFORE UPDATE ON transport_vehicles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════════
-- transport_assignments
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS transport_assignments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id            text NOT NULL,
  movement_id         uuid NOT NULL,
  vehicle_id          uuid NOT NULL,
  registration_id     uuid NOT NULL,
  assignment_status   text NOT NULL DEFAULT 'assigned'
    CONSTRAINT ta_status_check CHECK (assignment_status IN ('assigned','boarded','no_show','cancelled')),
  boarded_at          timestamptz,
  boarded_by          uuid REFERENCES profiles(id) ON DELETE SET NULL,
  last_moved_at       timestamptz,
  last_moved_by       uuid REFERENCES profiles(id) ON DELETE SET NULL,
  previous_vehicle_id uuid,
  notes               text NOT NULL DEFAULT '',
  created_by          uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ta_movement_fk FOREIGN KEY (movement_id, event_id)
    REFERENCES transport_movements(id, event_id) ON DELETE CASCADE,

  CONSTRAINT ta_vehicle_fk FOREIGN KEY (vehicle_id, movement_id, event_id)
    REFERENCES transport_vehicles(id, movement_id, event_id) ON DELETE CASCADE,

  CONSTRAINT ta_registration_fk FOREIGN KEY (registration_id, event_id)
    REFERENCES event_registrations(id, event_id) ON DELETE CASCADE,

  CONSTRAINT ta_one_per_movement UNIQUE (movement_id, registration_id),

  CONSTRAINT ta_boarded_requires_audit CHECK (
    CASE WHEN assignment_status = 'boarded'
      THEN boarded_at IS NOT NULL AND boarded_by IS NOT NULL
      ELSE boarded_at IS NULL AND boarded_by IS NULL
    END
  ),

  CONSTRAINT ta_previous_vehicle_differs CHECK (
    previous_vehicle_id IS NULL OR previous_vehicle_id <> vehicle_id
  )
);

CREATE INDEX IF NOT EXISTS idx_ta_movement_id ON transport_assignments(movement_id);
CREATE INDEX IF NOT EXISTS idx_ta_vehicle_id ON transport_assignments(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_ta_registration_id ON transport_assignments(registration_id);
CREATE INDEX IF NOT EXISTS idx_ta_event_id ON transport_assignments(event_id);

DROP TRIGGER IF EXISTS trg_transport_assignments_updated_at ON transport_assignments;
CREATE TRIGGER trg_transport_assignments_updated_at
  BEFORE UPDATE ON transport_assignments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════════
-- RLS: Enable + SELECT-only policies
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE transport_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE transport_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE transport_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tm_select_event_access" ON transport_movements;
CREATE POLICY "tm_select_event_access" ON transport_movements
  FOR SELECT TO authenticated
  USING (can_access_event(event_id));

DROP POLICY IF EXISTS "tv_select_event_access" ON transport_vehicles;
CREATE POLICY "tv_select_event_access" ON transport_vehicles
  FOR SELECT TO authenticated
  USING (can_access_event(event_id));

DROP POLICY IF EXISTS "ta_select_event_access" ON transport_assignments;
CREATE POLICY "ta_select_event_access" ON transport_assignments
  FOR SELECT TO authenticated
  USING (can_access_event(event_id));