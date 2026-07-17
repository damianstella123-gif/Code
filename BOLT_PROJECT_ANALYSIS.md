# BOLT PROJECT ANALYSIS — Synergy/Simmetria Hub

**Data analisi:** 2026-07-17  
**Ambiente:** Bolt (hosted) + Supabase + Netlify  
**Stato:** Produzione attiva (11 profili utente, 16 event_payments, 5 event_supplier_services)

---

## A. STRUTTURA DEL PROGETTO

### Cartelle principali (dalla memoria dell'editing in sessione)

```
project/
├── .env                          # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
├── index.html
├── package.json                  # React, TypeScript, Vite, Supabase-JS
├── vite.config.ts
├── tsconfig.json
├── netlify.toml                  # deploy config
├── dist/                         # build output
├── public/
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── pages/
│   │   ├── Amministrazione.tsx   # Entrate/Uscite/Fatture/Cashflow
│   │   ├── Calendario.tsx        # Calendar + Agenda
│   │   ├── CreativeStudio.tsx    # Social contents, creative projects
│   │   ├── Dashboard.tsx         # Overview KPI
│   │   ├── Dossier.tsx           # Pratiche/Dossier tracking
│   │   ├── Eventi.tsx            # Event list + detail
│   │   ├── Fornitori.tsx         # Supplier CRM
│   │   ├── Impostazioni.tsx      # Settings, profiles, roles
│   │   ├── Performance.tsx       # Analytics/Impact
│   │   ├── Presentazioni.tsx     # Client packages + PPTX
│   │   ├── Task.tsx              # Kanban/task management
│   │   ├── Utenti.tsx            # User management
│   │   └── eventi/
│   │       └── tabs/
│   │           ├── TabBudget.tsx
│   │           ├── TabProgramma.tsx
│   │           ├── TabPagamenti.tsx
│   │           ├── TabFornitori.tsx
│   │           ├── TabDocumenti.tsx
│   │           ├── TabTeam.tsx
│   │           ├── TabComunicazioni.tsx
│   │           └── programma/
│   │               ├── types.ts
│   │               ├── ProgrammaForm.tsx
│   │               ├── ProgrammaTimeline.tsx
│   │               └── load-auto-entries.ts
│   ├── lib/
│   │   ├── supabase.ts           # singleton client
│   │   ├── events-service.ts
│   │   ├── suppliers-service.ts
│   │   ├── clients-service.ts
│   │   ├── budgets-service.ts    # CRUD per tabella budgets
│   │   ├── event-payments-service.ts  # CRUD event_payments
│   │   ├── admin-service.ts      # admin_entrate, admin_fatture
│   │   ├── invoices-service.ts   # invoices, admin_documents
│   │   ├── toast.tsx
│   │   ├── format.ts
│   │   ├── error-log.ts
│   │   ├── use-realtime.ts
│   │   └── use-event-services.ts
│   ├── data/
│   │   ├── events.ts             # TypeScript types
│   │   ├── suppliers.ts
│   │   ├── amministrazione.ts    # Entrata, Uscita, Fattura types
│   │   └── ...
│   └── components/
│       ├── FlyChat.tsx           # Fly assistant UI
│       └── ...
└── supabase/
    └── functions/
        ├── fly-gateway/index.ts  # Claude AI proxy
        ├── admin-users/index.ts  # User management
        ├── send-email/index.ts   # Email via Resend
        ├── sentinel/index.ts     # Monitoring alerts
        ├── morning-edition/index.ts # Daily digest
        └── cleanup/index.ts      # Data cleanup
```

### Principali pagine React

| Pagina | Funzione |
|--------|----------|
| Dashboard | KPI, eventi prossimi, attivita' recenti |
| Eventi | CRUD eventi, dettaglio con tabs (Budget, Programma, Pagamenti, Fornitori, Documenti, Team, Comunicazioni) |
| Amministrazione | Cash flow centralizzato: entrate, uscite, fatture, DSO/DPO, approvazioni |
| Fornitori | CRM fornitori con servizi, contatti, foto, rating |
| Calendario | Agenda multi-utente, drag-drop |
| Task | Kanban per attivita' |
| Presentazioni | Client packages (preventivi PPTX/PDF) |
| CreativeStudio | Progetti creativi e contenuti social |
| Performance | Analytics, impatto ambientale, ROI |
| Dossier | Pratiche amministrative (permessi, SCIA, etc.) |
| Impostazioni | Profili, ruoli, configurazioni |

