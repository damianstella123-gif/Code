-- Helper: broadcast a notification to all users in profiles
CREATE OR REPLACE FUNCTION notify_all_users(
  p_title text,
  p_message text,
  p_type text,
  p_entity_type text,
  p_entity_id text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO notifications (user_id, title, message, type, related_entity_type, related_entity_id)
  SELECT id, p_title, p_message, p_type, p_entity_type, p_entity_id
  FROM profiles
  WHERE stato = 'attivo';
END;
$$;

-- 1. Task completato
CREATE OR REPLACE FUNCTION notify_task_completed() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF OLD.status <> 'completato' AND NEW.status = 'completato' THEN
    PERFORM notify_all_users(
      'Task completato',
      'Il task "' || COALESCE(NEW.title, 'Senza titolo') || '" e stato completato.',
      'task_completato',
      'task',
      NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_task_completed
  AFTER UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION notify_task_completed();

-- 2. Nuovo evento
CREATE OR REPLACE FUNCTION notify_new_event() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM notify_all_users(
    'Nuovo evento',
    'Evento creato: ' || COALESCE(NEW.name, 'Senza nome'),
    'nuovo_evento',
    'event',
    NEW.id
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_event_created
  AFTER INSERT ON events
  FOR EACH ROW EXECUTE FUNCTION notify_new_event();

-- 3. Nuovo cliente
CREATE OR REPLACE FUNCTION notify_new_client() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM notify_all_users(
    'Nuovo cliente',
    'Cliente aggiunto: ' || COALESCE(NEW.name, 'Senza nome'),
    'nuovo_cliente',
    'client',
    NEW.id
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_client_created
  AFTER INSERT ON clients
  FOR EACH ROW EXECUTE FUNCTION notify_new_client();

-- 4. Nuovo referente CRM
CREATE OR REPLACE FUNCTION notify_new_referente() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM notify_all_users(
    'Nuovo referente CRM',
    'Referente aggiunto: ' || COALESCE(NEW.nome, '') || ' ' || COALESCE(NEW.cognome, ''),
    'nuovo_referente',
    'referente',
    NEW.id::text
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_referente_created
  AFTER INSERT ON referenti
  FOR EACH ROW EXECUTE FUNCTION notify_new_referente();

-- 5. Nuovo documento archivio
CREATE OR REPLACE FUNCTION notify_new_archive_item() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM notify_all_users(
    'Nuovo documento in archivio',
    'Documento aggiunto: ' || COALESCE(NEW.title, 'Senza titolo'),
    'nuovo_documento',
    'archive_item',
    NEW.id::text
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_archive_item_created
  AFTER INSERT ON archive_items
  FOR EACH ROW EXECUTE FUNCTION notify_new_archive_item();

-- 6. Nuova comunicazione
CREATE OR REPLACE FUNCTION notify_new_communication() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM notify_all_users(
    'Nuova comunicazione',
    'Comunicazione: ' || COALESCE(NEW.subject, 'Senza oggetto'),
    'nuova_comunicazione',
    'communication',
    NEW.id
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_communication_created
  AFTER INSERT ON communications
  FOR EACH ROW EXECUTE FUNCTION notify_new_communication();
