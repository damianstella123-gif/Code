import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { X, Send, Trash2, Zap, ChevronDown } from 'lucide-react'
import { suppliers } from '@/data/suppliers'
import { loadUser } from '@/lib/auth'
import type { Task } from '@/data/tasks'
import type { Event } from '@/data/events'
import type { Entrata, Uscita } from '@/data/amministrazione'
import type { EventoWorkflow } from '@/data/workflow'
import {
  loadTasksFromStorage,
  loadEventsFromStorage,
  loadWorkflowsFromStorage,
  loadEntrateFromStorage,
  loadUsciteFromStorage,
  loadClientsFromStorage,
} from '@/lib/storage'

// ─── Types ────────────────────────────────────────────────────────────────────

interface FlyMessage {
  id: string
  from: 'fly' | 'user'
  text: string
  time: string
  chips?: string[]
}

interface FlyNotif {
  id: string
  text: string
  level: 'info' | 'warn' | 'ok'
  dying?: boolean
}

// ─── localStorage ─────────────────────────────────────────────────────────────

const HISTORY_KEY = 'fly_history'

function loadHistory(): FlyMessage[] {
  try {
    const r = localStorage.getItem(HISTORY_KEY)
    return r ? JSON.parse(r) : []
  } catch { return [] }
}
function saveHistory(msgs: FlyMessage[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(msgs.slice(-60)))
}

// ─── Context analysis ─────────────────────────────────────────────────────────

function analyzeContext() {
  const allTasks = loadTasksFromStorage()
  const allEvents = loadEventsFromStorage()
  const allEntrate = loadEntrateFromStorage()
  const allUscite = loadUsciteFromStorage()
  const wfs = loadWorkflowsFromStorage()

  const taskBlocked = allTasks.filter((t: Task) => t.stato === 'da_fare' && t.priorita === 'alta')
  const taskScaduti = allTasks.filter((t: Task) => {
    const days = Math.ceil((new Date(t.scadenza).getTime() - Date.now()) / 86400000)
    return t.stato !== 'completato' && days < 0
  })
  const eventiInCorso = allEvents.filter((e: Event) => e.stato === 'in_corso')
  const eventiRitardo = allEvents.filter((e: Event) => {
    const completati = allTasks.filter((t: Task) => t.evento === e.id && t.stato === 'completato').length
    const tot = allTasks.filter((t: Task) => t.evento === e.id).length
    return tot > 0 && completati / tot < 0.5 && e.stato === 'in_corso'
  })
  const contrattiScadenza = suppliers.filter(s =>
    s.statoContratto === 'in_scadenza' || s.statoContratto === 'scaduto'
  )
  const pagamentiScaduti = allEntrate.filter((e: Entrata) => e.stato === 'scaduto')
  const usciteScadute = allUscite.filter((u: Uscita) => u.stato === 'scaduto')
  const totEntrate = allEntrate.reduce((s: number, e: Entrata) => s + e.importo, 0)
  const totUscite = allUscite.reduce((s: number, u: Uscita) => s + u.importo, 0)
  const margine = totEntrate - totUscite

  const wfBloccati = wfs.filter((w: EventoWorkflow) =>
    w.fasi.some(f => f.ordine === w.faseCorrenteOrdine &&
      f.taskCriticiIds.some((tid: string) => {
        const t = allTasks.find((x: Task) => x.id === tid)
        return t && t.stato !== 'completato'
      })
    )
  )
  const wfAvanzamenti = wfs.map((w: EventoWorkflow) => ({
    nome: allEvents.find((e: Event) => e.id === w.eventoId)?.nome ?? w.eventoId,
    pct: Math.round(w.fasi.reduce((s: number, f) => s + f.avanzamento, 0) / w.fasi.length),
  }))
  const wfInRitardo = wfAvanzamenti.filter(w => w.pct < 50)

  return {
    taskBlocked, taskScaduti, eventiInCorso, eventiRitardo,
    contrattiScadenza, pagamentiScaduti, usciteScadute,
    totEntrate, totUscite, margine,
    wfBloccati, wfAvanzamenti, wfInRitardo,
  }
}

// ─── Response engine ──────────────────────────────────────────────────────────

