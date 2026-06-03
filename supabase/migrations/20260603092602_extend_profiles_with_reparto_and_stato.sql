/*
  # SIMMETRIA HUB — Aggiunta colonne profiles & ruoli operativi

  Estende la tabella `profiles` esistente per allinearla al modello dati di
  SIMMETRIA HUB (reparto + stato a 3 valori invece del booleano attivo).
  Le colonne preesistenti vengono mantenute per non perdere dati.

  1. Modifiche tabelle
     - `profiles`
       - aggiunta colonna `reparto` (text, default '')
       - aggiunta colonna `stato` (profile_status, default 'attivo')
       - mantenuta colonna `attivo` per retro-compatibilita

  2. Nuovo tipo enumerato
     - `profile_status`: 'attivo' | 'ferie' | 'malattia'

  3. Sicurezza
     - RLS gia abilitato
     - Aggiunte/garantite policy SELECT/INSERT/UPDATE per authenticated

  4. Trigger
     - `handle_new_user`: alla registrazione crea automaticamente il profilo
     - `set_updated_at`: aggiorna timestamp ad ogni UPDATE

  5. Note
     1. Nessun dato viene cancellato
     2. Le colonne nuove hanno default sicuri
     3. La migrazione e idempotente (puo essere rieseguita senza errori)
*/

-- 1) Tipo enumerato per lo stato
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'profile_status') THEN
    CREATE TYPE profile_status AS ENUM ('attivo', 'ferie', 'malattia');
  END IF;
END $$;

-- 2) Aggiunta colonne mancanti
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'reparto'
  ) THEN
    ALTER TABLE profiles ADD COLUMN reparto text NOT NULL DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'stato'
  ) THEN
    ALTER TABLE profiles ADD COLUMN stato profile_status NOT NULL DEFAULT 'attivo';
  END IF;
END $$;

-- 3) Indici utili
CREATE INDEX IF NOT EXISTS idx_profiles_ruolo ON profiles(ruolo);
CREATE INDEX IF NOT EXISTS idx_profiles_stato ON profiles(stato);

-- 4) RLS Policies (idempotenti)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'profiles' AND policyname = 'Authenticated users can view profiles'
  ) THEN
    CREATE POLICY "Authenticated users can view profiles"
      ON profiles FOR SELECT
      TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'profiles' AND policyname = 'Users can insert own profile'
  ) THEN
    CREATE POLICY "Users can insert own profile"
      ON profiles FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'profiles' AND policyname = 'Users can update own profile'
  ) THEN
    CREATE POLICY "Users can update own profile"
      ON profiles FOR UPDATE
      TO authenticated
      USING (auth.uid() = id)
      WITH CHECK (auth.uid() = id);
  END IF;
END $$;

-- 5) Trigger creazione automatica profilo al signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, nome, ruolo, reparto, stato)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email, '@', 1)),
    COALESCE((NEW.raw_user_meta_data->>'ruolo')::app_role, 'Junior Event Assistant'),
    COALESCE(NEW.raw_user_meta_data->>'reparto', ''),
    'attivo'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 6) Trigger updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
