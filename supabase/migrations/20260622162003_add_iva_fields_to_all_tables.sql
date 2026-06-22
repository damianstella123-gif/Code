-- ═══════════════════════════════════════════════════════════════
-- Add IVA fields to ALL existing service tables
-- ═══════════════════════════════════════════════════════════════

-- event_supplier_services (Transfer, generic)
ALTER TABLE event_supplier_services
  ADD COLUMN IF NOT EXISTS aliquota_iva_venduto text NOT NULL DEFAULT '22',
  ADD COLUMN IF NOT EXISTS iva_inclusa_venduto boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS aliquota_iva_costo text NOT NULL DEFAULT '22',
  ADD COLUMN IF NOT EXISTS iva_inclusa_costo boolean NOT NULL DEFAULT false;

-- event_hotel_details
ALTER TABLE event_hotel_details
  ADD COLUMN IF NOT EXISTS aliquota_iva_venduto text NOT NULL DEFAULT '10',
  ADD COLUMN IF NOT EXISTS iva_inclusa_venduto boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS aliquota_iva_costo text NOT NULL DEFAULT '10',
  ADD COLUMN IF NOT EXISTS iva_inclusa_costo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS natural_light_preference boolean,
  ADD COLUMN IF NOT EXISTS coffee_break_time time,
  ADD COLUMN IF NOT EXISTS coffee_break_notes text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS lunch_time time,
  ADD COLUMN IF NOT EXISTS lunch_notes text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS dinner_time time,
  ADD COLUMN IF NOT EXISTS dinner_notes text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS coffee_station_notes text NOT NULL DEFAULT '';

-- event_restaurant_details
ALTER TABLE event_restaurant_details
  ADD COLUMN IF NOT EXISTS aliquota_iva_venduto text NOT NULL DEFAULT '10',
  ADD COLUMN IF NOT EXISTS iva_inclusa_venduto boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS aliquota_iva_costo text NOT NULL DEFAULT '10',
  ADD COLUMN IF NOT EXISTS iva_inclusa_costo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS beverage_incluso boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sala_privata boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS esclusiva_parziale boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS esclusiva_totale boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS nome_sala text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS note_location text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS richieste_alimentari text NOT NULL DEFAULT '';

-- event_experience_details
ALTER TABLE event_experience_details
  ADD COLUMN IF NOT EXISTS aliquota_iva_venduto text NOT NULL DEFAULT '22',
  ADD COLUMN IF NOT EXISTS iva_inclusa_venduto boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS aliquota_iva_costo text NOT NULL DEFAULT '22',
  ADD COLUMN IF NOT EXISTS iva_inclusa_costo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tipologia text NOT NULL DEFAULT '';

-- event_catering_details
ALTER TABLE event_catering_details
  ADD COLUMN IF NOT EXISTS aliquota_iva_venduto text NOT NULL DEFAULT '10',
  ADD COLUMN IF NOT EXISTS iva_inclusa_venduto boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS aliquota_iva_costo text NOT NULL DEFAULT '10',
  ADD COLUMN IF NOT EXISTS iva_inclusa_costo boolean NOT NULL DEFAULT false;

-- event_staff_interno_details
ALTER TABLE event_staff_interno_details
  ADD COLUMN IF NOT EXISTS aliquota_iva_venduto text NOT NULL DEFAULT '22',
  ADD COLUMN IF NOT EXISTS iva_inclusa_venduto boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS aliquota_iva_costo text NOT NULL DEFAULT '22',
  ADD COLUMN IF NOT EXISTS iva_inclusa_costo boolean NOT NULL DEFAULT false;

-- event_staff_esterno_details
ALTER TABLE event_staff_esterno_details
  ADD COLUMN IF NOT EXISTS aliquota_iva_venduto text NOT NULL DEFAULT '22',
  ADD COLUMN IF NOT EXISTS iva_inclusa_venduto boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS aliquota_iva_costo text NOT NULL DEFAULT '22',
  ADD COLUMN IF NOT EXISTS iva_inclusa_costo boolean NOT NULL DEFAULT false;

-- event_varie_details
ALTER TABLE event_varie_details
  ADD COLUMN IF NOT EXISTS aliquota_iva_venduto text NOT NULL DEFAULT '22',
  ADD COLUMN IF NOT EXISTS iva_inclusa_venduto boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS aliquota_iva_costo text NOT NULL DEFAULT '22',
  ADD COLUMN IF NOT EXISTS iva_inclusa_costo boolean NOT NULL DEFAULT false;