function flyRespond(input: string): { text: string; chips?: string[] } {
  const q = input.toLowerCase().trim()
  const ctx = analyzeContext()
  const user = loadUser()
  const firstName = user?.nome.split(' ')[0] ?? 'capo'

  // Greetings
  if (/^(ciao|hey|salve|hello|hi|buon|come stai|chi sei)/.test(q)) {
    const greets = [
      `Woof! Ehi ${firstName}! Sono Fly, il tuo fedele assistente a 4 zampe. Ho il naso dentro tutti i dati — dimmi cosa devo fiutare!`,
      `Ciao ${firstName}! *scodinzola* Fly qui, pronto a scavare nei numeri. Ho già annusato qualche novita per te!`,
      `Bau! ${firstName}! Sono operativo al 100% — coda dritta, orecchie dritte, dati sotto controllo. Cosa posso fare?`,
    ]
    return {
      text: greets[Math.floor(Math.random() * greets.length)],
      chips: ['Situazione generale', 'Task urgenti', 'Budget oggi'],
    }
  }

  // Task
  if (/task|compiti|attivit|todo|da fare|urgente/.test(q)) {
    const allT = loadTasksFromStorage()
    const alta = allT.filter(t => t.priorita === 'alta' && t.stato !== 'completato')
    const bloccati = allT.filter(t => t.stato === 'da_fare' && t.priorita === 'alta')
    if (alta.length === 0) {
      return { text: `Tutto pulito sui task alta priorità. 🟢 Nessun incendio in corso. Puoi respirare.`, chips: ['Task in corso', 'Situazione eventi'] }
    }
    const list = alta.slice(0, 3).map(t => `• ${t.titolo} (${t.priorita})`).join('\n')
    return {
      text: `⚠️ Ho trovato ${alta.length} task ad alta priorità aperti:\n\n${list}\n\n${bloccati.length > 0 ? `Di questi, ${bloccati.length} non sono ancora stati avviati. Vuoi che mando un reminder al team?` : 'Tutti in corso, ma tienili d\'occhio.'}`,
      chips: ['Manda reminder team', 'Chi è in ritardo?', 'Mostra tutti i task'],
    }
  }

  // Events
  if (/event|evento|fiera|conferenz|summit|festival|lancio/.test(q)) {
    const allEv = loadEventsFromStorage()
    const inCorso = allEv.filter(e => e.stato === 'in_corso')
    const piano = allEv.filter(e => e.stato === 'pianificazione')
    if (inCorso.length === 0 && piano.length === 0) {
      return { text: `Per ora non ci sono eventi attivi o in pianificazione. 💤 Momento di calma prima della prossima ondata.`, chips: ['Storico eventi', 'Situazione generale'] }
    }
    const lines = [...inCorso.map(e => `🔴 ${e.nome} — IN CORSO`), ...piano.slice(0, 2).map(e => `🔵 ${e.nome} — pianificazione`)].join('\n')
    return {
      text: `${inCorso.length} evento${inCorso.length !== 1 ? 'i' : ''} in corso, ${piano.length} in pianificazione:\n\n${lines}`,
      chips: ['Dettaglio Corporate Summit', 'Task collegati', 'Budget eventi'],
    }
  }

  // Budget / Finance
  if (/budget|soldi|finanz|margine|costi|entrate|uscite|pagament/.test(q)) {
    const marginePerc = ctx.totEntrate > 0 ? Math.round((ctx.margine / ctx.totEntrate) * 100) : 0
    const alert = ctx.pagamentiScaduti.length > 0
      ? `\n\n🚨 ${ctx.pagamentiScaduti.length} pagamento${ctx.pagamentiScaduti.length !== 1 ? 'i' : ''} scaduto${ctx.pagamentiScaduti.length !== 1 ? 'i' : ''} da riscuotere — vai in Amministrazione.`
      : ''
    return {
      text: `💶 Situazione economica:\n\nEntrate previste: €${(ctx.totEntrate / 1000).toFixed(0)}K\nUscite stimate: €${(ctx.totUscite / 1000).toFixed(0)}K\nMargine: €${(ctx.margine / 1000).toFixed(0)}K (${marginePerc}%)${alert}`,
      chips: ['Pagamenti scaduti', 'Fatture in sospeso', 'Fornitori'],
    }
  }

  // Suppliers
  if (/fornitore|fornitori|contratto|contratti/.test(q)) {
    const scad = ctx.contrattiScadenza
    const inattivi = suppliers.filter(s => s.stato === 'inattivo')
    if (scad.length === 0) {
      return { text: `Fornitori tutti in ordine. ✅ Nessun contratto in scadenza imminente. ${inattivi.length > 0 ? `(${inattivi.length} inattivo${inattivi.length !== 1 ? 'i' : ''})` : ''}`, chips: ['Lista fornitori', 'Costi fornitori'] }
    }
    const list = scad.map(s => `• ${s.nome} — ${s.statoContratto === 'scaduto' ? '🔴 SCADUTO' : '🟡 in scadenza'}`).join('\n')
    return {
      text: `Attenzione contratti:\n\n${list}\n\nVuoi che preparo un promemoria per i rinnovi?`,
      chips: ['Rinnova contratti', 'Lista fornitori', 'Budget fornitori'],
    }
  }

  // Clients / CRM
  if (/client|crm|trattativa|prospect|vip/.test(q)) {
    const clients = loadClientsFromStorage()
    const vip = clients.filter(c => c.stato === 'vip')
    const prospect = clients.filter(c => c.stato === 'prospect')
    const persi = clients.filter(c => c.stato === 'perso')
    return {
      text: `📊 Situazione CRM:\n\n🌟 VIP: ${vip.length} (${vip.map(c => c.nome.split(' ')[0]).join(', ')})\n🔵 Prospect: ${prospect.length} da convertire\n❌ Persi: ${persi.length} — possibile recupero Q3\n\nIl cliente con più fatturato è ${[...clients].sort((a,b) => b.fatturato - a.fatturato)[0]?.nome}.`,
      chips: ['Chi seguo domani?', 'Prospect prioritari', 'Fatturato top clienti'],
    }
  }

  // Workflow
  if (/workflow|processo|automaz|flusso|fase|avanzamento|ritardo workflow/.test(q)) {
    const { wfBloccati, wfAvanzamenti, wfInRitardo } = ctx
    const lines = wfAvanzamenti.map(w => `${w.pct >= 80 ? '🟢' : w.pct >= 50 ? '🔵' : '🟡'} ${w.nome} — ${w.pct}%`).join('\n')

    if (wfBloccati.length > 0 || wfInRitardo.length > 0) {
      const allEvs = loadEventsFromStorage()
      const bloccoTxt = wfBloccati.length > 0
        ? `\n\n🔴 Bloccati (task critici aperti):\n${wfBloccati.map(w => `• ${allEvs.find(e => e.id === w.eventoId)?.nome ?? w.eventoId}`).join('\n')}`
        : ''
      const ritardoTxt = wfInRitardo.length > 0
        ? `\n\n⏰ Workflow sotto 50%:\n${wfInRitardo.map(w => `• ${w.nome} — solo ${w.pct}%`).join('\n')}`
        : ''
      return {
        text: `Situazione workflow:\n\n${lines}${bloccoTxt}${ritardoTxt}\n\nVuoi che avviso il team responsabile?`,
        chips: ['Avvisa team', 'Task bloccanti', 'Situazione generale'],
      }
    }
    return {
      text: `⚡ Workflow tutti operativi:\n\n${lines}\n\nNessun blocco critico rilevato. 🟢`,
      chips: ['Task urgenti', 'Budget eventi', 'Situazione generale'],
    }
  }

  // Fase workflow specifica
  if (/fase|milestone|blocco|bloccato|avanzare|avanza/.test(q)) {
    const { wfBloccati } = ctx
    if (wfBloccati.length === 0) {
      return { text: `Nessun workflow bloccato in questo momento. Tutte le fasi attive sono sbloccate. ✅`, chips: ['Workflow status', 'Task urgenti'] }
    }
    const allEvs2 = loadEventsFromStorage()
    const allTsks2 = loadTasksFromStorage()
    const details = wfBloccati.map(w => {
      const fase = w.fasi.find(f => f.ordine === w.faseCorrenteOrdine)
      const ev = allEvs2.find(e => e.id === w.eventoId)
      const blkTasks = fase?.taskCriticiIds
        .map(tid => allTsks2.find(t => t.id === tid))
        .filter(t => t && t.stato !== 'completato')
        .map(t => t!.titolo) ?? []
      return `• ${ev?.nome ?? w.eventoId} fermo in "${fase?.nome}" — mancano: ${blkTasks.join(', ')}`
    }).join('\n')
    return {
      text: `⚠️ ${wfBloccati.length} workflow bloccati da task critici incompleti:\n\n${details}\n\nVuoi mandare un reminder diretto ai responsabili?`,
      chips: ['Manda reminder', 'Task urgenti', 'Workflow status'],
    }
  }

  // Situation general
  if (/situazione|status|panoramica|riepilogo|tutto|generale|oggi|report/.test(q)) {
    const issues: string[] = []
    if (ctx.taskBlocked.length > 0) issues.push(`⚠️ ${ctx.taskBlocked.length} task alta priorità non avviati`)
    if (ctx.taskScaduti.length > 0) issues.push(`🔴 ${ctx.taskScaduti.length} task scaduti`)
    if (ctx.eventiRitardo.length > 0) issues.push(`🕐 ${ctx.eventiRitardo.length} eventi con avanzamento sotto 50%`)
    if (ctx.contrattiScadenza.length > 0) issues.push(`📄 ${ctx.contrattiScadenza.length} contratti fornitori in scadenza`)
    if (ctx.pagamentiScaduti.length > 0) issues.push(`💸 ${ctx.pagamentiScaduti.length} pagamenti scaduti da incassare`)
    if (ctx.wfBloccati.length > 0) issues.push(`🔴 ${ctx.wfBloccati.length} workflow bloccati da task critici`)
    if (ctx.wfInRitardo.length > 0) issues.push(`🕐 ${ctx.wfInRitardo.length} workflow sotto 50% avanzamento`)

    if (issues.length === 0) {
      return {
        text: `Tutto verde, ${firstName}. 🟢 Nessuna criticità rilevata in questo momento. Simmetria Hub gira come un orologio svizzero.`,
        chips: ['Prossimi eventi', 'Task di oggi', 'Budget'],
      }
    }
    return {
      text: `Situazione attuale di Simmetria Hub:\n\n${issues.join('\n')}\n\nDimmi su quale problema vuoi che mi concentri.`,
      chips: ['Task urgenti', 'Problemi budget', 'Fornitori'],
    }
  }

  // Search tip
  if (/cerca|ricerca|trovare|find|search/.test(q)) {
    return {
      text: `🔍 Usa la barra di ricerca in alto (⌘K) per cercare tutto in Simmetria Hub:\n\n• Eventi, task, clienti\n• Fornitori, utenti\n• Comunicazioni, workflow\n\nI risultati rispettano i tuoi permessi e vengono evidenziati in tempo reale. Puoi navigare con ↑↓ e aprire con Invio.`,
      chips: ['Situazione generale', 'Task urgenti', 'Workflow status'],
    }
  }

  // Calendar / scadenze
  if (/calendario|scadenz|questa settimana|oggi|prossim|agenda|conflict|sovrapposti/.test(q)) {
    const today = new Date(); today.setHours(0,0,0,0)
    const addD = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
    const next7 = addD(today, 7)
    const allEv2 = loadEventsFromStorage()
    const allT2 = loadTasksFromStorage()

    const eventsThisWeek = allEv2.filter(e => {
      const d = new Date(e.dataInizio)
      return d >= today && d <= next7
    })
    const tasksThisWeek = allT2.filter(t => {
      const d = new Date(t.scadenza)
      return d >= today && d <= next7 && t.stato !== 'completato'
    })
    const urgentThisWeek = tasksThisWeek.filter(t => t.priorita === 'alta')
    const overdueTasks = allT2.filter(t => new Date(t.scadenza) < today && t.stato !== 'completato')

    const lines: string[] = []
    if (eventsThisWeek.length > 0) {
      lines.push(`📅 ${eventsThisWeek.length} evento${eventsThisWeek.length !== 1 ? 'i' : ''} questa settimana:`)
      eventsThisWeek.slice(0, 3).forEach(e => lines.push(`  • ${e.nome} — ${new Date(e.dataInizio).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })}`))
    }
    if (urgentThisWeek.length > 0) lines.push(`\n⚠️ ${urgentThisWeek.length} task urgenti in scadenza entro 7 giorni`)
    if (overdueTasks.length > 0) lines.push(`\n🔴 ${overdueTasks.length} task già scaduti senza completamento`)
    if (lines.length === 0) lines.push('Settimana tranquilla! Nessuna urgenza imminente. 🟢')

    return {
      text: `Situazione calendario:\n\n${lines.join('\n')}`,
      chips: ['Scadenze oggi', 'Task urgenti', 'Agenda prossima settimana'],
    }
  }

  // Conflitti o eventi sovrapposti
  if (/conflitto|overlap|sovrapposti/.test(q)) {
    const eventsInCorso = loadEventsFromStorage().filter(e => e.stato === 'in_corso')
    if (eventsInCorso.length > 1) {
      return {
        text: `⚠️ Ho trovato ${eventsInCorso.length} eventi contemporaneamente in corso:\n\n${eventsInCorso.map(e => `• ${e.nome}`).join('\n')}\n\nVerifica la disponibilità del team nei Workflow e nel Calendario.`,
        chips: ['Workflow status', 'Team disponibilità', 'Situazione generale'],
      }
    }
    return { text: `Nessun conflitto rilevato nel calendario. 🟢 Un solo evento in corso per volta.`, chips: ['Calendario', 'Workflow status'] }
  }

  // Reminder
  if (/reminder|promemoria|notifica|ricorda|avvisa|manda/.test(q)) {
    return {
      text: `📣 Reminder simulato inviato al team! (demo mode)\n\nIn produzione, Fly può inviare notifiche push, email digest e messaggi Slack ai membri del team con task in ritardo.`,
      chips: ['Task urgenti', 'Chi è in ritardo?'],
    }
  }

  // Help
  if (/aiuto|help|cosa sai|cosa puoi|funzioni/.test(q)) {
    return {
      text: `Ecco cosa so fare:\n\n📋 Task — urgenti, scaduti, assegnati\n📅 Calendario — scadenze, conflitti, agenda\n⚡ Workflow — fasi, avanzamento, blocchi\n🗓️ Eventi — status, team, avanzamento\n💶 Budget — margini, pagamenti, fatture\n🏢 Fornitori — contratti, rating, costi\n👥 CRM — clienti, trattative, pipeline\n🔍 Ricerca — usa la barra in alto (⌘K) per cercare tutto\n🚨 Alert — problemi e criticità\n\nDimmi solo di cosa hai bisogno!`,
      chips: ['Situazione generale', 'Task urgenti', 'Workflow bloccati'],
    }
  }

  // Chi sono in ritardo
  if (/ritardo|in ritardo|chi è|chi sono|chi non/.test(q)) {
    const overdueTaskers = loadTasksFromStorage()
      .filter(t => {
        const days = Math.ceil((new Date(t.scadenza).getTime() - Date.now()) / 86400000)
        return t.stato !== 'completato' && days < 0
      })
    if (overdueTaskers.length === 0) {
      return { text: `Nessuno in ritardo! 🎉 Il team è in pari. Complimenti.`, chips: ['Task urgenti', 'Prossime scadenze'] }
    }
    return {
      text: `${overdueTaskers.length} task scaduti senza completamento:\n\n${overdueTaskers.slice(0, 4).map(t => `• ${t.titolo}`).join('\n')}\n\nVuoi che mando un reminder diretto?`,
      chips: ['Manda reminder', 'Vedi tutti i task'],
    }
  }

  // Default
  const fallbacks = [
    `*inclina la testa* Non ho capito bene... Prova con: "task urgenti", "budget", "eventi in corso" o "situazione generale".`,
    `Hmm, questa mi fa drizzare le orecchie ma non so come rispondere. Dimmi qualcosa di piu operativo!`,
    `*annusa confuso* Ottima domanda ma fuori dal mio territorio. Prova "situazione generale" per un riepilogo completo.`,
  ]
  return {
    text: fallbacks[Math.floor(Math.random() * fallbacks.length)],
    chips: ['Situazione generale', 'Task urgenti', 'Budget'],
  }
}

