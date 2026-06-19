CREATE TABLE IF NOT EXISTS feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titolo text NOT NULL,
  descrizione text NOT NULL DEFAULT '',
  categoria text NOT NULL DEFAULT 'Bug' CHECK (categoria IN ('Bug', 'Miglioramento', 'Funzione mancante', 'Idea')),
  priorita text NOT NULL DEFAULT 'Media' CHECK (priorita IN ('Bassa', 'Media', 'Alta')),
  modulo text NOT NULL DEFAULT '',
  stato text NOT NULL DEFAULT 'Nuovo' CHECK (stato IN ('Nuovo', 'In valutazione', 'Pianificato', 'Risolto')),
  autore_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  autore_nome text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_feedback" ON feedback FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "insert_feedback" ON feedback FOR INSERT
  TO authenticated WITH CHECK (autore_id = auth.uid());
CREATE POLICY "update_feedback" ON feedback FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_feedback" ON feedback FOR DELETE
  TO authenticated USING (autore_id = auth.uid());
