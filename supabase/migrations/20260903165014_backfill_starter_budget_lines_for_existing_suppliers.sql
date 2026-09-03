/*
# Backfill starter budget line rows for pre-existing event-supplier links

## Purpose
Before the automatic starter-row feature was added to confirmLink(), suppliers
linked to events had no corresponding row in their category detail table.
This one-time data migration retroactively creates those missing starter rows.

## What it does
For each row in event_suppliers whose service_category maps to one of the 12
handled category tables, inserts a minimal starter row into that table IF no
row already exists for that (event_id, supplier_id) pair.
The id column is omitted — every table has a gen_random_uuid() default.

## Category → table mapping
- hotel            → event_hotel_details          (extra: tipo = '')
- transfer         → event_supplier_services      (extra: titolo = '')
- ristorante       → event_restaurant_details
- experience       → event_experience_details
- catering         → event_catering_details
- audio_video      → event_audio_video_details
- allestimenti     → event_allestimenti_details
- staff_esterno    → event_staff_esterno_details
- grafica_stampa   → event_grafica_stampa_details
- assicurazioni    → event_assicurazioni_details  (no budget_version_id; supplier_id is uuid)
- agenzia_viaggi   → event_agenzia_viaggi_details (no budget_version_id; supplier_id is uuid)
- varie            → event_varie_details

## Deliberately skipped
- staff_interno — its detail table uses profile_id, not supplier_id

## Safety
- Idempotent: NOT EXISTS guards prevent duplicate rows on re-run.
- No schema changes (no ALTER TABLE, no DROP).
- No RLS policy changes.

## Notes
- event_suppliers.supplier_id is text; most detail tables also use text, but
  event_assicurazioni_details and event_agenzia_viaggi_details use uuid, so
  explicit casts are applied for those two tables. Rows whose supplier_id is
  not a valid UUID are skipped for those two categories.
*/

-- 1. hotel → event_hotel_details (needs tipo)
INSERT INTO event_hotel_details (event_id, supplier_id, budget_version_id, tipo)
SELECT
  es.event_id,
  es.supplier_id,
  (SELECT bv.id FROM budget_versions bv WHERE bv.event_id = es.event_id ORDER BY bv.created_at ASC LIMIT 1),
  ''
FROM event_suppliers es
WHERE es.service_category = 'hotel'
  AND NOT EXISTS (
    SELECT 1 FROM event_hotel_details d
    WHERE d.event_id = es.event_id AND d.supplier_id = es.supplier_id
  );

-- 2. transfer → event_supplier_services (needs titolo)
INSERT INTO event_supplier_services (event_id, supplier_id, budget_version_id, titolo)
SELECT
  es.event_id,
  es.supplier_id,
  (SELECT bv.id FROM budget_versions bv WHERE bv.event_id = es.event_id ORDER BY bv.created_at ASC LIMIT 1),
  ''
FROM event_suppliers es
WHERE es.service_category = 'transfer'
  AND NOT EXISTS (
    SELECT 1 FROM event_supplier_services d
    WHERE d.event_id = es.event_id AND d.supplier_id = es.supplier_id
  );

-- 3. ristorante → event_restaurant_details
INSERT INTO event_restaurant_details (event_id, supplier_id, budget_version_id)
SELECT
  es.event_id,
  es.supplier_id,
  (SELECT bv.id FROM budget_versions bv WHERE bv.event_id = es.event_id ORDER BY bv.created_at ASC LIMIT 1)
FROM event_suppliers es
WHERE es.service_category = 'ristorante'
  AND NOT EXISTS (
    SELECT 1 FROM event_restaurant_details d
    WHERE d.event_id = es.event_id AND d.supplier_id = es.supplier_id
  );

-- 4. experience → event_experience_details
INSERT INTO event_experience_details (event_id, supplier_id, budget_version_id)
SELECT
  es.event_id,
  es.supplier_id,
  (SELECT bv.id FROM budget_versions bv WHERE bv.event_id = es.event_id ORDER BY bv.created_at ASC LIMIT 1)
FROM event_suppliers es
WHERE es.service_category = 'experience'
  AND NOT EXISTS (
    SELECT 1 FROM event_experience_details d
    WHERE d.event_id = es.event_id AND d.supplier_id = es.supplier_id
  );

-- 5. catering → event_catering_details
INSERT INTO event_catering_details (event_id, supplier_id, budget_version_id)
SELECT
  es.event_id,
  es.supplier_id,
  (SELECT bv.id FROM budget_versions bv WHERE bv.event_id = es.event_id ORDER BY bv.created_at ASC LIMIT 1)
