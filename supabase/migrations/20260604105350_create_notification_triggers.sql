/*
  # Create notification auto-generation triggers

  1. Functions (all SECURITY DEFINER to bypass RLS for system inserts)
    - `notify_task_assigned()` — fires after INSERT on tasks, creates notification for assigned user
    - `notify_practice_overdue()` — fires after UPDATE on practices, creates notification when due_date < now
    - `notify_budget_exceeded()` — fires after INSERT or UPDATE on budgets, notifies when actual_cost > estimated_cost

  2. Triggers
    - `on_task_created` — AFTER INSERT on tasks
    - `on_practice_updated` — AFTER UPDATE on practices
    - `on_budget_changed` — AFTER INSERT OR UPDATE on budgets

  3. Notes
    - Notifications are linked to user via profiles.nome = tasks.assigned_to lookup
    - For practices and budgets, notification goes to the practice responsible or all Partners
    - Uses SECURITY DEFINER to allow INSERT into notifications despite RLS
*/

-- Helper: find user_id from profile name
CREATE OR REPLACE FUNCTION public.find_user_id_by_name(p_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  found_id uuid;
BEGIN
  SELECT id INTO found_id FROM profiles WHERE nome = p_name LIMIT 1;
  RETURN found_id;
END;
$$;

-- Trigger function: task assigned notification
CREATE OR REPLACE FUNCTION public.notify_task_assigned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_user_id uuid;
BEGIN
  IF NEW.assigned_to IS NULL OR NEW.assigned_to = '' THEN
    RETURN NEW;
  END IF;

  target_user_id := find_user_id_by_name(NEW.assigned_to);

  IF target_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO notifications (user_id, title, message, type, related_entity_type, related_entity_id)
  VALUES (
    target_user_id,
    'Nuovo task assegnato',
    'Ti è stato assegnato: ' || COALESCE(NEW.title, 'Task senza titolo'),
    'task_assegnato',
    'task',
    NEW.id
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_task_created ON tasks;
CREATE TRIGGER on_task_created
  AFTER INSERT ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_task_assigned();

-- Trigger function: practice overdue notification
CREATE OR REPLACE FUNCTION public.notify_practice_overdue()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_user_id uuid;
BEGIN
  -- Only fire if practice just became overdue (due_date in the past and status not completed)
  IF NEW.due_date IS NULL OR NEW.due_date >= CURRENT_DATE THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'completata' THEN
    RETURN NEW;
  END IF;

  -- Avoid re-notifying: check if notification already exists for this practice
  IF EXISTS (
    SELECT 1 FROM notifications
    WHERE related_entity_type = 'pratica'
    AND related_entity_id = NEW.id
    AND type = 'pratica_in_ritardo'
    AND created_at > (now() - interval '1 day')
  ) THEN
    RETURN NEW;
  END IF;

  target_user_id := find_user_id_by_name(NEW.responsible);

  IF target_user_id IS NULL THEN
    -- Notify first Partner instead
    SELECT id INTO target_user_id FROM profiles WHERE ruolo = 'Partner' LIMIT 1;
  END IF;

  IF target_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO notifications (user_id, title, message, type, related_entity_type, related_entity_id)
  VALUES (
    target_user_id,
    'Pratica in ritardo',
    'Scadenza superata: ' || COALESCE(NEW.title, 'Pratica senza titolo'),
    'pratica_in_ritardo',
    'pratica',
    NEW.id
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_practice_updated ON practices;
CREATE TRIGGER on_practice_updated
  AFTER INSERT OR UPDATE ON practices
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_practice_overdue();

-- Trigger function: budget exceeded notification
CREATE OR REPLACE FUNCTION public.notify_budget_exceeded()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_user_id uuid;
BEGIN
  IF NEW.actual_cost IS NULL OR NEW.estimated_cost IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.actual_cost <= NEW.estimated_cost THEN
    RETURN NEW;
  END IF;

  -- Avoid duplicate notifications
  IF EXISTS (
    SELECT 1 FROM notifications
    WHERE related_entity_type = 'budget'
    AND related_entity_id = NEW.id
    AND type = 'budget_superato'
    AND created_at > (now() - interval '1 day')
  ) THEN
    RETURN NEW;
  END IF;

  -- Notify first Partner or Finance user
  SELECT id INTO target_user_id FROM profiles WHERE ruolo = 'Amministrazione' LIMIT 1;
  IF target_user_id IS NULL THEN
    SELECT id INTO target_user_id FROM profiles WHERE ruolo = 'Partner' LIMIT 1;
  END IF;

  IF target_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO notifications (user_id, title, message, type, related_entity_type, related_entity_id)
  VALUES (
    target_user_id,
    'Budget superato',
    'Il costo effettivo supera il previsto: ' || COALESCE(NEW.item, 'Voce budget') || ' (' || NEW.actual_cost || '/' || NEW.estimated_cost || ')',
    'budget_superato',
    'budget',
    NEW.id
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_budget_changed ON budgets;
CREATE TRIGGER on_budget_changed
  AFTER INSERT OR UPDATE ON budgets
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_budget_exceeded();
