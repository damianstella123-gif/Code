/*
# Create internal notification helper for trigger functions

## Problem
The `notify_all_users` function has an Admin/Super Admin role guard that was
added to prevent non-admin users from broadcasting notifications directly.
However, trigger functions (notify_new_event, notify_task_completed, etc.)
also call `notify_all_users`, so when a non-admin user (e.g. Project Manager)
performs a legitimate action like creating an event, the trigger fires,
hits the role guard, raises 'not authorized', and the entire INSERT fails.

## Fix
1. Create `_notify_all_users_internal` — a SECURITY DEFINER function that
   inserts notifications WITHOUT the role check. It is meant to be called
   ONLY by other SECURITY DEFINER trigger functions.
2. REVOKE EXECUTE on `_notify_all_users_internal` from public, anon, and
   authenticated so no end-user can call it directly. Only SECURITY DEFINER
   functions (which run as the function owner, typically postgres) can call it.
3. Rewrite all 6 trigger functions to call `_notify_all_users_internal`
   instead of `notify_all_users`.
4. Leave `notify_all_users` unchanged — still Admin/Super Admin only for
   any direct RPC call.

## Modified functions
- `_notify_all_users_internal` (NEW) — internal helper, no role check
- `notify_new_event` — trigger on events INSERT
- `notify_task_completed` — trigger on tasks UPDATE
- `notify_new_client` — trigger on clients INSERT
- `notify_new_referente` — trigger on referenti INSERT
- `notify_new_archive_item` — trigger on archive_items INSERT
- `notify_new_communication` — trigger on communications INSERT

## Security
- `_notify_all_users_internal` is SECURITY DEFINER with search_path = 'public'
- EXECUTE is revoked from public, anon, and authenticated
- Only SECURITY DEFINER trigger functions (running as owner) can call it
- `notify_all_users` remains Admin/Super Admin gated for direct user calls
*/

-- 1. Create the internal helper (no role check)
CREATE OR REPLACE FUNCTION public._notify_all_users_internal(
  p_title text,
  p_message text,
  p_type text,
  p_entity_type text,
  p_entity_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  INSERT INTO notifications (user_id, title, message, type, related_entity_type, related_entity_id)
  SELECT id, p_title, p_message, p_type, p_entity_type, p_entity_id
  FROM profiles
  WHERE stato = 'attivo';
END;
$fn$;

-- Lock it down: no direct calls from any user role
REVOKE EXECUTE ON FUNCTION public._notify_all_users_internal(text, text, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public._notify_all_users_internal(text, text, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public._notify_all_users_internal(text, text, text, text, text) FROM authenticated;

-- 2. Rewrite trigger functions to use the internal helper

CREATE OR REPLACE FUNCTION public.notify_new_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  PERFORM _notify_all_users_internal(
    'Nuovo evento',
    'Evento creato: ' || COALESCE(NEW.title, 'Senza nome'),
    'nuovo_evento',
    'event',
    NEW.id
  );
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.notify_task_completed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  IF OLD.status <> 'completato' AND NEW.status = 'completato' THEN
    PERFORM _notify_all_users_internal(
      'Task completato',
      'Il task "' || COALESCE(NEW.title, 'Senza titolo') || '" e stato completato.',
      'task_completato',
      'task',
      NEW.id
    );
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.notify_new_client()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  PERFORM _notify_all_users_internal(
    'Nuovo cliente',
    'Cliente aggiunto: ' || COALESCE(NEW.name, 'Senza nome'),
    'nuovo_cliente',
    'client',
    NEW.id
  );
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.notify_new_referente()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  PERFORM _notify_all_users_internal(
    'Nuovo referente CRM',
    'Referente aggiunto: ' || COALESCE(NEW.nome, '') || ' ' || COALESCE(NEW.cognome, ''),
    'nuovo_referente',
    'referente',
    NEW.id::text
  );
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.notify_new_archive_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  PERFORM _notify_all_users_internal(
    'Nuovo documento in archivio',
    'Documento aggiunto: ' || COALESCE(NEW.title, 'Senza titolo'),
    'nuovo_documento',
    'archive_item',
    NEW.id::text
  );
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.notify_new_communication()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  PERFORM _notify_all_users_internal(
    'Nuova comunicazione',
    'Comunicazione: ' || COALESCE(NEW.subject, 'Senza oggetto'),
    'nuova_comunicazione',
    'communication',
    NEW.id
  );
  RETURN NEW;
END;
$fn$;