// ─── Proactive notifications ──────────────────────────────────────────────────

function getProactiveNotif(): FlyNotif | null {
  const ctx = analyzeContext()
  const pool: FlyNotif[] = []

  if (ctx.taskBlocked.length > 0)
    pool.push({ id: 'n1', text: `⚠️ ${ctx.taskBlocked.length} task urgenti non avviati`, level: 'warn' })
  if (ctx.taskScaduti.length > 0)
    pool.push({ id: 'n2', text: `🔴 ${ctx.taskScaduti.length} task scaduti — azione richiesta`, level: 'warn' })
  if (ctx.eventiInCorso.length > 0)
    pool.push({ id: 'n3', text: `🚀 ${ctx.eventiInCorso[0].nome} è in corso`, level: 'info' })
  if (ctx.contrattiScadenza.length > 0)
    pool.push({ id: 'n4', text: `📄 ${ctx.contrattiScadenza.length} contratti in scadenza`, level: 'warn' })
  if (ctx.pagamentiScaduti.length > 0)
    pool.push({ id: 'n5', text: `💸 ${ctx.pagamentiScaduti.length} pagamenti scaduti`, level: 'warn' })
  if (ctx.margine > 0)
    pool.push({ id: 'n6', text: `💚 Margine positivo: €${(ctx.margine / 1000).toFixed(0)}K`, level: 'ok' })
  if (ctx.wfBloccati.length > 0)
    pool.push({ id: 'n7', text: `🔴 ${ctx.wfBloccati.length} workflow bloccati — task critici aperti`, level: 'warn' })
  if (ctx.wfInRitardo.length > 0)
    pool.push({ id: 'n8', text: `⚠️ Workflow ${ctx.wfInRitardo[0]?.nome} fermo al ${ctx.wfInRitardo[0]?.pct}%`, level: 'warn' })

  // Calendar-based proactive notifs
  const todayD = new Date(); todayD.setHours(0,0,0,0)
  const addDLocal = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
  const todayTasks = loadTasksFromStorage().filter(t => {
    const d = new Date(t.scadenza); d.setHours(0,0,0,0)
    return d.getTime() === todayD.getTime() && t.stato !== 'completato'
  })
  const tomorrowEvents = loadEventsFromStorage().filter(e => {
    const d = new Date(e.dataInizio); d.setHours(0,0,0,0)
    return d.getTime() === addDLocal(todayD, 1).getTime()
  })
  if (todayTasks.length > 0)
    pool.push({ id: 'n9', text: `📋 ${todayTasks.length} task in scadenza oggi`, level: 'warn' })
  if (tomorrowEvents.length > 0)
    pool.push({ id: 'n10', text: `🗓️ ${tomorrowEvents[0].nome} è domani!`, level: 'info' })

  if (pool.length === 0) return null
  return pool[Math.floor(Math.random() * pool.length)]
}

