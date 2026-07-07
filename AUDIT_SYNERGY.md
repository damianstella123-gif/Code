# AUDIT COMPLETO - Simmetria Synergy Hub

Data: 2026-07-06  
Scopo: Censimento onesto dello stato reale dell'app per pianificazione stabilizzazione e sicurezza.

---

## 1. PAGINE E MODULI

| Pagina | Stato | Scopo |
|--------|-------|-------|
| Dashboard | COMPLETA | Hub operativo con feed, KPI, CommandBar/Fly |
| Login | COMPLETA | Autenticazione email/password con verifica ruolo |
| Amministrazione | FUNZIONANTE CON LIMITI | Gestione finanziaria: entrate, fatture, budget |
| Archivio | COMPLETA | Repository documenti con upload/download/preview |
| CRM | COMPLETA | Gestione clienti, referenti, storico eventi |
| Calendario | FUNZIONANTE CON LIMITI | Multi-view calendar con task/eventi/memo |
| Comunicazioni | FUNZIONANTE CON LIMITI | Chat interna con conversazioni |
| CreativeStudio | FUNZIONANTE CON LIMITI | Progetti grafici, video, social |
| EventTimeline | FUNZIONANTE CON LIMITI | Timeline operativa giorno-per-giorno |
| Eventi | COMPLETA | Gestione eventi: CRUD, team, fornitori, budget, timeline |
| FeedbackBeta | COMPLETA | Raccolta bug/idee con categorizzazione |
| Fornitori | FUNZIONANTE CON LIMITI | Anagrafica fornitori con ricerca smart |
| Impostazioni | FUNZIONANTE CON LIMITI | Preferenze app, tema, profilo |
| Pratiche | COMPLETA | Tracciamento documenti legali/amministrativi |
| Presentazioni | SCHELETRO | Template presentazioni - UI incompleta |
| SocialStudio | FUNZIONANTE CON LIMITI | Pianificazione contenuti social |
| Task | COMPLETA | Task management con assegnazione e scadenze |
| Utenti | COMPLETA | Gestione utenti con ruoli e permessi |
| Workflow | FUNZIONANTE CON LIMITI | Checklist prontezza eventi (solo lettura) |

### Dettaglio limiti per pagina

**Dashboard** - Nessuna gestione errori sui fetch; spinner infinito in caso di errore rete.

**Amministrazione** - Modello dati ibrido: usa ancora localStorage come fallback per entrate/uscite. Le funzioni bulkImport non sono mai invocate dalla UI. Errori di caricamento inghiottiti in silenzio (.catch(() => {})).

**Calendario** - File da 2190 righe, rischio manutenibilita. Conflitti drag-and-drop non rilevati. Nessun feedback errore all'utente su operazioni CRUD calendario.

**Comunicazioni** - Nessun indicatore "sta scrivendo". Nessun realtime visibile per nuovi messaggi (solo polling). Archivio legacy suggerisce migrazione incompleta.

**CreativeStudio** - Fetch media limitato a 50 documenti senza paginazione. Nessun workflow approvazione reale (cambi stato diretti). Nessun deadline tracking.

**EventTimeline** - Drag-and-drop implementato ma senza feedback di salvataggio. Nessun undo. Performance potenzialmente degradata con molti giorni.

**Fornitori** - File da 1527 righe. Rating visibile ma nessun meccanismo per assegnare/aggiornare rating. Ricerca smart euristica (non sempre accurata).

**Impostazioni** - Settings salvati SOLO in localStorage (persi al clear browser). Toggle MFA senza implementazione reale. Opzioni Fly senza connessione backend.

**Presentazioni** - handleCreateVersion esiste ma il form per invocarlo non e renderizzato. Nessuna generazione reale di PDF. Pagina sostanzialmente non funzionante.

**SocialStudio** - Nessuna integrazione API social reale (Meta, LinkedIn). Nessuna preview contenuto. Nessuna analytics.

