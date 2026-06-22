-- Add venduto fields to event_supplier_services
ALTER TABLE event_supplier_services
  ADD COLUMN venduto_unitario numeric(10,2),
  ADD COLUMN venduto_totale numeric(10,2);

-- Add venduto fields to event_hotel_details
ALTER TABLE event_hotel_details
  ADD COLUMN venduto_unitario numeric(10,2),
  ADD COLUMN venduto_totale numeric(10,2);

-- Add real cost fields to event_restaurant_details (budget_per_persona/budget_totale = venduto)
ALTER TABLE event_restaurant_details
  ADD COLUMN costo_per_persona numeric(10,2),
  ADD COLUMN costo_totale_reale numeric(10,2);

-- Add Phase 2 fields to events (not yet visible in UI)
ALTER TABLE events
  ADD COLUMN fee_agenzia numeric(10,2),
  ADD COLUMN pm_fee numeric(10,2),
  ADD COLUMN markup_pct numeric(5,2),
  ADD COLUMN costi_staff_interni numeric(10,2);