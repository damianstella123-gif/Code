/*
# Create AI Pills and Reading Register tables

## Purpose
Implements the "AI & Trasparenza" micro-learning module required by EU AI Act Art.4
(AI literacy). Stores learning pills and tracks per-user reading progress.

## 1. New Tables

### `ai_pills`
- `id` (uuid, PK) — pill identifier
- `title` (text, not null) — pill title
- `body` (text, not null) — pill body/content
- `quiz_json` (jsonb, nullable) — optional multiple-choice quiz
- `sort_order` (integer, default 0) — display ordering
- `created_at` (timestamptz) — creation timestamp

### `ai_pill_reads`
- `pill_id` (uuid, FK → ai_pills) — which pill was read
- `user_id` (uuid, FK → auth.users, default auth.uid()) — who read it
- `read_at` (timestamptz) — when it was read
- PK: (pill_id, user_id)

## 2. Security
- RLS enabled on both tables.
- `ai_pills`: all authenticated users can SELECT; only Admin/Super Admin can INSERT/UPDATE/DELETE.
- `ai_pill_reads`: users can SELECT/INSERT only their own reads; admins can SELECT all reads.

## 3. Seed Data
- 7 placeholder pills covering AI basics, cybersecurity, and transparency.
*/

CREATE TABLE IF NOT EXISTS ai_pills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL,
  quiz_json jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ai_pills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "all_can_read_pills" ON ai_pills;
CREATE POLICY "all_can_read_pills" ON ai_pills FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "admin_insert_pills" ON ai_pills;
CREATE POLICY "admin_insert_pills" ON ai_pills FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('Admin', 'Super Admin'))
  );

DROP POLICY IF EXISTS "admin_update_pills" ON ai_pills;
CREATE POLICY "admin_update_pills" ON ai_pills FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('Admin', 'Super Admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('Admin', 'Super Admin')));

DROP POLICY IF EXISTS "admin_delete_pills" ON ai_pills;
CREATE POLICY "admin_delete_pills" ON ai_pills FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('Admin', 'Super Admin')));

CREATE TABLE IF NOT EXISTS ai_pill_reads (
  pill_id uuid NOT NULL REFERENCES ai_pills(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (pill_id, user_id)
);

ALTER TABLE ai_pill_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_read_own_reads" ON ai_pill_reads;
CREATE POLICY "users_read_own_reads" ON ai_pill_reads FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_insert_own_reads" ON ai_pill_reads;
CREATE POLICY "users_insert_own_reads" ON ai_pill_reads FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "admin_read_all_reads" ON ai_pill_reads;
CREATE POLICY "admin_read_all_reads" ON ai_pill_reads FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('Admin', 'Super Admin'))
  );

CREATE INDEX IF NOT EXISTS idx_ai_pill_reads_user ON ai_pill_reads(user_id);

INSERT INTO ai_pills (title, body, quiz_json, sort_order) VALUES
(
  'Cos''e'' l''Intelligenza Artificiale?',
  'L''intelligenza artificiale (IA) e'' un insieme di tecnologie che permettono ai computer di svolgere compiti che normalmente richiedono intelligenza umana: riconoscere immagini, comprendere il linguaggio, prendere decisioni. In Synergy, l''IA ci aiuta ad automatizzare attivita'' ripetitive e a suggerire azioni, ma le decisioni finali restano sempre in mano al team.',
  '{"question": "Qual e'' il ruolo principale dell''IA in Synergy?", "options": ["Sostituire completamente il team", "Automatizzare attivita'' ripetitive e suggerire azioni", "Prendere decisioni autonome senza controllo umano"], "correct": 1}',
  1
),
(
  'Il Regolamento Europeo sull''IA (AI Act)',
  'L''AI Act e'' il regolamento europeo che disciplina l''uso dell''intelligenza artificiale. L''articolo 4 richiede che chiunque utilizzi sistemi di IA abbia un livello adeguato di alfabetizzazione. Questo modulo serve esattamente a questo: garantire che tutto il team comprenda come funziona l''IA che utilizza quotidianamente.',
  '{"question": "Cosa richiede l''Art. 4 dell''AI Act?", "options": ["Vietare l''uso dell''IA", "Un livello adeguato di alfabetizzazione IA per gli utilizzatori", "Usare solo IA open source"], "correct": 1}',
  2
),
(
  'Trasparenza: sapere quando l''IA interviene',
  'In Synergy, ogni volta che un suggerimento o un''azione e'' generata dall''IA, viene segnalato chiaramente. La trasparenza e'' un principio fondamentale: devi sempre sapere se stai interagendo con un risultato umano o automatico, per poter valutare criticamente le informazioni.',
  NULL,
  3
),
(
  'Dati personali e privacy',
  'L''IA lavora con dati. Quando questi includono informazioni personali (nomi, email, contatti dei partecipanti), e'' fondamentale trattarli con cura. Non condividere dati sensibili con strumenti esterni non autorizzati, e ricorda che i dati dei partecipanti sono protetti dal GDPR.',
  '{"question": "Cosa dovresti fare con i dati personali dei partecipanti?", "options": ["Condividerli liberamente con qualsiasi strumento", "Trattarli con cura e non condividerli con strumenti non autorizzati", "Cancellarli subito dopo l''evento"], "correct": 1}',
  4
),
(
  'Cybersecurity: le basi',
  'La sicurezza informatica riguarda tutti. Alcune regole d''oro: usa password robuste e diverse per ogni servizio, attiva l''autenticazione a due fattori dove possibile, non cliccare su link sospetti nelle email, e segnala subito qualsiasi attivita'' anomala al team IT.',
  '{"question": "Quale di queste e'' una buona pratica di sicurezza?", "options": ["Usare la stessa password ovunque", "Attivare l''autenticazione a due fattori", "Ignorare email sospette senza segnalarle"], "correct": 1}',
  5
),
(
  'Phishing e social engineering',
  'Il phishing e'' un tentativo di ingannarti per ottenere informazioni sensibili (password, dati bancari). Puo'' arrivare via email, SMS o telefono. Controlla sempre il mittente, diffida di urgenze insolite, e in caso di dubbio chiedi conferma al collega o al reparto IT prima di agire.',
  '{"question": "Come riconoscere un tentativo di phishing?", "options": ["Il messaggio viene da un collega quindi e'' sicuro", "Controllare il mittente e diffidare di richieste urgenti insolite", "Rispondere subito per non perdere tempo"], "correct": 1}',
  6
),
(
  'I tuoi diritti con l''IA',
  'Hai il diritto di: sapere quando un sistema di IA viene usato nel tuo lavoro, chiedere spiegazioni su come funziona, segnalare risultati che ti sembrano errati o discriminatori, e richiedere l''intervento umano in caso di decisioni che ti riguardano. Questo modulo e'' la prova che la tua azienda prende sul serio questi diritti.',
  NULL,
  7
)
ON CONFLICT DO NOTHING;