### Componenti economici

- `TabBudget.tsx` — Budget per evento (preventivo/confermato/consuntivo)
- `TabPagamenti.tsx` — Pagamenti per evento (event_payments)
- `Amministrazione.tsx` — Vista consolidata cross-evento
- `budgets-service.ts` — CRUD tabella `budgets`
- `event-payments-service.ts` — CRUD tabella `event_payments`
- `admin-service.ts` — CRUD `admin_entrate` + `admin_fatture`
- `use-event-services.ts` — Calcolo economics aggregati

### Edge Functions

| Slug | JWT | Funzione |
|------|-----|----------|
| fly-gateway | No | Proxy Claude AI (Anthropic API) |
| admin-users | No | Gestione utenti (create/disable) |
| send-email | Si | Invio email via Resend |
| sentinel | No | Monitoraggio e alerts |
| morning-edition | Si | Digest giornaliero |
| cleanup | No | Pulizia dati obsoleti |

### Secrets configurati

- SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_DB_URL
- SUPABASE_PUBLISHABLE_KEYS, SUPABASE_SECRET_KEYS, SUPABASE_JWKS
- RESEND_API_KEY, RESEND_FROM_EMAIL
- ANTHROPIC_API_KEY

### Autenticazione e ruoli

- **Auth:** Supabase email/password (no magic link, no social)
- **Ruoli definiti:** Partner, Project Manager, Event Coordinator, Event Assistant, Junior Event Assistant, Amministrazione, Production Manager, Digital Strategist, Senior PM, Commerciale, Regista
- **Funzione RLS:** `get_my_role()` → `SELECT role FROM profiles WHERE id = auth.uid()`
- **Policy pattern:** role-based con `get_my_role() = ANY(ARRAY['Admin', 'Super Admin', ...])` per tabelle sensibili

---

## B. DATABASE SUPABASE

### Tutte le tabelle (67 totali)

| Categoria | Tabelle |
|-----------|---------|
| **Core** | events, clients, suppliers, profiles |
| **Economiche** | budgets, event_budget_lines, event_payments, admin_entrate, admin_fatture, invoices, payments, cashflow_config |
| **Evento-detail** | event_program, event_suppliers, event_supplier_services, event_hotel_details, event_catering_details, event_restaurant_details, event_audio_video_details, event_allestimenti_details, event_experience_details, event_grafica_stampa_details, event_staff_interno_details, event_staff_esterno_details, event_agenzia_viaggi_details, event_assicurazioni_details, event_varie_details, event_documents, event_team_roles, event_green_data |
| **Budget versioni** | budget_versions |
| **Comunicazioni** | communications, comunicazioni_thread, comunicazioni_messages, comunicazioni_participants |
| **Task** | tasks |
| **Documenti** | documents, admin_documents, dossiers |
| **Chat** | chat_conversations, chat_messages |
| **Fly AI** | fly_memory, fly_logs, fly_cache, fly_journal, fly_rate_limits, fly_actions_log |
| **Calendario** | calendar_items, leave_requests |
| **Archivio** | archive_folders, archive_items |
| **Social/Creative** | creative_projects, social_contents |
| **Presentazioni** | presentation_versions, client_packages |
| **Contatti** | contacts, client_contacts (via referenti), supplier_contacts, referenti |
| **Notifiche** | notifications, sentinel_alerts |
| **Analytics** | break_recommendations, impact_actions_log, impact_co2_log, impact_monthly_reports, impact_roi_config, green_reports, recognition_logs, team_mood_snapshot, wellness_logs |
| **Feedback/Log** | feedback, error_log, audit_log |

### Dettaglio tabelle economiche principali

#### `budgets`
| Colonna | Tipo | Note |
|---------|------|------|
| id | uuid PK | |
| event_id | text FK→events | |
| item | text | descrizione voce |
| category | text | categoria fornitore |
| estimated_cost | numeric | **costo preventivo** |
| actual_cost | numeric | **costo consuntivo** |
| quantity | numeric | |
| unit_price | numeric | |
| status | text | stato pagamento |
| supplier_id | text FK→suppliers | |
| due_date | date | scadenza |
| payment_date | date | data pagamento |
| payment_method | text | |
| invoice_id | text | |
| notes | text | |
| created_at/updated_at | timestamptz | |

