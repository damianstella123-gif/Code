/*
# Add Missing Foreign Keys

Adds 18 foreign key constraints to columns that reference parent tables
but were missing explicit FK declarations. Each FK uses the appropriate
cascade rule based on the relationship semantics.

## Tables Modified

1. event_suppliers — event_id, supplier_id (orphan cleanup + CASCADE)
2. event_supplier_services — event_id (CASCADE), supplier_id (RESTRICT)
3. event_hotel_details — event_id (CASCADE), supplier_id (RESTRICT)
4. event_program — event_id (CASCADE), supplier_id (SET NULL)
5. event_staff_interno_details — supplier_id (SET NULL)
6. event_documents — event_id (CASCADE)
7. tasks — supplier_id (SET NULL)
8. communications — task_id (SET NULL)
9. documents — event_id, supplier_id, cliente_id (SET NULL)
10. chat_messages — sender_id (RESTRICT)
11. calendar_items — user_id (CASCADE)
12. notifications — user_id (CASCADE)
13. error_log — user_id (SET NULL)
14. presentation_versions — responsible_id (SET NULL)

## Cascade Rules Applied

- CASCADE: Child rows are detail/component of parent; meaningless alone.
- RESTRICT: Parent should not be deleted while children exist (data protection).
- SET NULL: Relationship is optional; child keeps meaning without parent.

## Data Cleanup

- 1 orphaned row in event_suppliers.supplier_id is removed before FK creation.

## Important Notes

1. No TypeScript files modified.
2. Type-mismatched columns (uuid referencing text PKs) are excluded:
   chat_conversations.event_id, archive_items.event_id/client_id,
   creative_projects.responsible_id, events.project_manager_id, etc.
3. Polymorphic columns (notifications.related_entity_id, admin_fatture.soggetto_id) excluded.
*/

-- ═══════════════════════════════════════════════════════════════════════
-- DATA CLEANUP: remove orphaned row(s) before adding FK
-- ═══════════════════════════════════════════════════════════════════════

DELETE FROM event_suppliers
WHERE NOT EXISTS (SELECT 1 FROM suppliers s WHERE s.id = event_suppliers.supplier_id);

-- ═══════════════════════════════════════════════════════════════════════
-- FK 1: event_suppliers.event_id → events.id
-- Regola: CASCADE — Riga di junction perde significato senza l'evento
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE event_suppliers
  ADD CONSTRAINT fk_event_suppliers_event
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE;

-- ═══════════════════════════════════════════════════════════════════════
-- FK 2: event_suppliers.supplier_id → suppliers.id
-- Regola: CASCADE — Riga di junction perde significato senza il fornitore
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE event_suppliers
  ADD CONSTRAINT fk_event_suppliers_supplier
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE;

-- ═══════════════════════════════════════════════════════════════════════
-- FK 3: event_supplier_services.event_id → events.id
-- Regola: CASCADE — Servizio fornitore e' dettaglio dell'evento
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE event_supplier_services
  ADD CONSTRAINT fk_event_supplier_services_event
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE;

-- ═══════════════════════════════════════════════════════════════════════
-- FK 4: event_supplier_services.supplier_id → suppliers.id
-- Regola: RESTRICT — Non eliminare fornitore con servizi attivi censiti
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE event_supplier_services
  ADD CONSTRAINT fk_event_supplier_services_supplier
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE RESTRICT;

-- ═══════════════════════════════════════════════════════════════════════
-- FK 5: event_hotel_details.event_id → events.id
-- Regola: CASCADE — Dettaglio hotel e' parte dell'evento
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE event_hotel_details
  ADD CONSTRAINT fk_event_hotel_details_event
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE;

-- ═══════════════════════════════════════════════════════════════════════
-- FK 6: event_hotel_details.supplier_id → suppliers.id
-- Regola: RESTRICT — Colonna NOT NULL, non eliminare fornitore con prenotazioni hotel attive
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE event_hotel_details
  ADD CONSTRAINT fk_event_hotel_details_supplier
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE RESTRICT;

-- ═══════════════════════════════════════════════════════════════════════
-- FK 7: event_program.event_id → events.id
-- Regola: CASCADE — Programma e' parte dell'evento
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE event_program
  ADD CONSTRAINT fk_event_program_event
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE;

-- ═══════════════════════════════════════════════════════════════════════
-- FK 8: event_program.supplier_id → suppliers.id
-- Regola: SET NULL — Voce di programma ha senso anche senza fornitore assegnato
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE event_program
  ADD CONSTRAINT fk_event_program_supplier
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL;

-- ═══════════════════════════════════════════════════════════════════════
-- FK 9: event_staff_interno_details.supplier_id → suppliers.id
-- Regola: SET NULL — Staff interno puo' esistere senza fornitore collegato
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE event_staff_interno_details
  ADD CONSTRAINT fk_event_staff_interno_supplier
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL;

-- ═══════════════════════════════════════════════════════════════════════
-- FK 10: event_documents.event_id → events.id
-- Regola: CASCADE — Documento evento e' parte dell'evento
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE event_documents
  ADD CONSTRAINT fk_event_documents_event
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE;

-- ═══════════════════════════════════════════════════════════════════════
-- FK 11: tasks.supplier_id → suppliers.id
-- Regola: SET NULL — Task ha significato autonomo, il link al fornitore e' opzionale
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE tasks
  ADD CONSTRAINT fk_tasks_supplier
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL;

-- ═══════════════════════════════════════════════════════════════════════
-- FK 12: communications.task_id → tasks.id
-- Regola: SET NULL — Comunicazione resta valida anche se il task viene rimosso
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE communications
  ADD CONSTRAINT fk_communications_task
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL;

-- ═══════════════════════════════════════════════════════════════════════
-- FK 13: documents.event_id → events.id
-- Regola: SET NULL — Documento generico resta utile senza l'evento
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE documents
  ADD CONSTRAINT fk_documents_event
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL;

-- ═══════════════════════════════════════════════════════════════════════
-- FK 14: documents.supplier_id → suppliers.id
-- Regola: SET NULL — Documento resta utile senza il fornitore
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE documents
  ADD CONSTRAINT fk_documents_supplier
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL;

-- ═══════════════════════════════════════════════════════════════════════
-- FK 15: documents.cliente_id → clients.id
-- Regola: SET NULL — Documento resta utile senza il cliente
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE documents
  ADD CONSTRAINT fk_documents_client
  FOREIGN KEY (cliente_id) REFERENCES clients(id) ON DELETE SET NULL;

-- ═══════════════════════════════════════════════════════════════════════
-- FK 16: chat_messages.sender_id → profiles.id
-- Regola: RESTRICT — Non eliminare profilo con messaggi inviati (storico conversazioni)
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE chat_messages
  ADD CONSTRAINT fk_chat_messages_sender
  FOREIGN KEY (sender_id) REFERENCES profiles(id) ON DELETE RESTRICT;

-- ═══════════════════════════════════════════════════════════════════════
-- FK 17: calendar_items.user_id → profiles.id
-- Regola: CASCADE — Voci calendario sono personali, eliminate con il profilo
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE calendar_items
  ADD CONSTRAINT fk_calendar_items_user
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- ═══════════════════════════════════════════════════════════════════════
-- FK 18: notifications.user_id → profiles.id
-- Regola: CASCADE — Notifiche sono personali, eliminate con il profilo
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE notifications
  ADD CONSTRAINT fk_notifications_user
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
