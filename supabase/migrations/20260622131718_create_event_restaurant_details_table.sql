CREATE TABLE event_restaurant_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  supplier_id text NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  -- Sezione 1: Informazioni Evento
  data date,
  ora_inizio time,
  ora_fine time,
  pax_previsti int,
  pax_confermati int,
  -- Sezione 2: Tipologia Servizio
  tipologia_servizio text NOT NULL DEFAULT '',
  -- Sezione 3: Menu
  menu_portate text NOT NULL DEFAULT '',
  menu_descrizione text NOT NULL DEFAULT '',
  -- Sezione 4: Budget
  budget_per_persona numeric(10,2),
  budget_totale numeric(10,2),
  -- Sezione 5: Privacy e Location
  area_riservata boolean NOT NULL DEFAULT false,
  sala_privata boolean NOT NULL DEFAULT false,
  esclusiva_parziale boolean NOT NULL DEFAULT false,
  esclusiva_totale boolean NOT NULL DEFAULT false,
  nome_sala text NOT NULL DEFAULT '',
  note_location text NOT NULL DEFAULT '',
  -- Sezione 6: Esigenze Alimentari
  num_vegetariani int,
  num_vegani int,
  allergie text NOT NULL DEFAULT '',
  intolleranze text NOT NULL DEFAULT '',
  note_alimentari text NOT NULL DEFAULT '',
  -- Sezione 7: Note Operative
  setup_tavoli text NOT NULL DEFAULT '',
  branding_cliente text NOT NULL DEFAULT '',
  richieste_speciali text NOT NULL DEFAULT '',
  note_operative text NOT NULL DEFAULT '',
  -- Meta
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(event_id, supplier_id)
);

ALTER TABLE event_restaurant_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_restaurant_details" ON event_restaurant_details
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_restaurant_details" ON event_restaurant_details
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update_restaurant_details" ON event_restaurant_details
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_restaurant_details" ON event_restaurant_details
  FOR DELETE TO authenticated USING (true);