**Workflow** - Sola lettura. Checklist hardcoded (non configurabile). Click su item non naviga alla risoluzione.

**Eventi** - 3122 righe, necessita refactoring. Nessun rilevamento conflitti edit concorrenti. detectSupplierCategory aggiunge logica business nella UI.

---

## 2. SERVIZI E FLUSSI DATI

### File attivi in src/lib/

| File | Funzione | Tabelle | Usato da |
|------|----------|---------|----------|
| admin-service.ts | CRUD entrate/fatture admin | admin_entrate, admin_fatture | Amministrazione |
| auth.ts | Stato auth, permessi, ruoli | profiles | Layout, molte pagine |
| budgets-service.ts | CRUD budget eventi | budgets | Eventi, Amministrazione, Calendario, TabBudget |
| chat-notifications.tsx | Context notifiche chat | chat_conversations, chat_messages, profiles | App, Comunicazioni, Dashboard, PinnedChats |
| chat-service.ts | CRUD conversazioni/messaggi | chat_conversations, chat_messages | Layout, PinnedChats, Comunicazioni, Dashboard |
| clients-service.ts | CRUD clienti e referenti | clients, referenti | CRM, Amministrazione, Eventi, Dashboard, Calendario |
| communications-service.ts | CRUD comunicazioni | communications | Eventi |
| creative-service.ts | CRUD progetti creativi | creative_projects | CreativeStudio, SocialStudio, Calendario |
| event-economics.ts | Calcoli costi/ricavi/margini | 11 tabelle event_*_details | use-event-services |
| events-service.ts | CRUD eventi + timeline | events, 12 tabelle event_* | 10+ file |
| feedback-service.ts | CRUD feedback beta | feedback | FeedbackBeta |
| format.ts | Utility formattazione date | - | 14+ file |
| invoices-service.ts | CRUD fatture/pagamenti | invoices, payments, admin_documents | Amministrazione |
| notifications-service.ts | Notifiche utente | notifications | Layout, Comunicazioni, Dashboard |
| packages-service.ts | CRUD pacchetti cliente | client_packages | **NESSUNO (ORFANO)** |
| permissions.ts | Filtri visibilita | - | GlobalSearch (parziale) |
| practices-service.ts | CRUD pratiche | practices | Pratiche, Calendario |
| profiles.ts | Fetch profili utente | profiles | chat-notifications, users-service |
| social-service.ts | CRUD contenuti social | social_contents | SocialStudio, Calendario |
| storage.ts | Cache localStorage | - | Task, Eventi, Pratiche, Calendario, Layout |
| suppliers-service.ts | CRUD fornitori | suppliers | Fornitori, Eventi, Amministrazione, Calendario |
| tasks-service.ts | CRUD task | tasks | Task, Eventi, Calendario, Layout, CommandBar |
| theme.tsx | Context tema light/dark | profiles | App.tsx |
| use-event-services.ts | Hook aggregazione servizi | event_suppliers, 11 event_* | Pagine evento |
| use-event-timeline.ts | Hook timeline normalizzata | event_program, 11 event_* | EventTimeline |
| use-realtime.ts | Hook Supabase realtime | qualsiasi | Layout, Task, Eventi |
| users-service.ts | Gestione utenti admin | profiles (via edge function) | Utenti |

### PROBLEMI RILEVATI

**Uso residuo di localStorage per DATI REALI (non solo preferenze UI):**
- `auth.ts` (righe 20, 34, 38): Oggetto utente completo (id, email, ruolo, nome) in chiave `simmetria_user`
- `storage.ts`: Chiavi `cal_tasks`, `cal_events`, `simmetria_pratiche`, `simmetria_workflows`, `simmetria_entrate`, `simmetria_uscite`, `simmetria_clients`, `fly_history` - dati operativi in browser storage
- `Impostazioni.tsx`: Tutte le impostazioni (azienda, notifiche, layout, AI) in chiave `simmetria_settings`

