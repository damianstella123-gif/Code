/*
# Create fly_glossary table

1. New Tables
  - `fly_glossary`
    - `id` (uuid, primary key)
    - `termine` (text, not null, unique) — the term or pattern Fly should recognize
    - `definizione` (text, not null) — the definition/instruction for Fly
    - `attivo` (boolean, default true) — whether this entry is active
    - `created_at` (timestamptz)
    - `updated_at` (timestamptz)

2. Security
  - Enable RLS on `fly_glossary`.
  - Authenticated users can read active entries.
  - Only admin role can insert/update/delete.

3. Seed data
  - Pre-populate with the existing hardcoded glossary entries from fly-gateway.
*/

CREATE TABLE IF NOT EXISTS fly_glossary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  termine text NOT NULL UNIQUE,
  definizione text NOT NULL,
  attivo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE fly_glossary ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_glossary_authenticated" ON fly_glossary;
CREATE POLICY "select_glossary_authenticated" ON fly_glossary FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_glossary_admin" ON fly_glossary;
CREATE POLICY "insert_glossary_admin" ON fly_glossary FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "update_glossary_admin" ON fly_glossary;
CREATE POLICY "update_glossary_admin" ON fly_glossary FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "delete_glossary_admin" ON fly_glossary;
CREATE POLICY "delete_glossary_admin" ON fly_glossary FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Seed with existing hardcoded glossary entries
INSERT INTO fly_glossary (termine, definizione) VALUES
  ('Numero evento (#XXX)', 'Ogni evento ha un titolo nel formato "#XXX" (es. "#070", "#082") — è un numero progressivo a 3 cifre, sempre con il cancelletto davanti. Quando l''utente scrive "#070" o "070" o "evento 070", intendilo SEMPRE come il titolo di un evento e cercalo direttamente (title ILIKE ''%070%'' o simile) — non chiedere mai chiarimenti su cosa sia un "#XXX".'),
  ('Fee / Fee agenzia', 'La "fee" o "fee agenzia" è la percentuale di ricavo di Simmetria sul venduto di un evento (tipicamente 6%), non un costo per il cliente separato.'),
  ('Versioni budget', 'Un evento può avere più "versioni budget" (preventivi diversi nel tempo, es. per location alternative) — quando l''utente chiede il budget di un evento senza specificare quale versione, usa quella più recente o quella approvata, e chiarisci quale stai mostrando.'),
  ('Riga budget opzionale', 'Una riga budget "opzionale" è una voce proposta ma non ancora confermata: non conta nei totali finché non viene attivata.')
ON CONFLICT (termine) DO NOTHING;