FROM event_suppliers es
WHERE es.service_category = 'catering'
  AND NOT EXISTS (
    SELECT 1 FROM event_catering_details d
    WHERE d.event_id = es.event_id AND d.supplier_id = es.supplier_id
  );

-- 6. audio_video → event_audio_video_details
INSERT INTO event_audio_video_details (event_id, supplier_id, budget_version_id)
SELECT
  es.event_id,
  es.supplier_id,
  (SELECT bv.id FROM budget_versions bv WHERE bv.event_id = es.event_id ORDER BY bv.created_at ASC LIMIT 1)
FROM event_suppliers es
WHERE es.service_category = 'audio_video'
  AND NOT EXISTS (
    SELECT 1 FROM event_audio_video_details d
    WHERE d.event_id = es.event_id AND d.supplier_id = es.supplier_id
  );

-- 7. allestimenti → event_allestimenti_details
INSERT INTO event_allestimenti_details (event_id, supplier_id, budget_version_id)
SELECT
  es.event_id,
  es.supplier_id,
  (SELECT bv.id FROM budget_versions bv WHERE bv.event_id = es.event_id ORDER BY bv.created_at ASC LIMIT 1)
FROM event_suppliers es
WHERE es.service_category = 'allestimenti'
  AND NOT EXISTS (
    SELECT 1 FROM event_allestimenti_details d
    WHERE d.event_id = es.event_id AND d.supplier_id = es.supplier_id
  );

-- 8. staff_esterno → event_staff_esterno_details
INSERT INTO event_staff_esterno_details (event_id, supplier_id, budget_version_id)
SELECT
  es.event_id,
  es.supplier_id,
  (SELECT bv.id FROM budget_versions bv WHERE bv.event_id = es.event_id ORDER BY bv.created_at ASC LIMIT 1)
FROM event_suppliers es
WHERE es.service_category = 'staff_esterno'
  AND NOT EXISTS (
    SELECT 1 FROM event_staff_esterno_details d
    WHERE d.event_id = es.event_id AND d.supplier_id = es.supplier_id
  );

-- 9. grafica_stampa → event_grafica_stampa_details
INSERT INTO event_grafica_stampa_details (event_id, supplier_id, budget_version_id)
SELECT
  es.event_id,
  es.supplier_id,
  (SELECT bv.id FROM budget_versions bv WHERE bv.event_id = es.event_id ORDER BY bv.created_at ASC LIMIT 1)
FROM event_suppliers es
WHERE es.service_category = 'grafica_stampa'
  AND NOT EXISTS (
    SELECT 1 FROM event_grafica_stampa_details d
    WHERE d.event_id = es.event_id AND d.supplier_id = es.supplier_id
  );

-- 10. assicurazioni → event_assicurazioni_details (no budget_version_id; supplier_id is uuid)
INSERT INTO event_assicurazioni_details (event_id, supplier_id)
SELECT
  es.event_id,
  es.supplier_id::uuid
FROM event_suppliers es
WHERE es.service_category = 'assicurazioni'
  AND es.supplier_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND NOT EXISTS (
    SELECT 1 FROM event_assicurazioni_details d
    WHERE d.event_id = es.event_id AND d.supplier_id = es.supplier_id::uuid
  );

-- 11. agenzia_viaggi → event_agenzia_viaggi_details (no budget_version_id; supplier_id is uuid)
INSERT INTO event_agenzia_viaggi_details (event_id, supplier_id)
SELECT
  es.event_id,
  es.supplier_id::uuid
FROM event_suppliers es
WHERE es.service_category = 'agenzia_viaggi'
  AND es.supplier_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND NOT EXISTS (
    SELECT 1 FROM event_agenzia_viaggi_details d
    WHERE d.event_id = es.event_id AND d.supplier_id = es.supplier_id::uuid
  );

-- 12. varie → event_varie_details
INSERT INTO event_varie_details (event_id, supplier_id, budget_version_id)
SELECT
  es.event_id,
  es.supplier_id,
  (SELECT bv.id FROM budget_versions bv WHERE bv.event_id = es.event_id ORDER BY bv.created_at ASC LIMIT 1)
FROM event_suppliers es
WHERE es.service_category = 'varie'
  AND NOT EXISTS (
    SELECT 1 FROM event_varie_details d
    WHERE d.event_id = es.event_id AND d.supplier_id = es.supplier_id
  );