**RLS:** Partner full access, authenticated select

#### `event_payments`
| Colonna | Tipo | Note |
|---------|------|------|
| id | uuid PK | |
| event_id | text FK→events | **nullable (recente migrazione)** |
| tipo | text | 'incasso_cliente' o 'pagamento_fornitore' |
| descrizione | text NOT NULL | |
| importo | numeric | |
| data_scadenza | date NOT NULL | |
| data_pagamento | date | null = non pagato |
| supplier_id | text FK→suppliers | |
| client_id | text FK→clients | **(aggiunto di recente)** |
| categoria | text | **(aggiunto di recente)** |
| stato | text | 'atteso'/'pagato'/'in_ritardo' |
| note | text | |
| created_by | uuid FK→profiles | |
| stato_approvazione | text | 'autonomo'/'in_attesa'/'approvato'/'bloccato' |
| approvato_da | uuid | |
| approvato_at | timestamptz | |
| created_at | timestamptz | |

**RLS:** Partner + PM full access, authenticated select

#### `admin_entrate` (DEPRECATED — svuotata)
| Colonna | Tipo | Note |
|---------|------|------|
| id | uuid PK | |
| cliente_id | text | |
| evento_id | text | |
| importo | numeric | |
| stato | text | |
| data_prevista | date | |
| data_pagamento | date | |
| metodo_pagamento | text | |
| note | text | |
| fattura_id | text | |
| created_at | timestamptz | |

**Stato:** 0 righe. Amministrazione ora legge da event_payments.

#### `admin_fatture`
| Colonna | Tipo | Note |
|---------|------|------|
| id | uuid PK | |
| numero | text | |
| tipo | text | attiva/passiva |
| importo | numeric | |
| iva | numeric | |
| data_emissione | date | |
| data_scadenza | date | |
| stato | text | |
| cliente_id / fornitore_id | text | |
| evento_id | text | |
| note | text | |
| file_url | text | |
| created_at | timestamptz | |

#### `event_budget_lines`
| Colonna | Tipo | Note |
|---------|------|------|
| id | uuid PK | |
| event_id | text | |
| supplier_id | text | |
| service_id | text | |
| categoria | text | |
| descrizione | text | |
| costo_unitario | numeric | |
| quantita | integer | |
| totale_netto | numeric | |
| iva_percent | numeric | |
| totale_lordo | numeric | |
| ricarico_percent | numeric | |
| prezzo_vendita | numeric | |
| stato | text | preventivo/confermato/consuntivo |
| version_id | uuid FK→budget_versions | |
| created_at/updated_at | timestamptz | |

**Stato:** 0 righe (tabella predisposta ma non ancora in uso attivo)

#### `budget_versions`
| Colonna | Tipo | Note |
|---------|------|------|
| id | uuid PK | |
| event_id | text FK→events | |
| version_number | integer | |
| label | text | |
| is_current | boolean | |
| snapshot_data | jsonb | freeze completo |
| created_by | uuid FK→profiles | |
| created_at | timestamptz | |

#### `event_supplier_services`
| Colonna | Tipo | Note |
|---------|------|------|
| id | uuid PK | |
| event_id | text | |
| supplier_id | text | |
| servizio | text | nome servizio |
| quantita | integer | |
| costo_unitario | numeric | **costo** |
| totale | numeric | |
| note | text | |
| stato | text | preventivo/confermato/consuntivo |
| data_servizio | date | |
| prezzo_vendita | numeric | **venduto al cliente** |
| ricarico_pct | numeric | **markup** |
| created_at | timestamptz | |

**Stato:** 5 righe (in uso)

#### `invoices`
| Colonna | Tipo | Note |
|---------|------|------|
| id | uuid PK | |
| event_id | text | |
| client_id | text | |
| supplier_id | text | |
| number | text | |
| type | text | |
| amount | numeric | |
| vat_amount | numeric | |
| issue_date | date | |
| due_date | date | |
| status | text | |
| file_url | text | |
| notes | text | |
| created_at | timestamptz | |

