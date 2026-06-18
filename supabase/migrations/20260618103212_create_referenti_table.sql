-- Referenti (client contacts/people)
CREATE TABLE referenti (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  nome text NOT NULL DEFAULT '',
  cognome text NOT NULL DEFAULT '',
  reparto text NOT NULL DEFAULT '',
  ruolo text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  telefono text NOT NULL DEFAULT '',
  cellulare text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  is_principale boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_referenti_client_id ON referenti(client_id);
CREATE INDEX idx_referenti_principale ON referenti(client_id, is_principale) WHERE is_principale = true;

-- RLS
ALTER TABLE referenti ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_select_referenti" ON referenti
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_insert_referenti" ON referenti
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_update_referenti" ON referenti
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_delete_referenti" ON referenti
  FOR DELETE TO authenticated USING (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE referenti;
