-- Add cost fields to event_supplier_services
ALTER TABLE event_supplier_services
  ADD COLUMN costo_unitario numeric(10,2),
  ADD COLUMN quantita integer DEFAULT 1,
  ADD COLUMN costo_totale numeric(10,2);

-- Add cost fields to event_hotel_details
ALTER TABLE event_hotel_details
  ADD COLUMN costo_unitario numeric(10,2),
  ADD COLUMN costo_totale numeric(10,2);

-- Add ricavo_cliente to events
ALTER TABLE events
  ADD COLUMN ricavo_cliente numeric(10,2);