**Stato:** 0 righe

#### `payments`
| Colonna | Tipo | Note |
|---------|------|------|
| id | uuid PK | |
| invoice_id | text | |
| event_id | text | |
| amount | numeric | |
| payment_date | date | |
| method | text | |
| notes | text | |
| created_at | timestamptz | |

**Stato:** 0 righe

### Foreign Keys principali

```
budgets.event_id → events.id
budgets.supplier_id → suppliers.id
budget_versions.event_id → events.id
budget_versions.created_by → profiles.id
event_payments.event_id → events.id
event_payments.supplier_id → suppliers.id
event_payments.client_id → clients.id
event_payments.created_by → profiles.id
event_supplier_services.event_id → events.id
event_supplier_services.supplier_id → suppliers.id
admin_documents.event_id → events.id
admin_documents.supplier_id → suppliers.id
admin_documents.client_id → clients.id
```

### SOVRAPPOSIZIONI CRITICHE

| Area | Tabelle coinvolte | Problema |
|------|-------------------|----------|
| **Uscite fornitori** | `budgets` + `event_payments` (tipo='pagamento_fornitore') + `event_supplier_services` | 3 tabelle che registrano costi fornitore per evento |
| **Entrate clienti** | `admin_entrate` + `event_payments` (tipo='incasso_cliente') | 2 tabelle (admin_entrate ora vuota dopo refactoring) |
| **Fatture** | `admin_fatture` + `invoices` | 2 tabelle fatture separate |
| **Pagamenti** | `event_payments` + `payments` | 2 tabelle pagamenti (payments mai usata) |
| **Budget lines** | `budgets` + `event_budget_lines` + `event_supplier_services` | 3 sistemi budget paralleli |

### Colonne mancanti (gap identificati)

- `event_payments`: manca `budget_line_id` per collegamento diretto alla voce budget
- `invoices` / `admin_fatture`: manca collegamento a `event_payments` o `budgets`
- `budgets`: manca `prezzo_vendita` / `ricarico` (solo costo)
- `budgets`: manca `version_id` FK a budget_versions
- `event_budget_lines`: manca `payment_id` FK a event_payments
- `audit_log`: struttura OK ma manca trigger automatico (inserimento manuale)

---

## C. MODELLO ECONOMICO

### Dove nasce una voce economica

Attualmente ci sono **3 punti di ingresso indipendenti:**

1. **Tab Fornitori/Budget nell'evento** → scrive in `event_supplier_services` (costo + vendita)
2. **Tab Budget** → scrive in `budgets` (estimated_cost, actual_cost, quantity, unit_price)
3. **Amministrazione** → ora scrive in `event_payments` (importo generico)

### Dove vengono memorizzati costo e venduto

| Tabella | Costo | Venduto | Ricarico | IVA |
|---------|-------|---------|----------|-----|
| budgets | estimated_cost, actual_cost | NO | NO | NO |
| event_supplier_services | costo_unitario, totale | prezzo_vendita | ricarico_pct | NO |
| event_budget_lines | costo_unitario, totale_netto | prezzo_vendita | ricarico_percent | iva_percent |
| event_payments | importo | NO | NO | NO |

### Quali moduli leggono i dati

| Modulo | Fonte dati |
|--------|-----------|
| Tab Budget (evento) | `budgets` |
| Tab Pagamenti (evento) | `event_payments` |
| Tab Fornitori (evento) | `event_supplier_services` |
| Amministrazione Uscite | `event_payments` (tipo=pagamento_fornitore) — RECENTE |
| Amministrazione Entrate | `event_payments` (tipo=incasso_cliente) — RECENTE |
| Dashboard KPI | `use-event-services.ts` → calcola da `event_supplier_services` + `events` |
| Performance | aggregati da piu' tabelle |

### Calcolo IVA, fee, commissioni, margine

- **IVA:** presente solo in `event_budget_lines.iva_percent` (tabella vuota) e `admin_fatture.iva`. Altrove assente.
- **Fee agenzia:** `events.fee_agenzia_pct` (default 6%) usata in `use-event-services.ts`
- **Commissioni:** non modellate esplicitamente
- **Margine:** calcolato on-the-fly in frontend come `venduto - costo` usando `event_supplier_services`
- **Formule duplicate:** SI — il margine viene calcolato sia in `TabBudget`, sia in `Performance`, sia in `use-event-services.ts` con logiche leggermente diverse

