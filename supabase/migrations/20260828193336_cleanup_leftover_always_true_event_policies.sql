/*
# Clean up remaining always-true policies on event tables

Removes leftover "always true" policies that existed under different names
than those dropped in the main Batch 4 migration. These are now superseded
by the hardened can_access_event(event_id) policies already in place.

Affected tables: event_green_data, event_program, event_restaurant_details,
event_supplier_services, event_suppliers.
*/

-- event_green_data: remove old always-true policies
DROP POLICY IF EXISTS "authenticated_insert_green_data" ON event_green_data;
DROP POLICY IF EXISTS "authenticated_update_green_data" ON event_green_data;
DROP POLICY IF EXISTS "authenticated_delete_green_data" ON event_green_data;

-- event_program: remove old always-true UPDATE
DROP POLICY IF EXISTS "event_program_update_authenticated" ON event_program;

-- event_restaurant_details: remove old always-true policies
DROP POLICY IF EXISTS "insert_restaurant_details" ON event_restaurant_details;
DROP POLICY IF EXISTS "update_restaurant_details" ON event_restaurant_details;
DROP POLICY IF EXISTS "delete_restaurant_details" ON event_restaurant_details;

-- event_supplier_services: remove old always-true UPDATE
DROP POLICY IF EXISTS "event_supplier_services_update_authenticated" ON event_supplier_services;

-- event_suppliers: remove old always-true UPDATE
DROP POLICY IF EXISTS "event_suppliers_update_authenticated" ON event_suppliers;
