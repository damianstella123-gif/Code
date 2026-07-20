/*
# Remove stray policies from fly_memory table

The admin_* and authenticated_select policies were incorrectly applied
to the per-user fly_memory table. They belong on fly_persistent_memory
instead. This removes them to restore the original policy set.
*/

DROP POLICY IF EXISTS "admin_delete_fly_memory" ON fly_memory;
DROP POLICY IF EXISTS "admin_insert_fly_memory" ON fly_memory;
DROP POLICY IF EXISTS "admin_update_fly_memory" ON fly_memory;
DROP POLICY IF EXISTS "authenticated_select_fly_memory" ON fly_memory;