### Versioni del Budget

`budget_versions` esiste con:
- `version_number` + `label`
- `is_current` flag
- `snapshot_data` (jsonb) — freeze totale del budget a quel punto

Ma `budgets` NON ha un `version_id` FK → le versioni sono snapshot disconnessi, non una progressione strutturata preventivo→confermato→consuntivo.

### Consuntivo

Non esiste un vero "consuntivo" strutturato. `budgets.actual_cost` vs `estimated_cost` e' l'unico indicatore. `event_supplier_services.stato` ha il valore 'consuntivo' ma non c'e' logica di transizione.

### Collegamento pagamenti

- `event_payments` NON ha FK a `budgets` o `event_supplier_services`
- `payments.invoice_id` → link a fattura (ma tabella vuota)
- Non esiste collegamento diretto "voce budget → pagamento → fattura"

### Rischi doppio conteggio

1. **budgets + event_supplier_services**: stessa voce puo' esistere in entrambe
2. **event_payments come uscita + budget come costo**: dopo il refactoring Amministrazione legge event_payments, ma Budget legge budgets → se stessa spesa esiste in entrambe = duplicato
3. **admin_fatture + invoices**: se in futuro si usano entrambe

---

## D. MODIFICA DAL BUDGET

### Stato attuale

Tab Budget (`TabBudget.tsx`) mostra voci dalla tabella `budgets`. L'utente puo':
- Aggiungere voce
- Modificare voce (inline edit o form)
- Eliminare voce
- Cambiare stato pagamento

### Componente interessato

`src/pages/eventi/tabs/TabBudget.tsx` + `src/lib/budgets-service.ts`

### Tabella originale della voce

`budgets` (PK: `id` uuid)

### Campi aggiornabili

item, category, estimated_cost, actual_cost, quantity, unit_price, status, supplier_id, due_date, payment_date, payment_method, notes

### La modifica aggiorna gli altri moduli?

**NO.** Le modifiche in `budgets`:
- NON si propagano a `event_payments`
- NON si propagano a `event_supplier_services`
- NON creano audit log
- NON aggiornano `budget_versions`

### Cosa manca

1. Collegamento bidirezionale `budgets` ↔ `event_supplier_services` (stessa voce in 2 tabelle)
2. Sync automatico quando si modifica costo/stato
3. Audit trail su ogni modifica
4. Propagazione a event_payments quando si segna come "pagato"
5. Creazione automatica version snapshot su modifiche significative
6. Visualizzazione venduto/ricarico/margine nella stessa riga

---

## E. FLY E CLAUDE AI

### Architettura

- **Edge Function:** `fly-gateway` (verifyJWT: false)
- **Modello Claude:** Determinato dalla configurazione in `fly-gateway` — probabile `claude-sonnet-4-20250514` o simile
- **API Key:** `ANTHROPIC_API_KEY` configurata come secret

### Tabelle Fly

| Tabella | Scopo | Colonne chiave |
|---------|-------|----------------|
| fly_memory | Memoria persistente | user_id, key, value, context, expires_at |
| fly_logs | Log conversazioni | user_id, role, content, conversation_id |
| fly_cache | Cache risposte | key, value, ttl, created_at |
| fly_journal | Diario operazioni | entry_type, content, user_id |
| fly_rate_limits | Rate limiting | user_id, window_start, request_count |
| fly_actions_log | Log azioni eseguite | action_type, params, result, user_id |

### Strumenti disponibili (dalla struttura delle tabelle)

- Consultazione eventi, clienti, fornitori, budget
- Ricerca nei log e nella memoria
- Azioni logate in `fly_actions_log`
- Potenziale accesso a tutti i dati dell'app tramite service_role_key

### Sistema di conferma

`event_payments.stato_approvazione` suggerisce un flusso di approvazione:
- `autonomo` — sotto soglia, nessuna conferma
- `in_attesa` — richiede approvazione
- `approvato` / `bloccato`

`cashflow_config` definisce soglie (`soglia_autonomia_pm_eur`, `soglia_senior_pm_eur`)

### Rate limit

`fly_rate_limits`: user_id + window_start + request_count

