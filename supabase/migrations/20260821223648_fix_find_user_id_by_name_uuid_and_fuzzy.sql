/*
# Fix find_user_id_by_name to handle UUID inputs and fuzzy name matching

## Problem
- tasks.assigned_to stores UUIDs (user IDs), but find_user_id_by_name()
  does `WHERE nome = p_name` which is a name column — a UUID will never match a name.
- Even for name-based callers (e.g. notify_practice_overdue uses `responsible` which stores
  display names), the match was case-sensitive and whitespace-sensitive, failing on real data
  (e.g. "Massimo  Centofanti" with double-space in nome).

## Fix
1. If p_name is a valid UUID, look it up directly in profiles.id (covers task assignment).
2. Otherwise try exact match on nome (fast path for perfect data).
3. If no exact match, try case-insensitive + trimmed match on nome.
4. If still no match, try case-insensitive match on first_name || ' ' || last_name (trimmed).
5. Return NULL gracefully if nothing matches (existing callers already handle NULL).

## Security
- Function keeps SECURITY DEFINER with fixed search_path (already hardened).
- No new privileges granted.
*/

CREATE OR REPLACE FUNCTION public.find_user_id_by_name(p_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  found_id uuid;
  cleaned text;
BEGIN
  IF p_name IS NULL OR p_name = '' THEN
    RETURN NULL;
  END IF;

  cleaned := btrim(p_name);

  -- 1. If input looks like a UUID, match directly on profiles.id
  IF cleaned ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
    SELECT id INTO found_id FROM profiles WHERE id = cleaned::uuid LIMIT 1;
    RETURN found_id;
  END IF;

  -- 2. Exact match on nome (fast path)
  SELECT id INTO found_id FROM profiles WHERE nome = cleaned LIMIT 1;
  IF found_id IS NOT NULL THEN
    RETURN found_id;
  END IF;

  -- 3. Case-insensitive + trimmed match on nome
  SELECT id INTO found_id FROM profiles WHERE lower(btrim(nome)) = lower(cleaned) LIMIT 1;
  IF found_id IS NOT NULL THEN
    RETURN found_id;
  END IF;

  -- 4. Match on first_name || ' ' || last_name (case-insensitive, trimmed)
  SELECT id INTO found_id FROM profiles
  WHERE lower(btrim(first_name) || ' ' || btrim(last_name)) = lower(cleaned)
  LIMIT 1;

  RETURN found_id;
END;
$$;
