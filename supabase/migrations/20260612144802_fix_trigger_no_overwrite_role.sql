/*
  Fix handle_new_user trigger to not overwrite role/name on conflict.
  
  The issue: when admin.createUser() is called, sometimes raw_user_meta_data
  is empty at trigger execution time. The edge function then upserts the correct
  values, but the trigger's ON CONFLICT overwrites them with defaults.
  
  Fix: On conflict, only update email and updated_at. Never overwrite
  first_name, last_name, role, or ruolo from the trigger — the edge function
  handles those authoritatively.
*/

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, nome, first_name, last_name, ruolo, role, reparto, is_active, attivo)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'first_name', '') || ' ' || COALESCE(new.raw_user_meta_data->>'last_name', ''),
    COALESCE(new.raw_user_meta_data->>'first_name', ''),
    COALESCE(new.raw_user_meta_data->>'last_name', ''),
    COALESCE(NULLIF(new.raw_user_meta_data->>'role', ''), 'Junior Event Assistant')::app_role,
    COALESCE(NULLIF(new.raw_user_meta_data->>'role', ''), 'Junior Event Assistant'),
    COALESCE(new.raw_user_meta_data->>'reparto', ''),
    true,
    true
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    updated_at = now();
  RETURN new;
END;
$$;