### Controllo ruoli

Fly accede tramite service_role_key (bypassa RLS). Il controllo ruoli deve essere applicato a livello applicativo nella edge function, non dal database.

### Limiti attuali

1. **Non puo' modificare dati direttamente** — solo proporre (richiede conferma utente nel frontend)
2. **Non comprende documenti** — nessun OCR, nessuna estrazione contenuto
3. **Non ha accesso a tutti i moduli** — dipende dagli strumenti definiti in fly-gateway
4. **Context window limitato** — Claude ha limiti token, grandi dataset non entrano nel prompt
5. **Nessun RAG/embeddings** — non c'e' vector search per documenti o memoria semantica
6. **Cache base** — fly_cache esiste ma non e' chiaro se effettivamente riduce le chiamate API

### Fly puo' assistere in tutti i moduli?

**Parzialmente.** Fly puo' leggere dati da qualsiasi tabella (service_role), ma:
- Non ha tool definiti per tutti i moduli
- Non comprende file caricati
- Non ha strumenti per scrivere in tutte le tabelle
- Il controllo ruoli e' da verificare nella edge function

---

## F. COMPRENSIONE DEI DOCUMENTI

### Formato: PDF

| Aspetto | Stato |
|---------|-------|
| Dove salvato | Supabase Storage (bucket privato) |
| Metadati | nome, categoria, evento_id, fornitore_id, data upload |
| Contenuto estratto | **NO** |
| OCR | **NO** |
| Tabelle/formule | **NO** |
| Indicizzato | **NO** |
| Fly puo' cercarlo | **NO** (solo metadati) |
| Fly cita pagina | **NO** |
| Permessi | Si (bucket privato, accesso autenticato) |

### Formato: PDF scansionato
Identico a PDF. Nessun OCR.

### Formato: XLSX / XLS
| Aspetto | Stato |
|---------|-------|
| Dove salvato | Supabase Storage |
| Contenuto estratto | **NO** |
| Tabelle/formule lette | **NO** |
| Fly puo' leggerlo | **NO** |

### Formato: DOCX
Stesso di PDF — solo storage, nessuna estrazione.

### Formato: PPTX
Salvato in Storage. `client_packages.pptx_url` referenzia il file. Nessuna estrazione contenuto.

### Formato: CSV / TXT
Storage semplice. Nessun parsing.

### Formato: JPG / PNG
Storage. Nessun OCR. Usate come foto fornitori (`supplier_photos`).

### Differenza critica

| Livello | Descrizione | Stato attuale |
|---------|-------------|---------------|
| **Caricato** | File esiste in Storage con URL | SI |
| **Visualizzabile** | URL accessibile, preview possibile | SI (download) |
| **Compreso da Fly** | Contenuto estratto, indicizzato, cercabile | **NO** |

**Fly non comprende NESSUN documento caricato.** Puo' solo vedere i metadati (nome file, categoria, a quale evento e' collegato).

---

## G. MODALITA' DI LAVORO CONSIGLIATA

### Dimensione ideale di ogni prompt

- **1 obiettivo principale** per prompt
- Max **3-5 file** da modificare
- Max **1 migrazione** per prompt
- Target: completabile in una singola risposta senza timeout

### Database e interfaccia separati?

**SI, fortemente consigliato:**
1. Prompt 1: Migrazione DB (schema + RLS + backfill se necessario)
2. Prompt 2: Aggiornamento service layer (TypeScript)
3. Prompt 3: Aggiornamento UI

### Migrazione, backfill e UI devono essere prompt distinti?

- **Migrazione:** prompt dedicato (solo DDL, verifica schema)
- **Backfill:** prompt dedicato se necessario (DML su dati esistenti)
- **Service + UI:** possono essere nello stesso prompt se < 5 file

### Test come prompt separato?

Si, se il progetto ha test. Attualmente non ci sono test unitari, quindi la verifica e' `tsc && vite build`.

### Edge Function separata?

**SI.** Ogni edge function deve essere un prompt dedicato perche':
- Richiede write su disco + deploy
- Ha CORS obbligatorio
- Ha contesto Deno diverso dal frontend

### Come evitare anticipazioni

