CREATE OR REPLACE FUNCTION public.notify_new_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
PERFORM notify_all_users(
'Nuovo evento',
'Evento creato: ' || COALESCE(NEW.title, 'Senza nome'),
'nuovo_evento',
'event',
NEW.id
);
RETURN NEW;
END;
$function$;