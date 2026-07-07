/*
# Create audit_log table and triggers for critical action tracking

## Summary
Adds an audit trail that automatically logs destructive/sensitive operations
(DELETE on events, tasks, clients, suppliers, budgets; UPDATE/DELETE on budgets;
UPDATE on profiles.role). A PostgreSQL trigger function captures the acting user,
table name, record ID, and the full old/new row data as JSONB.

## New Tables
- `audit_log`
  - `id` (uuid, primary key, auto-generated)
  - `created_at` (timestamptz, default now())
  - `user_id` (uuid, the auth user who performed the action)
  - `user_email` (text, denormalized for display)
  - `action` (text, not null — 'INSERT', 'UPDATE', or 'DELETE')
  - `table_name` (text, source table)
  - `record_id` (text, the primary key of the affected record)
  - `old_data` (jsonb, full row before the change)
  - `new_data` (jsonb, full row after the change, null for DELETE)

## Security
- RLS enabled on audit_log.
- INSERT: any authenticated user (triggers run as the session user).
- SELECT: only Admin / Super Admin via get_my_role().
- UPDATE/DELETE: denied (audit logs are immutable).

## Triggers Created
- `audit_events_delete` — AFTER DELETE on events
- `audit_tasks_delete` — AFTER DELETE on tasks
- `audit_clients_delete` — AFTER DELETE on clients
- `audit_suppliers_delete` — AFTER DELETE on suppliers
- `audit_budgets_update` — AFTER UPDATE on budgets
- `audit_budgets_delete` — AFTER DELETE on budgets
- `audit_profiles_role_update` — AFTER UPDATE on profiles (only when role changes)

## Important Notes
1. The trigger function uses auth.uid() to identify the acting user.
2. user_email is looked up from profiles at trigger time for convenience.
3. All triggers are FOR EACH ROW and fire AFTER the operation.
4. The audit_log table is append-only — no UPDATE or DELETE policies.
5. Idempotent: uses IF NOT EXISTS and DROP TRIGGER IF EXISTS.
*/

-- 1. Create audit_log table
CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid,
  user_email text,
  action text NOT NULL,
  table_name text,
  record_id text,
  old_data jsonb,
  new_data jsonb
);

-- 2. Enable RLS
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- 3. Policies: INSERT for authenticated, SELECT for Admin only
DROP POLICY IF EXISTS "audit_log_insert_authenticated" ON audit_log;
CREATE POLICY "audit_log_insert_authenticated" ON audit_log FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "audit_log_select_admin" ON audit_log;
CREATE POLICY "audit_log_select_admin" ON audit_log FOR SELECT
  TO authenticated
  USING (get_my_role() IN ('Admin', 'Super Admin'));

-- No UPDATE or DELETE policies — logs are immutable

-- 4. Create the trigger function
CREATE OR REPLACE FUNCTION log_audit_action()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_email text;
  v_record_id text;
  v_old jsonb := NULL;
  v_new jsonb := NULL;
BEGIN
  v_user_id := auth.uid();
  
  SELECT email INTO v_email
  FROM auth.users WHERE id = v_user_id;

  IF TG_OP = 'DELETE' THEN
    v_record_id := OLD.id::text;
    v_old := to_jsonb(OLD);
  ELSIF TG_OP = 'UPDATE' THEN
    v_record_id := NEW.id::text;
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
  ELSIF TG_OP = 'INSERT' THEN
    v_record_id := NEW.id::text;
    v_new := to_jsonb(NEW);
  END IF;

  INSERT INTO audit_log (user_id, user_email, action, table_name, record_id, old_data, new_data)
  VALUES (v_user_id, v_email, TG_OP, TG_TABLE_NAME, v_record_id, v_old, v_new);

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

-- 5. Create the role-change-only trigger function for profiles
CREATE OR REPLACE FUNCTION log_audit_role_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_email text;
BEGIN
  -- Only fire if role actually changed
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    v_user_id := auth.uid();
    SELECT email INTO v_email FROM auth.users WHERE id = v_user_id;

    INSERT INTO audit_log (user_id, user_email, action, table_name, record_id, old_data, new_data)
    VALUES (
      v_user_id, v_email, 'UPDATE',
      'profiles', NEW.id::text,
      jsonb_build_object('role', OLD.role),
      jsonb_build_object('role', NEW.role)
    );
  END IF;
  RETURN NEW;
END;
$$;

-- 6. Create triggers

-- events DELETE
DROP TRIGGER IF EXISTS audit_events_delete ON events;
CREATE TRIGGER audit_events_delete
  AFTER DELETE ON events
  FOR EACH ROW EXECUTE FUNCTION log_audit_action();

-- tasks DELETE
DROP TRIGGER IF EXISTS audit_tasks_delete ON tasks;
CREATE TRIGGER audit_tasks_delete
  AFTER DELETE ON tasks
  FOR EACH ROW EXECUTE FUNCTION log_audit_action();

-- clients DELETE
DROP TRIGGER IF EXISTS audit_clients_delete ON clients;
CREATE TRIGGER audit_clients_delete
  AFTER DELETE ON clients
  FOR EACH ROW EXECUTE FUNCTION log_audit_action();

-- suppliers DELETE
DROP TRIGGER IF EXISTS audit_suppliers_delete ON suppliers;
CREATE TRIGGER audit_suppliers_delete
  AFTER DELETE ON suppliers
  FOR EACH ROW EXECUTE FUNCTION log_audit_action();

-- budgets UPDATE
DROP TRIGGER IF EXISTS audit_budgets_update ON budgets;
CREATE TRIGGER audit_budgets_update
  AFTER UPDATE ON budgets
  FOR EACH ROW EXECUTE FUNCTION log_audit_action();

-- budgets DELETE
DROP TRIGGER IF EXISTS audit_budgets_delete ON budgets;
CREATE TRIGGER audit_budgets_delete
  AFTER DELETE ON budgets
  FOR EACH ROW EXECUTE FUNCTION log_audit_action();

-- profiles role UPDATE
DROP TRIGGER IF EXISTS audit_profiles_role_update ON profiles;
CREATE TRIGGER audit_profiles_role_update
  AFTER UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION log_audit_role_change();

-- 7. Index for common queries
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_table_name ON audit_log (table_name);
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON audit_log (user_id);