**Logica di calcolo duplicata:**
- Funzione `num()` identica in `budgets-service.ts:28` e `suppliers-service.ts:41`
- `calcRowEconomics` in `event-economics.ts` (frontend) e `supabase/functions/_shared/event-economics.ts` (edge function) - copie manuali con rischio drift
- `use-event-services.ts` ricalcola margine/commissione localmente invece di usare l'helper esportato da event-economics.ts

**Funzioni esportate mai usate:**
- `packages-service.ts`: TUTTE le 7 funzioni esportate (fetchClientPackages, upsertClientPackage, deleteClientPackage, etc.) non importate da nessun file
- `permissions.ts`: `getVisibleEvents()` e `getVisibleTasks()` esportate ma mai importate; ogni pagina ridefinisce la propria versione
- `admin-service.ts`: `bulkImportEntrate()` e `bulkImportFatture()` mai invocate

**src/data/ (file di tipo):**
Contengono interfacce TypeScript + dati demo. I dati demo non sono piu usati (sostituiti da Supabase). Le interfacce sono ancora importate come tipi. Raccomandazione: estrarre tipi in /src/types/ e rimuovere dati demo.

---

## 3. DATABASE

### Tabelle con RLS CORRETTAMENTE RESTRITTIVA

| Tabella | Policy | Note |
|---------|--------|------|
| notifications | auth.uid() = user_id | Ownership corretto |
| chat_conversations | auth.uid() = ANY(participant_ids) | Membership corretto |
| chat_messages | sender + conversation membership | Corretto |
| calendar_items | SELECT: true; INSERT/UPDATE/DELETE: user_id = auth.uid() | Lettura aperta, scrittura owner |
| fly_actions_log | auth.uid() = user_id | Ownership corretto |
| feedback | SELECT: true; INSERT: autore_id=auth.uid(); UPDATE/DELETE: autore OR admin | Corretto (fixato 06/07) |
| invoices | get_my_role() IN (Admin, Super Admin, Finance) | Role-based corretto |
| payments | get_my_role() IN (Admin, Super Admin, Finance) | Role-based corretto |
| admin_documents | get_my_role() IN (Admin, Super Admin, Finance) | Role-based corretto |
| admin_entrate | get_my_role() IN (Admin, Super Admin, Finance) | Role-based corretto |
| admin_fatture | get_my_role() IN (Admin, Super Admin, Finance) | Role-based corretto |

### Tabelle con POLICY TROPPO PERMISSIVE (USING true per authenticated)

**20 tabelle** — qualsiasi utente autenticato puo leggere E scrivere TUTTI i record:

| Tabella | Problema |
|---------|----------|
| profiles | SELECT con USING(true): ogni utente vede tutti i profili |
| events | CRUD completo per tutti gli authenticated |
| tasks | CRUD completo per tutti gli authenticated |
| practices | CRUD completo per tutti gli authenticated |
| suppliers | CRUD completo per tutti gli authenticated |
| budgets | CRUD completo per tutti gli authenticated |
| communications | CRUD completo per tutti gli authenticated |
| clients | CRUD completo per tutti gli authenticated |
| creative_projects | CRUD completo per tutti gli authenticated |
| social_contents | CRUD completo per tutti gli authenticated |
| client_packages | CRUD completo per tutti gli authenticated |
| referenti | CRUD completo per tutti gli authenticated |
| presentation_versions | CRUD completo per tutti gli authenticated |
| event_suppliers | CRUD completo per tutti gli authenticated |
| event_documents | CRUD completo per tutti gli authenticated |
| event_program | CRUD completo per tutti gli authenticated |
| event_supplier_services | CRUD completo per tutti gli authenticated |
| event_hotel_details (+ 9 tabelle event_*_details) | CRUD completo per tutti gli authenticated |

