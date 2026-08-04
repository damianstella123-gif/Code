# Procedure di sicurezza: rotazione chiavi e incident response

## Rotazione chiavi

### Supabase anon key / service role key
- Da ruotare: Supabase Dashboard -> Settings -> API -> Generate new key.
- Dopo la rotazione, aggiornare immediatamente:
  - variabile d'ambiente VITE_SUPABASE_ANON_KEY (build Netlify)
  - eventuali Edge Function secrets che referenziano la service role key
- La vecchia chiave resta valida per un breve periodo di grazia (verificare nella dashboard al momento della rotazione).
- Non committare mai la nuova chiave nel codice: solo variabili d'ambiente.

### Chiave HMAC registrazione email (REGISTRATION_EMAIL_HMAC_KEY)
- Generare un nuovo valore casuale a 32 byte (es. via SQL: encode(gen_random_bytes(32), 'hex')).
- Aggiornare in due posti, nello stesso momento:
  1. tabella internal_secrets (name = 'registration_email_hmac_key')
  2. Supabase Dashboard -> Edge Functions -> Secrets -> REGISTRATION_EMAIL_HMAC_KEY
- Finche i due valori non coincidono, le email di conferma registrazione falliranno silenziosamente (le registrazioni continueranno a funzionare).
- Non condividere mai il valore in chat, ticket, o strumenti non cifrati.

### Chiave API Resend (invio email)
- Rotazione dal pannello Resend.
- Aggiornare il secret dell'Edge Function corrispondente su Supabase.

## Incident response

### Sospetta compromissione di una chiave
1. Ruotare immediatamente la chiave interessata (vedi sopra).
2. Verificare nei log di Supabase (Dashboard -> Logs) eventuali accessi anomali nel periodo sospetto.
3. Se coinvolge dati personali dei partecipanti (registrazioni), valutare con il consulente privacy/legale se è richiesta notifica secondo GDPR.
4. Documentare: data/ora scoperta, chiave coinvolta, azioni intraprese, esito.

### Accesso non autorizzato sospetto a un account Admin/Super Admin
1. Disabilitare l'account interessato (tabella profiles, o tramite pannello Auth di Supabase).
2. Forzare logout globale se necessario (invalidare sessioni).
3. Verificare le azioni recenti dell'account nei log applicativi disponibili.
4. Ripristinare l'accesso solo dopo verifica.

### Anomalie nel flusso di registrazione pubblica
1. Controllare il conteggio in registration_rate_limits per il sito coinvolto.
2. Se necessario, disattivare temporaneamente il sito di registrazione (flag esistente lato applicazione) finche non si comprende la causa.
3. Non eliminare dati di registrazione senza autorizzazione esplicita.

## Note
Questo documento va aggiornato ogni volta che viene introdotto un nuovo segreto server-side o un nuovo canale di invio dati sensibili.
