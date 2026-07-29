/*
# Create public badge program RPC

## Purpose
Read-only RPC callable by anon and authenticated users that, given a valid
qr_token from a confirmed event registration, returns safe public event
metadata, registration-site branding, and the live event program — without
exposing any PII, internal notes, supplier details, or registration data.

## New Functions
- `get_badge_program(p_qr_token text) → jsonb`
  - SECURITY DEFINER, search_path = public, pg_temp
  - Validates token as UUID; returns NULL for any invalid, missing, unknown,
    waitlist, cancelled, or non-confirmed token (uniform null — no information
    leakage about token existence).
  - Returns: { event, branding, program[] } with English keys mapped from
    Italian DB columns.
  - Program items LEFT JOIN onsite_program_status for live status fields.
  - Excludes: note, supplier_id, servizio, pax, onsite_note, updated_by,
    all PII, costs, contacts, and audit fields.

## Security
- Granted to anon AND authenticated.
- Pure read — no INSERT/UPDATE/DELETE.
- No logging of token lookups.
- Uniform NULL return prevents token-existence enumeration.

## Important Notes
1. Does NOT modify any existing RPC, table, policy, or trigger.
2. Existing check-in RPCs and raw-UUID QR flow are fully preserved.
3. Idempotent — safe to re-run (DROP IF EXISTS before CREATE).
*/

-- Drop if exists for idempotency
DROP FUNCTION IF EXISTS get_badge_program(text);

CREATE OR REPLACE FUNCTION get_badge_program(p_qr_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_token      uuid;
  v_event_id   text;
  v_site_id    uuid;
  v_event      jsonb;
  v_branding   jsonb;
  v_program    jsonb;
BEGIN
  -- 1. Safely cast to UUID; return NULL on any malformed input
  BEGIN
    v_token := p_qr_token::uuid;
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;

  -- 2. Look up confirmed registration; uniform NULL for anything else
  SELECT er.event_id, er.site_id
    INTO v_event_id, v_site_id
    FROM event_registrations er
   WHERE er.qr_token = v_token
     AND er.registration_status = 'confirmed';

  IF v_event_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- 3. Build event object (safe fields only)
  SELECT jsonb_build_object(
           'id',         e.id,
           'title',      e.title,
           'start_date', e.start_date,
           'end_date',   e.end_date,
           'location',   e.location
         )
    INTO v_event
    FROM events e
   WHERE e.id = v_event_id;

  IF v_event IS NULL THEN
    RETURN NULL;
  END IF;

  -- 4. Build branding from the registration site (null-safe)
  IF v_site_id IS NOT NULL THEN
    SELECT jsonb_build_object(
             'logo_url',       COALESCE(rs.logo_url, ''),
             'hero_image_url', COALESCE(rs.hero_image_url, ''),
             'theme',          COALESCE(rs.theme, '{}'::jsonb)
           )
      INTO v_branding
      FROM registration_sites rs
     WHERE rs.id = v_site_id;
  END IF;

  IF v_branding IS NULL THEN
    v_branding := jsonb_build_object(
      'logo_url',       '',
      'hero_image_url', '',
      'theme',          '{}'::jsonb
    );
  END IF;

  -- 5. Build program array with live status (safe fields only, English keys)
  SELECT COALESCE(jsonb_agg(item ORDER BY item->>'date', item->>'start_time', item->>'sort_order'), '[]'::jsonb)
    INTO v_program
    FROM (
      SELECT jsonb_build_object(
               'id',            ep.id,
               'title',         ep.titolo,
               'category',      ep.categoria,
               'date',          ep.data,
               'end_date',      ep.data_fine,
               'start_time',    ep.ora_inizio,
               'end_time',      ep.ora_fine,
               'location',      ep.luogo,
               'sort_order',    ep.sort_order,
               'live_status',   COALESCE(ops.onsite_status, 'planned'),
               'actual_start',  ops.actual_start,
               'actual_end',    ops.actual_end,
               'delay_minutes', COALESCE(ops.delay_minutes, 0)
             ) AS item
        FROM event_program ep
        LEFT JOIN onsite_program_status ops
          ON ops.program_item_id = ep.id
       WHERE ep.event_id = v_event_id
    ) sub;

  -- 6. Return assembled response
  RETURN jsonb_build_object(
    'event',    v_event,
    'branding', v_branding,
    'program',  v_program
  );
END;
$$;

-- Grants: callable by both anon (public badge page) and authenticated users
REVOKE EXECUTE ON FUNCTION get_badge_program(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION get_badge_program(text) TO anon, authenticated;