**Nota di contesto:** L'app e una piattaforma interna di team (non multi-tenant pubblico). USING(true) per authenticated potrebbe essere intenzionale per collaborazione. Tuttavia non c'e isolamento per ruolo (un utente Finance puo modificare eventi, un PM puo cancellare fatture).

### Foreign Key mancanti dove logicamente attese

| Tabella | Colonna | Dovrebbe referenziare |
|---------|---------|----------------------|
| event_suppliers | event_id (text) | events(id) |
| event_suppliers | supplier_id (text) | suppliers(id) |
| event_documents | event_id (text) | events(id) |
| event_documents | uploaded_by (text) | auth.users(id) |
| event_program | event_id (text) | events(id) |
| event_supplier_services | event_id (text) | events(id) |
| event_supplier_services | supplier_id (text) | suppliers(id) |
| admin_entrate | evento_id (text) | events(id) |
| admin_entrate | cliente_id (text) | clients(id) |
| admin_fatture | evento_id (text) | events(id) |
| admin_fatture | soggetto_id (text) | clients/suppliers(id) |

### Realtime abilitato

events, tasks, practices, clients, suppliers, referenti, admin_entrate, admin_fatture, chat_conversations, chat_messages, notifications

---

## 4. EDGE FUNCTIONS

### fly-gateway

- **Endpoint:** POST /functions/v1/fly-gateway
- **Cosa fa:** Proxy verso Claude (claude-sonnet-4-6) con tool loop; gestisce chat conversazionale, proposta azioni, esecuzione azioni confermate
- **Secrets usati:** ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
- **Validazione JWT:** SI - via adminClient.auth.getUser(token); reject 401 se invalido
- **Client usato per query:** userClient (con token utente) - RLS rispettata
- **Service Role usato:** SOLO per validare JWT (adminClient.auth.getUser)
- **Gestione errori:** SI - 401 per token mancante/invalido, 500 per errori Anthropic/interni; errori tool restituiti come stringa JSON
- **verify_jwt:** false (gestito manualmente nel codice)

### admin-users

- **Endpoint:** POST /functions/v1/admin-users con parametro `action`
- **Azioni:** list-users, create-user, update-user, reset-password
- **Cosa fa:** CRUD utenti auth + profili; ban/unban; reset password
- **Secrets usati:** SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
- **Validazione JWT:** SI - verifica token + controlla ruolo Admin/Super Admin in profiles
- **Service Role usato:** SI per TUTTE le operazioni (necessario per creare/bannare utenti, resettare password, leggere tutti i profili)
- **Gestione errori:** Completa - codici 400/401/403/409/500 con messaggi specifici
- **verify_jwt:** false (gestito manualmente)

### Nota: nessuna altra edge function deployata (email-gateway non esiste)

---

## 5. FLY - SISTEMA AI

### Tool completi (11 totali)

**SOLA LETTURA (8 tool):**

| Tool | Parametri |
|------|-----------|
| get_events | filtro_stato?, entro_giorni? |
| get_tasks | solo_aperti?, evento_id?, entro_giorni? |
| get_clients | ricerca? |
| get_suppliers | ricerca?, categoria? |
| get_scadenze | giorni? (default 7) |
| get_event_economics | event_id? OPPURE nome_evento? |
| propose_event | citta (req), pax (req), budget_target?, giorni?, tipo? |
| get_team_members | (nessuno) |

**PROPOSTA SCRITTURA (3 tool - non scrivono direttamente):**

| Tool | Parametri |
|------|-----------|
| propose_create_task | titolo (req), assegnatario_nome?, scadenza?, evento_nome?, priorita?, descrizione? |
| propose_create_memo | titolo (req), data (req), ora?, alert?, descrizione? |
| propose_update_task_status | task_id (req), riferimento_task?, nuovo_stato (req) |

### Meccanismo PROPONI - CONFERMA - ESEGUI