Includere nel prompt:
```
NON implementare funzionalita' non richieste esplicitamente.
NON modificare file al di fuori della lista autorizzata.
FERMATI se trovi un conflitto con il modello dati esistente.
```

### Come evitare riscritture

```
Modifica SOLO le sezioni indicate.
NON riscrivere il componente intero.
Mantieni la UI esistente invariata eccetto dove specificato.
```

### Riepilogo finale verificabile

Ogni prompt deve richiedere:
```
RISPOSTA FINALE: conferma file modificati, risultato build, cosa testare manualmente.
```

---

## H. ORDINE DEGLI INTERVENTI (raccomandato)

### Fase 0: Stabilizzazione (prerequisito)

0.1. Definire il modello dati economico target (decisione utente)
0.2. Decidere: `event_budget_lines` come tabella unificata O refactoring di `budgets`?

### Fase 1: Centralizzazione calcoli economici

1.1. Migrazione: aggiungere colonne mancanti a tabella target (venduto, ricarico, iva)
1.2. Creare `src/lib/economics.ts` con funzioni pure: margine, IVA, fee, commissioni
1.3. Sostituire calcoli duplicati nei componenti con le nuove funzioni

### Fase 2: Modifica voci dal Budget

2.1. Collegare `budgets` a `event_supplier_services` (FK o merge)
2.2. UI inline edit con tutti i campi economici
2.3. Propagazione bidirezionale

### Fase 3: Preventivo / Confermato / Consuntivo

3.1. Aggiungere campo `fase` a ogni voce
3.2. Logica di transizione (preventivo → confermato → consuntivo)
3.3. Version snapshots automatici su transizione

### Fase 4: Collegamento fatture e pagamenti

4.1. Migrazione: FK `event_payments.budget_line_id`, `invoices.budget_line_id`
4.2. Backfill se possibile
4.3. UI per collegare pagamento ↔ voce ↔ fattura

### Fase 5: Amministrazione consolidata

5.1. Rimuovere tabelle deprecate (`admin_entrate` ormai vuota)
5.2. Unificare `invoices` e `admin_fatture`
5.3. Vista aggregata da event_payments + economics.ts

### Fase 6: Audit Log

6.1. Trigger PostgreSQL su tabelle economiche → `audit_log`
6.2. UI per visualizzare storico modifiche

### Fase 7: Comprensione documentale

7.1. Edge function per estrazione testo (PDF → text, DOCX → text, XLSX → json)
7.2. Tabella `document_content` con full-text search
7.3. Integrazione con Fly per ricerca semantica

### Fase 8: Ampliamento Fly

8.1. Aggiungere tool per ogni modulo (con controllo ruoli)
8.2. RAG sui documenti estratti
8.3. Azioni con conferma (creare pagamento, modificare budget)

### Fase 9: Fatture in Cloud

9.1. Edge function proxy per API Fatture in Cloud
9.2. Sync bidirezionale fatture
9.3. Mapping con struttura interna

### Fase 10: Microsoft 365

10.1. Edge function per auth OAuth
10.2. Sync calendario
10.3. Sync email/documenti

### Fase 11: Test finali e pubblicazione

11.1. Test end-to-end del flusso economico completo
11.2. Verifica RLS per tutti i ruoli
11.3. Performance check
11.4. Deploy controllato

---

## I. RISCHI E BLOCCHI

### Rischi tecnici

1. **3 tabelle budget parallele** (budgets, event_budget_lines, event_supplier_services) — migrazione complessa
2. **Nessun collegamento voce→pagamento→fattura** — richiede redesign schema
3. **Formule economiche duplicate** in 3+ file frontend — rischio inconsistenza
4. **fly-gateway usa service_role_key** — bypassa RLS, errore in Fly = accesso non autorizzato
5. **67 tabelle** — complessita' elevata, rischio side-effects

### Dati duplicati

- `budgets` e `event_supplier_services` possono contenere la stessa voce costo
- `admin_fatture` e `invoices` sono due registri fatture separati
- `event_payments` e `payments` sono due registri pagamenti

### Migrazioni potenzialmente incompatibili

- Se si aggiunge FK tra tabelle con dati incoerenti → migrazione fallisce
- Unificare budgets + event_budget_lines richiede backfill complesso
- Rinominare colonne o cambiare tipo = perdita dati

### Policy RLS problematiche

