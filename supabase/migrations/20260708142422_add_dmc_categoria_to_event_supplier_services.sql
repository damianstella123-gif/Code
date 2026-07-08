/*
# Add DMC category column to event_supplier_services

1. Modified Tables
  - `event_supplier_services`
    - Added `dmc_categoria` (text, nullable) - categorizes services when the supplier is a DMC
    - Allowed values: 'hotel', 'voli', 'transfer', 'location', 'attivita', 'fee_dmc', 'altro'

2. Purpose
  - When a DMC (Destination Management Company) supplier is linked to an event, 
    their individual service lines need categorization for proper economic breakdown
  - Enables per-category cost aggregation (Hotel, Flights, Transfers, etc.)
  - Supports double-counting detection when separate suppliers exist for same categories

3. Important Notes
  - Column is nullable: non-DMC suppliers simply leave it NULL
  - No CHECK constraint added to keep flexibility for future categories
*/

ALTER TABLE event_supplier_services ADD COLUMN IF NOT EXISTS dmc_categoria text;