1. Claude chiama un tool `propose_*`
2. Il tool restituisce `__PROPOSAL__` + JSON strutturato (non scrive nulla)
3. Il gateway intercetta il marker, salva la proposta, dice a Claude di presentare il riepilogo
4. Claude chiede conferma esplicita nella risposta testuale
5. Il frontend mostra pulsanti "Conferma" / "Annulla"
6. Se l'utente conferma, il frontend invia una NUOVA richiesta con `{action: "execute", proposal: {...}}`
7. `executeProposal()` scrive nel DB e logga su `fly_actions_log`
8. Se l'utente annulla, nessuna scrittura avviene

### Cosa viene tracciato su fly_actions_log

Ogni azione eseguita (sia successo che fallimento):
- `user_id`: UUID dell'utente autenticato
- `action_type`: "create_task" | "create_memo" | "update_task_status"
- `payload`: oggetto completo dei parametri (jsonb)
- `status`: "executed" | "failed"
- `error`: messaggio errore (solo se failed)
- `created_at`: timestamp

### System Prompt (integrale)

```
Sei Fly, il Chief of Staff digitale di Simmetria Synergy, azienda che organizza eventi corporate e istituzionali. Rispondi in italiano, in modo sintetico, preciso e orientato ai risultati: prima la risposta in una frase, poi solo i dettagli utili. Usa i tool per basarti SOLO su dati reali: se un dato non c'e, dillo chiaramente, non inventare mai numeri, nomi o date.

REGOLE DI STILE: rispondi come un collega sintetico. Quando elenchi entita (eventi, fornitori, task, clienti): massimo 5 voci con solo le informazioni rilevanti alla domanda, chiudi con il conteggio dei restanti ("...e altri N"). Mai riversare tutti i campi di un record. Niente markdown pesante: no tabelle, no titoli; al massimo elenchi brevi con trattini.

Per domande su costi, ricavi, margini o budget degli eventi usa get_event_economics. Riporta i numeri esatti che ricevi, indicando che sono valori previsionali dai servizi censiti; non stimare mai importi non presenti nei dati.

Quando noti una criticita nei dati che hai appena letto (scadenze superate, eventi imminenti con poca preparazione), segnalala in una riga finale. Non prendere decisioni: proponi.

PRINCIPI COMPORTAMENTALI:
- Chiarezza prima dell'eleganza: usa il linguaggio piu semplice che trasmette il significato corretto.
- Dichiara sempre l'incertezza: distingui tra cio che risulta dai dati, cio che deduci e cio che ipotizzi. Preferisci "con le informazioni disponibili..." a certezze non giustificate.
- Evita "sempre", "mai", "certamente", "ovviamente".
- Tono calmo e costruttivo anche su criticita: orientamento, mai allarmismo.
- Parla come un collega esperto: competente, pragmatico, mai paternalistico. Ogni suggerimento deve poter spiegare il proprio perche in una riga.
- Se il valore di un'informazione non supera il costo dell'interruzione, ometti l'informazione.

AZIONI (PROPONI -> CONFERMA -> ESEGUI):
Quando l'utente chiede di FARE qualcosa (creare task, aggiungere promemoria, aggiornare stati), usa i tool propose_*. Questi NON scrivono nulla nel database. Presenta all'utente un riepilogo chiaro di cio che farai (es. "Creo il task 'X' assegnato a Y con scadenza Z -- confermi?"). L'utente deve confermare esplicitamente prima che l'azione venga eseguita dal sistema. Se hai bisogno di risolvere un nome in un profilo, usa get_team_members. Se un nome e ambiguo, chiedi di precisare.

ENTITIES_JSON: quando la tua risposta cita entita specifiche (eventi, fornitori, task, clienti), DEVI chiudere la risposta con una riga separata nel formato esatto:
ENTITIES_JSON: [{"type":"event","id":"uuid","nome":"...","data":"...","stato":"..."},...]
I type ammessi sono: event, supplier, task, client. Includi solo entita effettivamente citate nella risposta, max 5. Se non citi entita specifiche, NON aggiungere la riga ENTITIES_JSON.

Oggi e ${today}.
```