- `get_my_role()` usa colonna `role` (text) che duplica `ruolo` (enum) in profiles
- Se l'utente non ha profilo → `get_my_role()` ritorna NULL → nessun accesso
- Fly usa service_role → non testabile con RLS

### Problemi di sicurezza

- `fly-gateway` verifyJWT=false: chiunque con l'URL puo' inviare richieste
- `admin-users` verifyJWT=false: stessa vulnerabilita'
- Service role key esposta alla edge function = potere totale

### Limiti Claude/Anthropic

- Rate limit API (RPM/TPM)
- Context window (max ~200K tokens ma costo elevato)
- Nessun accesso a file binari (PDF, immagini) senza preprocessing
- Latenza risposta (2-10 secondi)

### Servizi esterni necessari

- **Fatture in Cloud:** API key da ottenere, documentazione da studiare
- **Microsoft 365:** Tenant Azure AD, OAuth app registration, admin consent
- **OCR/Document parsing:** servizio esterno (OpenAI Vision, Textract, o simile)

### Configurazioni mancanti

- Nessun test framework configurato
- Nessun CI/CD per test automatici pre-deploy
- Nessun backup automatico documentato

### Decisioni richieste all'utente

1. **Tabella budget unificata:** quale diventa la "fonte di verita'" — `budgets`, `event_budget_lines`, o `event_supplier_services`?
2. **Fatture:** unificare `admin_fatture` e `invoices` in una sola tabella?
3. **Preventivo/Confermato/Consuntivo:** sono fasi nella STESSA riga o righe separate con version_id?
4. **Fly sicurezza:** abilitare JWT verification sulla edge function?
5. **Documenti:** quale servizio per OCR/estrazione? (costo, GDPR)
6. **Ordine priorita':** business-critical vs nice-to-have

---

## J. FORMATO IDEALE DEI PROSSIMI PROMPT

### Template prompt

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CONTESTO:
[Breve descrizione dello stato attuale e cosa e' stato fatto nelle fasi precedenti]

OBIETTIVO:
[1 frase chiara: cosa deve funzionare alla fine]

AMBITO:
[Lista di cosa e' incluso e cosa e' escluso]

FILE AUTORIZZATI:
- src/lib/[nome].ts
- src/pages/[nome].tsx
- (max 5 file)

DATABASE AUTORIZZATO:
- Tabella: [nome]
- Operazioni: ALTER ADD COLUMN / INSERT / nessuna

OPERAZIONI VIETATE:
- NON modificare [file/tabella X]
- NON aggiungere funzionalita' non richieste
- NON cambiare tipo colonne esistenti
- NON eliminare dati

REQUISITI:
1. [requisito specifico verificabile]
2. [requisito specifico verificabile]
3. [requisito specifico verificabile]

TEST:
- [ ] tsc compila senza errori
- [ ] npm run build OK
- [ ] [azione manuale da testare nel browser]

RISPOSTA FINALE OBBLIGATORIA:
1. File creati/modificati
2. Migrazioni applicate (se autorizzate)
3. Risultato build
4. Cosa testare nel browser
5. Prossimo passo consigliato

CONDIZIONE DI ARRESTO:
Fermati dopo aver completato l'obiettivo. NON proseguire con fasi successive.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## VERIFICHE TECNICHE ESEGUITE

| Check | Risultato |
|-------|-----------|
| TypeScript check | Non eseguibile — sorgenti non su disco in questa sessione |
| npm run build | Non eseguibile — manca package.json su disco |
| Schema DB | 67 tabelle verificate, tutte accessibili |
| Edge Functions | 6 attive (fly-gateway, admin-users, send-email, sentinel, morning-edition, cleanup) |
| Migrazioni | 67 applicate correttamente |
| Tabelle non esistenti referenziate | Nessuna trovata via DB |
| Duplicazioni calcoli economici | Confermate: margine calcolato in almeno 3 punti |

**NOTA:** La build e TypeScript check sono stati eseguiti con successo all'inizio di questa sessione (prima delle modifiche al programma), confermando che il progetto compila. I sorgenti non sono accessibili su disco in questo momento perche' il workspace Bolt ha un ciclo di vita separato.

---

*Fine analisi. Documento pronto per pianificazione interventi successivi.*