// ─── FLY SVG Mascot (Simmetria Hub Official Mascot) ──────────────────────────
// Based on the official Fly character sheet - golden Labrador/Segugio puppy
// with dark tech harness, red "S" medallion, and expressive brown eyes

type FlyState = 'idle' | 'listening' | 'processing' | 'suggesting' | 'success' | 'error'

function FlyMascot({ size = 56, state = 'idle' }: { size?: number; state?: FlyState }) {
  const tailClass = state === 'success' ? 'fly-tail-wag-fast' : state === 'error' ? '' : 'fly-tail-wag'
  const earClass = state === 'listening' ? 'fly-ears-perk' : state === 'processing' ? '' : 'fly-ears-idle'
  const bodyClass = state === 'idle' ? 'fly-body-breathe' : state === 'processing' ? 'fly-body-think' : ''

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block' }}
      className={bodyClass}
    >
      <defs>
        <linearGradient id="flyBodyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#e8b860" />
          <stop offset="100%" stopColor="#c89040" />
        </linearGradient>
        <linearGradient id="flyHarnessGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#2a2a3e" />
          <stop offset="100%" stopColor="#1a1a28" />
        </linearGradient>
      </defs>

      {/* Ground shadow */}
      <ellipse cx="50" cy="96" rx="18" ry="3" fill="rgba(0,0,0,0.35)" />

      {/* Tail - fluffy, upright, golden with lighter tip */}
      <g className={tailClass} style={{ transformOrigin: '68px 60px' }}>
        <path d="M66 62 Q75 50 78 42 Q79 38 77 40 Q74 46 72 52 Q70 57 67 61" fill="#dcb058" />
        <path d="M68 60 Q75 50 77 44" stroke="#f0d080" strokeWidth="2" fill="none" strokeLinecap="round" />
        <path d="M69 58 Q73 52 75 47" stroke="#f8e0a0" strokeWidth="1" fill="none" opacity="0.6" />
      </g>

      {/* Back legs */}
      <rect x="32" y="73" width="10" height="18" rx="5" fill="#c89040" />
      <rect x="57" y="73" width="10" height="18" rx="5" fill="#c89040" />
      {/* Back paws - chunky, cream colored (puppy paws from reference) */}
      <ellipse cx="37" cy="91" rx="6.5" ry="4.5" fill="#f5ecd8" />
      <ellipse cx="62" cy="91" rx="6.5" ry="4.5" fill="#f5ecd8" />
      {/* Paw toe lines */}
      <path d="M34.5 91 Q35 89.5 35.5 91" stroke="rgba(180,140,80,0.3)" strokeWidth="0.5" fill="none" />
      <path d="M37 91 Q37.5 89.5 38 91" stroke="rgba(180,140,80,0.3)" strokeWidth="0.5" fill="none" />
      <path d="M59.5 91 Q60 89.5 60.5 91" stroke="rgba(180,140,80,0.3)" strokeWidth="0.5" fill="none" />
      <path d="M62 91 Q62.5 89.5 63 91" stroke="rgba(180,140,80,0.3)" strokeWidth="0.5" fill="none" />

      {/* Body - golden/sandy */}
      <ellipse cx="50" cy="67" rx="22" ry="18" fill="url(#flyBodyGrad)" />
      {/* Body light highlight */}
      <ellipse cx="45" cy="62" rx="10" ry="8" fill="rgba(240,200,100,0.12)" />

      {/* Chest - lighter cream (visible white patch from reference) */}
      <ellipse cx="50" cy="68" rx="13" ry="15" fill="#f5e8cc" />
      <ellipse cx="50" cy="65" rx="9" ry="11" fill="#faf4e8" />

      {/* === TECH HARNESS (key distinguishing feature) === */}
      {/* Main harness body - covers back */}
      <path d="M32 53 Q50 48 68 53 L66 72 Q50 76 34 72 Z" fill="url(#flyHarnessGrad)" stroke="#3a3a50" strokeWidth="0.6" />
      {/* Shoulder straps */}
      <path d="M36 53 Q38 48 40 50 L38 56" fill="#1e1e30" stroke="#3a3a50" strokeWidth="0.4" />
      <path d="M64 53 Q62 48 60 50 L62 56" fill="#1e1e30" stroke="#3a3a50" strokeWidth="0.4" />
      {/* Top strap across chest */}
      <path d="M36 55 Q50 52 64 55" stroke="#1a1a2e" strokeWidth="3.5" fill="none" strokeLinecap="round" />
      <path d="M36 55 Q50 52 64 55" stroke="#2e2e44" strokeWidth="2" fill="none" strokeLinecap="round" />
      {/* Harness side panels with red LED accents */}
      <rect x="35" y="57" width="3" height="10" rx="1.5" fill="#cc1a3a" opacity="0.7" className="fly-glow-pulse-sm" />
      <rect x="62" y="57" width="3" height="10" rx="1.5" fill="#cc1a3a" opacity="0.7" className="fly-glow-pulse-sm" />
      {/* Center buckle */}
      <rect x="46" y="52" width="8" height="4" rx="2" fill="#2a2a40" stroke="#cc1a3a" strokeWidth="0.6" />
      <rect x="48" y="53" width="4" height="2" rx="1" fill="rgba(204,26,58,0.4)" className="fly-glow-pulse-sm" />
      {/* SIMMETRIA text on harness side */}
      <text x="57" y="64" fontSize="3" fill="rgba(200,200,220,0.5)" fontFamily="sans-serif" fontWeight="600" letterSpacing="0.3">SIMMETRIA</text>
      {/* Red triangle logo on harness */}
      <path d="M65 60 L67.5 64 L62.5 64 Z" fill="#cc1a3a" opacity="0.6" />
      {/* Harness texture lines */}
      <path d="M40 60 L40 68" stroke="rgba(100,100,140,0.15)" strokeWidth="0.4" />
      <path d="M45 58 L45 70" stroke="rgba(100,100,140,0.1)" strokeWidth="0.4" />
      <path d="M55 58 L55 70" stroke="rgba(100,100,140,0.1)" strokeWidth="0.4" />
      <path d="M60 60 L60 68" stroke="rgba(100,100,140,0.15)" strokeWidth="0.4" />

      {/* Front legs - golden, chunky puppy legs */}
      <rect x="36" y="75" width="9.5" height="17" rx="4.8" fill="#dcb058" />
      <rect x="54" y="75" width="9.5" height="17" rx="4.8" fill="#dcb058" />
      {/* Front paws - big, cream, chunky (puppy feature) */}
      <ellipse cx="40.8" cy="92" rx="6.5" ry="4.2" fill="#f5ecd8" />
      <ellipse cx="58.8" cy="92" rx="6.5" ry="4.2" fill="#f5ecd8" />
      {/* Paw toe lines */}
      <path d="M38 92 Q38.5 90 39 92" stroke="rgba(180,140,80,0.3)" strokeWidth="0.5" fill="none" />
      <path d="M40.5 92 Q41 90 41.5 92" stroke="rgba(180,140,80,0.3)" strokeWidth="0.5" fill="none" />
      <path d="M43 92 Q43.5 90 44 92" stroke="rgba(180,140,80,0.3)" strokeWidth="0.5" fill="none" />
      <path d="M56 92 Q56.5 90 57 92" stroke="rgba(180,140,80,0.3)" strokeWidth="0.5" fill="none" />
      <path d="M58.5 92 Q59 90 59.5 92" stroke="rgba(180,140,80,0.3)" strokeWidth="0.5" fill="none" />
      <path d="M61 92 Q61.5 90 62 92" stroke="rgba(180,140,80,0.3)" strokeWidth="0.5" fill="none" />

      {/* Collar - dark tech collar with red square elements (from reference) */}
      <path d="M33 48 Q50 52 67 48" stroke="#1a1a2e" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M33 48 Q50 52 67 48" stroke="#2e2e44" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      {/* Red rectangular LEDs on collar sides */}
      <rect x="36" y="47" width="4" height="2.5" rx="0.8" fill="#cc1a3a" opacity="0.8" />
      <rect x="60" y="47" width="4" height="2.5" rx="0.8" fill="#cc1a3a" opacity="0.8" />
      {/* S Medallion - prominent, centered */}
      <circle cx="50" cy="53" r="5" fill="#cc1a3a" stroke="#8a0020" strokeWidth="0.8" />
      <circle cx="50" cy="53" r="4" fill="#e0203e" />
      <text x="50" y="56" textAnchor="middle" fontSize="6" fontWeight="bold" fill="white" fontFamily="sans-serif">S</text>
      <ellipse cx="48" cy="51.5" rx="1.8" ry="1" fill="rgba(255,255,255,0.2)" />

      {/* Head - big, round (puppy proportions from reference) */}
      <ellipse cx="50" cy="30" rx="22" ry="21" fill="#dcb058" />
      {/* Head top slightly darker */}
      <ellipse cx="50" cy="22" rx="14" ry="8" fill="rgba(180,120,40,0.1)" />
      {/* Cheek lighter areas */}
      <ellipse cx="34" cy="34" rx="5" ry="6" fill="rgba(240,215,160,0.2)" />
      <ellipse cx="66" cy="34" rx="5" ry="6" fill="rgba(240,215,160,0.2)" />

      {/* Ears - floppy, brown/caramel (slightly darker than body, from reference) */}
      <g className={earClass}>
        {/* Left ear - layered for depth */}
        <ellipse cx="28" cy="28" rx="9.5" ry="14.5" fill="#a86820" transform="rotate(-12 28 28)" />
        <ellipse cx="29" cy="30" rx="6" ry="11" fill="#c08030" transform="rotate(-12 29 30)" />
        <ellipse cx="29.5" cy="31" rx="3.5" ry="7" fill="rgba(200,150,80,0.3)" transform="rotate(-12 29.5 31)" />
        {/* Right ear */}
        <ellipse cx="72" cy="28" rx="9.5" ry="14.5" fill="#a86820" transform="rotate(12 72 28)" />
        <ellipse cx="71" cy="30" rx="6" ry="11" fill="#c08030" transform="rotate(12 71 30)" />
        <ellipse cx="70.5" cy="31" rx="3.5" ry="7" fill="rgba(200,150,80,0.3)" transform="rotate(12 70.5 31)" />
      </g>

      {/* Muzzle area - cream/beige, wide (from reference) */}
      <ellipse cx="50" cy="38" rx="12" ry="10.5" fill="#e8c870" />
      <ellipse cx="50" cy="40" rx="9" ry="8" fill="#f2dda0" />
      {/* Muzzle highlight */}
      <ellipse cx="47" cy="37" rx="4.5" ry="3" fill="rgba(255,248,220,0.12)" />

      {/* Nose freckle dots (visible in reference) */}
      <circle cx="43" cy="36" r="0.6" fill="#9a6830" opacity="0.4" />
      <circle cx="45" cy="35.5" r="0.5" fill="#9a6830" opacity="0.35" />
      <circle cx="55" cy="35.5" r="0.5" fill="#9a6830" opacity="0.35" />
      <circle cx="57" cy="36" r="0.6" fill="#9a6830" opacity="0.4" />

      {/* Eyes - LARGE, warm brown, highly expressive (the most important feature) */}
      <g className={state === 'idle' || state === 'suggesting' ? 'fly-blink' : ''} style={{ transformOrigin: '50px 28px' }}>
        {/* Slight eye socket shadow for depth */}
        <ellipse cx="39" cy="28" rx="7.5" ry="8" fill="rgba(140,90,30,0.06)" />
        <ellipse cx="61" cy="28" rx="7.5" ry="8" fill="rgba(140,90,30,0.06)" />
        {/* Left eye white */}
        <ellipse cx="39" cy="28" rx="7" ry="7.5" fill="white" />
        <ellipse cx="39" cy="28" rx="7" ry="7.5" stroke="rgba(120,80,40,0.08)" strokeWidth="0.3" fill="none" />
        {/* Right eye white */}
        <ellipse cx="61" cy="28" rx="7" ry="7.5" fill="white" />
        <ellipse cx="61" cy="28" rx="7" ry="7.5" stroke="rgba(120,80,40,0.08)" strokeWidth="0.3" fill="none" />

        {/* Iris and pupil with subtle look animation */}
        <g className={state === 'listening' ? 'fly-eyes-attentive' : state === 'processing' ? '' : 'fly-eye-look'}>
          {/* Left iris - rich warm brown */}
          <circle cx="40" cy="28.5" r="4.8" fill="#5a3010" />
          <circle cx="40" cy="28.5" r="3.8" fill="#7a4418" />
          <circle cx="40" cy="29" r="2.2" fill="#1e0c04" />
          {/* Left eye catch lights */}
          <circle cx="42.5" cy="26" r="2" fill="white" opacity="0.92" />
          <circle cx="38" cy="30.5" r="1" fill="white" opacity="0.4" />

          {/* Right iris */}
          <circle cx="60" cy="28.5" r="4.8" fill="#5a3010" />
          <circle cx="60" cy="28.5" r="3.8" fill="#7a4418" />
          <circle cx="60" cy="29" r="2.2" fill="#1e0c04" />
          {/* Right eye catch lights */}
          <circle cx="62.5" cy="26" r="2" fill="white" opacity="0.92" />
          <circle cx="58" cy="30.5" r="1" fill="white" opacity="0.4" />
        </g>

        {/* Processing state - squinted/focused */}
        {state === 'processing' && (
          <>
            <rect x="32" y="27" width="14" height="5" rx="2.5" fill="#dcb058" opacity="0.55" />
            <rect x="54" y="27" width="14" height="5" rx="2.5" fill="#dcb058" opacity="0.55" />
          </>
        )}
      </g>

      {/* Eyebrows - subtle, state-expressive */}
      {state === 'error' ? (
        <>
          <path d="M32 19 Q37 17 43 20" stroke="#9a6830" strokeWidth="1.8" fill="none" strokeLinecap="round" />
          <path d="M57 20 Q63 17 68 19" stroke="#9a6830" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        </>
      ) : state === 'processing' ? (
        <>
          <path d="M33 21 Q38 19 43 22" stroke="#9a6830" strokeWidth="1.4" fill="none" strokeLinecap="round" />
          <path d="M57 21 Q62 19 67 22" stroke="#9a6830" strokeWidth="1.4" fill="none" strokeLinecap="round" />
        </>
      ) : state === 'listening' ? (
        <>
          <path d="M33 20 Q38 17 43 20" stroke="#9a6830" strokeWidth="1.5" fill="none" strokeLinecap="round" />
          <path d="M57 20 Q62 17 67 20" stroke="#9a6830" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        </>
      ) : state === 'success' ? (
        <>
          <path d="M34 22 Q38 20 43 22" stroke="#9a6830" strokeWidth="1.3" fill="none" strokeLinecap="round" />
          <path d="M57 22 Q62 20 66 22" stroke="#9a6830" strokeWidth="1.3" fill="none" strokeLinecap="round" />
        </>
      ) : (
        <>
          <path d="M34 22 Q38 20 43 22.5" stroke="#9a6830" strokeWidth="1.3" fill="none" strokeLinecap="round" />
          <path d="M57 22.5 Q62 20 66 22" stroke="#9a6830" strokeWidth="1.3" fill="none" strokeLinecap="round" />
        </>
      )}

      {/* Nose - large, round, shiny black (prominent in reference) */}
      <ellipse cx="50" cy="39" rx="5.5" ry="4" fill="#1a0e08" />
      <ellipse cx="48" cy="37.5" rx="2.5" ry="1.3" fill="rgba(255,255,255,0.18)" />
      {/* Nostrils */}
      <ellipse cx="47.5" cy="39.5" rx="1.5" ry="1.1" fill="#080404" />
      <ellipse cx="52.5" cy="39.5" rx="1.5" ry="1.1" fill="#080404" />

      {/* Mouth - state dependent expressions */}
      {state === 'success' ? (
        <>
          <path d="M50 43 L50 44.5" stroke="#1a0e08" strokeWidth="1.2" strokeLinecap="round" />
          <path d="M38 47 Q50 56 62 47" stroke="#1a0e08" strokeWidth="1.6" fill="none" strokeLinecap="round" />
          {/* Big happy tongue */}
          <ellipse cx="50" cy="51.5" rx="5.5" ry="4.5" fill="#e04060" />
          <ellipse cx="50" cy="50.5" rx="3.8" ry="2.8" fill="#f06880" />
          <path d="M50 49.5 L50 53.5" stroke="rgba(150,25,45,0.2)" strokeWidth="0.6" />
        </>
      ) : state === 'error' ? (
        <>
          <path d="M50 43 L50 44" stroke="#1a0e08" strokeWidth="1.1" strokeLinecap="round" />
          <path d="M42 48 Q50 45 58 48" stroke="#1a0e08" strokeWidth="1.3" fill="none" strokeLinecap="round" />
        </>
      ) : state === 'processing' ? (
        <>
          <path d="M50 43 L50 44" stroke="#1a0e08" strokeWidth="1" strokeLinecap="round" />
          <path d="M44 46 Q50 47 56 46" stroke="#1a0e08" strokeWidth="1.2" fill="none" strokeLinecap="round" />
        </>
      ) : state === 'listening' ? (
        <>
          <path d="M50 43 L50 44.5" stroke="#1a0e08" strokeWidth="1.1" strokeLinecap="round" />
          <ellipse cx="50" cy="47" rx="3.5" ry="3" fill="#1a0e08" opacity="0.75" />
          <ellipse cx="50" cy="47.5" rx="2.5" ry="2" fill="#e04060" />
        </>
      ) : (
        <>
          {/* Default: friendly smile with tongue (like the reference idle pose) */}
          <path d="M50 43 L50 45" stroke="#1a0e08" strokeWidth="1.1" strokeLinecap="round" />
          <path d="M40 47 Q50 53 60 47" stroke="#1a0e08" strokeWidth="1.4" fill="none" strokeLinecap="round" />
          <ellipse cx="50" cy="50" rx="4.2" ry="3.5" fill="#e04060" />
          <ellipse cx="50" cy="49.2" rx="2.8" ry="2" fill="#f06880" />
          <path d="M50 48.5 L50 51.5" stroke="rgba(150,25,45,0.15)" strokeWidth="0.5" />
        </>
      )}

      {/* Whisker dots (visible in reference on muzzle sides) */}
      <circle cx="33" cy="39" r="0.7" fill="#9a6830" opacity="0.4" />
      <circle cx="31" cy="41.5" r="0.7" fill="#9a6830" opacity="0.35" />
      <circle cx="32" cy="44" r="0.6" fill="#9a6830" opacity="0.3" />
      <circle cx="67" cy="39" r="0.7" fill="#9a6830" opacity="0.4" />
      <circle cx="69" cy="41.5" r="0.7" fill="#9a6830" opacity="0.35" />
      <circle cx="68" cy="44" r="0.6" fill="#9a6830" opacity="0.3" />

      {/* Top of head fur tuft */}
      <path d="M45 10 Q47 6 49 10 Q51 6 53 10 Q55 7 56 10" stroke="#c08030" strokeWidth="1.6" fill="none" strokeLinecap="round" />

      {/* State indicator particles */}
      {state === 'success' && (
        <g className="fly-sparkle">
          <circle cx="76" cy="16" r="2" fill="#38d27d" opacity="0.8" />
          <circle cx="24" cy="14" r="1.5" fill="#38d27d" opacity="0.6" />
          <circle cx="80" cy="30" r="1.3" fill="#38d27d" opacity="0.7" />
        </g>
      )}
      {state === 'error' && (
        <g className="fly-sparkle">
          <text x="77" y="20" fontSize="9" fill="#ff315f" opacity="0.8" fontWeight="bold">!</text>
        </g>
      )}
      {state === 'processing' && (
        <g className="fly-think-dots">
          <circle cx="76" cy="18" r="2.2" fill="#9ba3aa" opacity="0.5" />
          <circle cx="82" cy="13" r="1.7" fill="#9ba3aa" opacity="0.4" />
          <circle cx="86" cy="8" r="1.2" fill="#9ba3aa" opacity="0.3" />
        </g>
      )}
    </svg>
  )
}