---

## 6. GESTIONE DATE

### Funzioni centralizzate (src/lib/format.ts)

- `fmtDate(iso)` - "dd/mm/yyyy"
- `fmtDateShort(iso)` - "dd/mmm"
- `fmtDateTime(iso)` - con ora
- `fmtShort(iso)`, `fmtLong(iso)`, `fmtFull(iso)` - formati vari
- `daysLeft(iso)` - giorni rimanenti
- `todayISO()`, `addDaysISO()`, `diffDaysISO()` - utility ISO

### Violazioni: uso diretto di toLocaleDateString (NON centralizzato)

| File | Righe | Nota |
|------|-------|------|
| GlobalSearch.tsx | 173, 191, 244, 265, 340 | 5 occorrenze con formati vari |
| TabBudget.tsx | 115, 505, 623, 694, 753 | Export PDF/CSV |
| Amministrazione.tsx | 74, 77, 80, 669, 670, 678, 679, 698, 712 | 9 occorrenze, multipli formati |
| Archivio.tsx | 62 | 1 occorrenza |
| CRM.tsx | 116, 117 | Range date evento |
| Comunicazioni.tsx | 28, 29, 948 | Timestamp messaggi |
| CreativeStudio.tsx | 54 | 1 occorrenza |
| Dashboard.tsx | 228 | Clock live (caso speciale) |
| Eventi.tsx | 1858, 2373 | 2 occorrenze |
| FeedbackBeta.tsx | 56 | 1 occorrenza |
| SocialStudio.tsx | 38 | 1 occorrenza |
| Task.tsx | 714, 722 | 2 occorrenze |

**Totale: ~35 pattern locali che bypassano format.ts**

### Calendario.tsx - caso speciale

Il calendario usa manipolazione diretta Date JS (getFullYear, getMonth, getDate, setDate) per rendering griglia. Questo e LEGITTIMO per logica calendario (non formattazione display), ma crea un file enorme con logica data sparpagliata.

### Librerie terze

Nessuna libreria data esterna usata (no date-fns, no dayjs, no moment).

---

## 7. GESTIONE ERRORI

### Livello service (src/lib/*-service.ts) - 16 file

**TUTTI SILENZIOSI**: pattern uniforme `try { ... } catch(e) { console.error(...); return [] }`. L'utente non vede mai errori originati dal livello service. Nessun throw, nessun callback errore.

### Livello pagine

**Mostrano errori all'utente (BUONO):**
- Login.tsx - setError con messaggi specifici
- Utenti.tsx - setError con AlertCircle visuale
- CRM.tsx - "Salvataggio non riuscito"
- FeedbackBeta.tsx - validazione + errori service
- Impostazioni.tsx - setErrorMsg per password
- Archivio.tsx - alert() per errori upload/download
- Eventi.tsx - setErrorMessage con auto-clear 4s

**Errori inghiottiti in silenzio (PROBLEMATICO):**
- Amministrazione.tsx - .catch(() => {}) su migrazione; fetch silenzioso
- Calendario.tsx - console.error senza feedback utente
- Comunicazioni.tsx - nessun handling visibile
- CreativeStudio.tsx - nessun handling visibile
- Dashboard.tsx - nessun handling; spinner infinito su errore
- EventTimeline.tsx - solo console.error
- Fornitori.tsx - delete silenzioso; parse JSON silenzioso

### Pattern peggiore

```javascript
// Amministrazione.tsx:448 - errore migrazione ignorato
.catch(() => { /* Migration failed - will retry next load */ })
```

Il "retry next load" non e implementato. L'utente non sa che i dati non sono stati caricati.

