DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.registration_email_outbox'::regclass
      AND conname = 'registration_email_outbox_template_check'
  ) THEN
    ALTER TABLE public.registration_email_outbox
      DROP CONSTRAINT registration_email_outbox_template_check;
  END IF;

  ALTER TABLE public.registration_email_outbox
    ADD CONSTRAINT registration_email_outbox_template_check
    CHECK (template = ANY (ARRAY[
      'registration_confirmed'::text,
      'registration_waitlist'::text,
      'retention_notice'::text
    ]));
END $$;