// ─── Typing indicator ─────────────────────────────────────────────────────────

function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-3 py-2">
      {[0, 1, 2].map(i => (
        <div
          key={i}
          className={`fly-typing-dot w-1.5 h-1.5 rounded-full`}
          style={{ background: 'var(--red2)' }}
        />
      ))}
    </div>
  )
}

// ─── Notification toast ───────────────────────────────────────────────────────

function FlyNotifToast({ notif, onDismiss }: { notif: FlyNotif; onDismiss: () => void }) {
  const borderColor = notif.level === 'ok' ? 'var(--green)' : notif.level === 'warn' ? 'var(--yellow)' : 'var(--blue)'
  return (
    <div
      className={notif.dying ? 'fly-notif-out' : 'fly-notif-in'}
      style={{
        background: 'var(--panel)',
        border: `1px solid ${borderColor}30`,
        borderLeft: `3px solid ${borderColor}`,
        borderRadius: '12px',
        padding: '10px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        maxWidth: '280px',
        boxShadow: `0 8px 32px rgba(0,0,0,0.5), 0 0 20px ${borderColor}15`,
        cursor: 'pointer',
      }}
      onClick={onDismiss}
    >
      <div className="w-7 h-7 flex-shrink-0">
        <FlyMascot size={28} state="suggesting" />
      </div>
      <span style={{ color: 'var(--text)', fontSize: '12px', lineHeight: '1.4', flex: 1 }}>{notif.text}</span>
      <X style={{ color: 'var(--muted)', width: 12, height: 12, flexShrink: 0 }} />
    </div>
  )
}