---

## 8. SICUREZZA

### Punti critici

**8.1 Dati sensibili in localStorage**
- Oggetto utente completo (id, email, ruolo) in `simmetria_user`
- Sessione Supabase gestita dal client, ma duplicata in localStorage
- Rischio: accesso fisico al dispositivo espone identita e ruolo

**8.2 RLS troppo permissive (20 tabelle)**
- Qualsiasi authenticated puo leggere/scrivere TUTTO su events, tasks, clients, suppliers, budgets, communications, etc.
- Un utente con ruolo "Operativo" puo tecnicamente cancellare tutti gli eventi o modificare budget
- Mitigato da: UI che nasconde azioni non autorizzate, ma nessuna protezione backend reale

**8.3 verify_jwt: false su entrambe le edge functions**
- JWT verificato manualmente nel codice (corretto)
- Ma: se il check fallisce per bug, la funzione e esposta senza protezione framework
- Rischio basso ma non zero: un errore nel codice di validazione aprirebbe la funzione

**8.4 Service Role in admin-users**
- Usa service role per TUTTE le operazioni (necessario per user management)
- Check ruolo Admin avviene prima, ma se bypassato (bug), service role da accesso totale
- Correttamente isolato: solo create/update/reset/list, no delete

**8.5 Nessun rate limiting**
- fly-gateway: nessun limite chiamate (costi Anthropic illimitati per utente autenticato)
- admin-users: nessun limite su reset-password (brute force teorico)
- Chat: nessun limite messaggi

**8.6 Nessun audit log generico**
- Solo fly_actions_log per azioni Fly
- Nessun log per: creazione/cancellazione eventi, modifica budget, cambio ruoli utente
- Impossibile tracciare "chi ha cancellato l'evento X" o "chi ha modificato il budget Y"

**8.7 CORS: Access-Control-Allow-Origin: ***
- Entrambe le edge functions accettano richieste da qualsiasi origine
- Per un'app interna questo e ragionevole, ma non ideale per produzione

**8.8 Nessuna validazione input server-side**
- I tool propose_* non validano formati (es. scadenza potrebbe non essere YYYY-MM-DD)
- executeProposal() inserisce direttamente i parametri senza sanitizzazione
- Le RLS sono l'unica protezione contro inserimenti malformati

**8.9 Chiavi API in env (corretto ma nota)**
- ANTHROPIC_API_KEY configurata come secret edge function
- Nessuna esposizione lato client verificata
- SUPABASE_ANON_KEY esposta nel frontend (design pattern Supabase, protetto da RLS)

---

## RIEPILOGO PRIORITA

### P0 - Critico (rischio dati/sicurezza)
1. RLS permissive su 20 tabelle: qualsiasi authenticated puo cancellare qualsiasi record
2. Nessun rate limiting su fly-gateway (costi API potenzialmente illimitati)
3. Errori service silenziosi: l'utente non sa mai quando un'operazione fallisce

### P1 - Alto (stabilita/integrita)
4. Foreign key mancanti su 11 colonne: possibili record orfani
5. localStorage per dati operativi: perdita dati al clear, inconsistenza
6. File Amministrazione con dati ibridi local/remote
7. Nessun audit log per modifiche critiche (eventi, budget, utenti)

### P2 - Medio (manutenibilita)
8. Eventi.tsx (3122 righe) e Calendario.tsx (2190 righe) necessitano split
9. Logica calcolo duplicata (event-economics frontend vs edge function)
10. 35 pattern data non centralizzati
11. packages-service.ts orfano, permissions.ts con export inutilizzati
12. Presentazioni.tsx scheletro non funzionante

### P3 - Basso (qualita)
13. Nessun undo/redo su operazioni critiche
14. Impostazioni solo in localStorage
15. Nessuna paginazione su fetch grandi (fornitori, media library)
16. Nessun conflict detection su edit concorrenti
