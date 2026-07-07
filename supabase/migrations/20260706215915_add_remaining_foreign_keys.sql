/*
# Add remaining missing foreign keys (batch 2)

Adds 2 additional FK constraints missed in the first batch.

## Tables Modified

1. presentation_versions — responsible_id → profiles.id (SET NULL)
2. error_log — user_id → profiles.id (SET NULL)

## Cascade Rules

- SET NULL for both: the child record retains its value independently.
  Presentation versions remain valid without a responsible assignee.
  Error log entries remain useful for debugging even if user is removed.
*/

-- FK: presentation_versions.responsible_id → profiles.id
-- Regola: SET NULL — Versione presentazione resta valida senza responsabile
ALTER TABLE presentation_versions
  ADD CONSTRAINT fk_presentation_versions_responsible
  FOREIGN KEY (responsible_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- FK: error_log.user_id → profiles.id
-- Regola: SET NULL — Log errore resta utile per debug anche senza utente
ALTER TABLE error_log
  ADD CONSTRAINT fk_error_log_user
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;