// ─── Main FlyAssistant component ──────────────────────────────────────────────

export default function FlyAssistant() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<FlyMessage[]>(() => {
    const h = loadHistory()
    if (h.length > 0) return h
    return [{
      id: 'welcome',
      from: 'fly',
      text: `Woof! Sono Fly, il tuo fedele co-pilota di Simmetria Hub. *scodinzola*\n\nHo il naso in tutti i dati dell'app — task, eventi, budget, fornitori. Dimmi cosa devo fiutare!`,
      time: new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
      chips: ['Situazione generale', 'Task urgenti', 'Budget oggi'],
    }]
  })
  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(false)
  const [unread, setUnread] = useState(0)
  const [notif, setNotif] = useState<FlyNotif | null>(null)
  const [notifShown, setNotifShown] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, typing])

  // Persist history
  useEffect(() => {
    saveHistory(messages)
  }, [messages])

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setUnread(0)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open])

  // Proactive notification after 8s
  useEffect(() => {
    if (notifShown) return
    const timer = setTimeout(() => {
      const n = getProactiveNotif()
      if (n) {
        setNotif(n)
        setNotifShown(true)
        if (!open) setUnread(u => u + 1)
        // auto dismiss after 6s
        setTimeout(() => {
          setNotif(prev => prev ? { ...prev, dying: true } : null)
          setTimeout(() => setNotif(null), 300)
        }, 6000)
      }
    }, 8000)
    return () => clearTimeout(timer)
  }, [notifShown, open])

  const addMessage = useCallback((msg: Omit<FlyMessage, 'id' | 'time'>) => {
    setMessages(prev => [...prev, {
      ...msg,
      id: `msg_${Date.now()}_${Math.random()}`,
      time: new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
    }])
  }, [])

  const sendMessage = useCallback((text: string) => {
    if (!text.trim()) return
    addMessage({ from: 'user', text: text.trim() })
    setInput('')
    setTyping(true)

    const delay = 800 + Math.random() * 700
    setTimeout(() => {
      setTyping(false)
      const response = flyRespond(text)
      addMessage({ from: 'fly', text: response.text, chips: response.chips })
    }, delay)
  }, [addMessage])

  const handleChip = (chip: string) => sendMessage(chip)

  const clearHistory = () => {
    const welcome: FlyMessage = {
      id: 'welcome_reset',
      from: 'fly',
      text: `*scuote le orecchie* Memoria azzerata! Ripartiamo con il fiuto fresco. Cosa sniffo per te?`,
      time: new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
      chips: ['Situazione generale', 'Task urgenti', 'Budget oggi'],
    }
    setMessages([welcome])
    localStorage.removeItem(HISTORY_KEY)
  }

  const ctx = useMemo(() => analyzeContext(), [messages])
  const alertCount = ctx.taskBlocked.length + ctx.taskScaduti.length + ctx.pagamentiScaduti.length + ctx.contrattiScadenza.length
  const flyState: FlyState = typing ? 'processing' : alertCount > 3 ? 'listening' : 'idle'

  return (
    <>
      {/* Notification toast */}
      {notif && !open && (
        <div style={{ position: 'fixed', bottom: '100px', right: '24px', zIndex: 1000 }}>
          <FlyNotifToast notif={notif} onDismiss={() => {
            setNotif(prev => prev ? { ...prev, dying: true } : null)
            setTimeout(() => setNotif(null), 300)
          }} />
        </div>
      )}

      {/* Chat panel */}
      {open && (
        <div
          className="fly-panel-in"
          style={{
            position: 'fixed',
            bottom: '96px',
            right: '24px',
            zIndex: 999,
            width: '360px',
            maxHeight: '520px',
            display: 'flex',
            flexDirection: 'column',
            borderRadius: '20px',
            overflow: 'hidden',
            background: 'var(--panel)',
            border: '1px solid rgba(208,0,58,0.25)',
            boxShadow: '0 24px 80px rgba(0,0,0,0.7), 0 0 40px rgba(208,0,58,0.1)',
          }}
        >
          {/* Panel header */}
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(208,0,58,0.15) 0%, rgba(255,49,95,0.08) 100%)',
              borderBottom: '1px solid rgba(208,0,58,0.2)',
              padding: '14px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              flexShrink: 0,
            }}
          >
            <div className="fly-float" style={{ flexShrink: 0 }}>
              <FlyMascot size={40} state={flyState} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text)' }}>Fly</span>
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 600,
                    padding: '1px 6px',
                    borderRadius: '4px',
                    background: 'rgba(208,0,58,0.2)',
                    color: 'var(--red2)',
                    letterSpacing: '0.05em',
                  }}
                >AI</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '2px' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)' }} />
                <span style={{ fontSize: '11px', color: 'var(--muted)' }}>Il tuo segugio digitale · online</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                onClick={clearHistory}
                style={{ padding: '6px', borderRadius: '8px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}
                title="Cancella cronologia"
              >
                <Trash2 style={{ width: 14, height: 14 }} />
              </button>
              <button
                onClick={() => setOpen(false)}
                style={{ padding: '6px', borderRadius: '8px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}
              >
                <ChevronDown style={{ width: 16, height: 16 }} />
              </button>
            </div>
          </div>

          {/* Context bar */}
          {alertCount > 0 && (
            <div
              style={{
                padding: '8px 16px',
                background: 'rgba(255,194,75,0.06)',
                borderBottom: '1px solid rgba(255,194,75,0.15)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Zap style={{ width: 12, height: 12, color: 'var(--yellow)', flexShrink: 0 }} />
              <span style={{ fontSize: '11px', color: 'var(--yellow)' }}>
                {alertCount} elemento{alertCount !== 1 ? 'i' : ''} che richiede{alertCount === 1 ? '' : 'ono'} attenzione
              </span>
              <button
                onClick={() => sendMessage('Situazione generale')}
                style={{ marginLeft: 'auto', fontSize: '10px', color: 'var(--yellow)', background: 'rgba(255,194,75,0.1)', border: '1px solid rgba(255,194,75,0.2)', borderRadius: '6px', padding: '2px 8px', cursor: 'pointer' }}
              >
                Mostra
              </button>
            </div>
          )}

          {/* Messages */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              minHeight: 0,
            }}
          >
            {messages.map((msg, i) => (
              <div
                key={msg.id}
                className="fly-msg-in"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: msg.from === 'user' ? 'flex-end' : 'flex-start',
                  gap: '6px',
                }}
              >
                {msg.from === 'fly' && (
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
                    <div style={{ width: 26, height: 26, flexShrink: 0, marginBottom: '2px' }}>
                      <FlyMascot size={26} state="suggesting" />
                    </div>
                    <div
                      style={{
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(208,0,58,0.15)',
                        borderRadius: '4px 16px 16px 16px',
                        padding: '10px 13px',
                        maxWidth: '270px',
                        fontSize: '13px',
                        lineHeight: '1.55',
                        color: 'var(--text)',
                        whiteSpace: 'pre-line',
                      }}
                    >
                      {msg.text}
                    </div>
                  </div>
                )}
                {msg.from === 'user' && (
                  <div
                    style={{
                      background: 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)',
                      borderRadius: '16px 4px 16px 16px',
                      padding: '10px 13px',
                      maxWidth: '250px',
                      fontSize: '13px',
                      lineHeight: '1.5',
                      color: 'white',
                    }}
                  >
                    {msg.text}
                  </div>
                )}
                <span style={{ fontSize: '10px', color: 'var(--muted)', paddingLeft: msg.from === 'fly' ? '34px' : 0 }}>
                  {msg.time}
                </span>
                {msg.from === 'fly' && msg.chips && msg.chips.length > 0 && i === messages.length - 1 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', paddingLeft: '34px', marginTop: '2px' }}>
                    {msg.chips.map(chip => (
                      <button
                        key={chip}
                        onClick={() => handleChip(chip)}
                        style={{
                          fontSize: '11px',
                          padding: '4px 10px',
                          borderRadius: '20px',
                          border: '1px solid rgba(208,0,58,0.3)',
                          background: 'rgba(208,0,58,0.08)',
                          color: 'var(--red2)',
                          cursor: 'pointer',
                          transition: 'all 150ms',
                          whiteSpace: 'nowrap',
                        }}
                        onMouseEnter={e => {
                          (e.target as HTMLElement).style.background = 'rgba(208,0,58,0.18)'
                        }}
                        onMouseLeave={e => {
                          (e.target as HTMLElement).style.background = 'rgba(208,0,58,0.08)'
                        }}
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {typing && (
              <div className="fly-msg-in" style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
                <div style={{ width: 26, height: 26, flexShrink: 0 }}>
                  <FlyMascot size={26} state="processing" />
                </div>
                <div
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(208,0,58,0.15)',
                    borderRadius: '4px 16px 16px 16px',
                  }}
                >
                  <TypingDots />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div
            style={{
              padding: '12px 14px',
              borderTop: '1px solid var(--line)',
              flexShrink: 0,
              background: 'var(--panel)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: 'var(--bg)',
                border: '1px solid var(--line)',
                borderRadius: '14px',
                padding: '6px 6px 6px 14px',
                transition: 'border-color 200ms',
              }}
            >
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input) } }}
                placeholder="Chiedi a Fly..."
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: 'var(--text)',
                  fontSize: '13px',
                }}
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim()}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '10px',
                  background: input.trim()
                    ? 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)'
                    : 'var(--panel2)',
                  border: 'none',
                  cursor: input.trim() ? 'pointer' : 'default',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  transition: 'all 200ms',
                }}
              >
                <Send style={{ width: 14, height: 14, color: input.trim() ? 'white' : 'var(--muted)' }} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="fly-glow-pulse"
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 1000,
          width: '64px',
          height: '64px',
          borderRadius: '50%',
          border: '2px solid rgba(208,0,58,0.4)',
          background: 'linear-gradient(145deg, #1a0a14, #0e0820)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'visible',
          transition: 'transform 200ms cubic-bezier(0.34,1.56,0.64,1)',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.1)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)' }}
        title="Fly — Il tuo segugio digitale"
      >
        <div className={open ? '' : 'fly-float'} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {open ? (
            <X style={{ width: 22, height: 22, color: 'var(--red2)' }} />
          ) : (
            <FlyMascot size={46} state={flyState} />
          )}
        </div>

        {/* Unread badge */}
        {unread > 0 && !open && (
          <div
            className="fly-badge-pop"
            style={{
              position: 'absolute',
              top: '-4px',
              right: '-4px',
              width: '20px',
              height: '20px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '10px',
              fontWeight: 700,
              color: 'white',
              border: '2px solid var(--bg)',
              boxShadow: '0 0 12px rgba(208,0,58,0.6)',
            }}
          >
            {unread}
          </div>
        )}

        {/* Alert dot when no unread */}
        {alertCount > 0 && unread === 0 && !open && (
          <div
            style={{
              position: 'absolute',
              top: '0px',
              right: '0px',
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              background: 'var(--yellow)',
              border: '2px solid var(--bg)',
              boxShadow: '0 0 8px rgba(255,194,75,0.6)',
            }}
          />
        )}
      </button>
    </>
  )
}
