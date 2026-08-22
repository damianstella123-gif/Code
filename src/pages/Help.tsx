import { useMemo } from 'react'
import { getAllowedNavForRole } from '@/lib/auth'
import { loadUser } from '@/lib/auth'
import { restartTour } from '@/components/Onboarding'
import { RotateCcw, LayoutDashboard, CalendarDays, Users, MessageSquare, ClipboardList, Briefcase, DollarSign, FolderOpen, Presentation, Shield, BarChart3, Settings, MessageCircle, Palette, Archive, GitBranch, HeartPulse, HelpCircle } from 'lucide-react'

const SECTION_INFO: Record<string, { icon: React.ElementType; title: string; description: string }> = {
  '/dashboard': {
    icon: LayoutDashboard,
    title: 'Dashboard',
    description: 'La tua pagina iniziale. Riassume cosa conta per te oggi: attività in corso, scadenze imminenti, aggiornamenti e notifiche. Si aggiorna da sola in base a quello che ti riguarda.',
  },
  '/eventi': {
    icon: Briefcase,
    title: 'Eventi',
    description: 'Il centro operativo. Ogni evento raccoglie tutto: cliente, brief, budget, servizi, fornitori, programma, documenti, task, parte creativa e operativa. Tutto collegato e aggiornato, invece che sparso tra email e cartelle.',
  },
  '/network': {
    icon: Users,
    title: 'Network',
    description: 'L\u2019anagrafica dei clienti e dei fornitori, in due sezioni separate. Contatti, referenti, settore, stato del rapporto, storico eventi, valutazioni, categorie, zona e note. La memoria commerciale e operativa dell\u2019azienda.',
  },
  '/task': {
    icon: ClipboardList,
    title: 'Task',
    description: 'La gestione delle attività. Vedi cosa devi fare, cosa fanno gli altri, cosa scade. Quando ti viene assegnato un compito ricevi una notifica e lo ritrovi qui.',
  },
  '/calendario': {
    icon: CalendarDays,
    title: 'Calendario',
    description: 'Una vista unica di tutto ciò che ha una data: eventi, scadenze, impegni. Ti aiuta a vedere il quadro della settimana e del mese a colpo d\u2019occhio.',
  },
  '/comunicazioni': {
    icon: MessageSquare,
    title: 'Comunicazioni',
    description: 'Lo spazio per le comunicazioni interne e i messaggi legati al lavoro, in un posto condiviso.',
  },
  '/amministrazione': {
    icon: DollarSign,
    title: 'Amministrazione',
    description: 'La gestione economica e amministrativa: rendicontazione, pagamenti, dati finanziari degli eventi. Riservata ai ruoli autorizzati, con i dati sensibili protetti.',
  },
  '/creative-studio': {
    icon: Palette,
    title: 'Creative Studio',
    description: 'Lo spazio per la parte creativa: proposte e materiali elaborati con l\u2019aiuto dell\u2019intelligenza artificiale. Parti da una bozza invece che dal foglio bianco.',
  },
  '/presentazioni': {
    icon: Presentation,
    title: 'Presentazioni',
    description: 'La gestione delle presentazioni e dei materiali da mostrare ai clienti, tutto ordinato e a portata di mano.',
  },
  '/dossier': {
    icon: FolderOpen,
    title: 'Dossier',
    description: 'Raccolte organizzate di documenti e informazioni, per tenere insieme tutto ciò che riguarda un tema, un cliente o un progetto.',
  },
  '/archivio': {
    icon: Archive,
    title: 'Archivio',
    description: 'Lo storico di ciò che è concluso. Eventi e materiali passati, consultabili quando servono ma fuori dalla vista quotidiana.',
  },
  '/workflow': {
    icon: GitBranch,
    title: 'Workflow',
    description: 'La vista dei processi di lavoro: le fasi attraverso cui passa un evento, dallo start alla chiusura. Sai sempre a che punto sei.',
  },
  '/utenti': {
    icon: Users,
    title: 'Utenti',
    description: 'La gestione delle persone del team in Synergy: chi ha accesso e con quale ruolo. Riservata agli amministratori.',
  },
  '/performance': {
    icon: BarChart3,
    title: 'Performance',
    description: 'Misura il valore che Synergy libera: tempo risparmiato, attività completate, contributo di ognuno. I responsabili vedono l\u2019andamento del team; ogni persona vede i propri dati. I dati sul benessere (Wellness) non sono mai inclusi qui.',
  },
  '/wellness': {
    icon: HeartPulse,
    title: 'Wellness',
    description: 'Lo spazio per il tuo benessere. Promemoria per le pause e spazio per come ti senti. È privato: i tuoi dati individuali sono visibili solo a te. Ai responsabili arriva solo un andamento generale del team.',
  },
  '/centro-sicurezza': {
    icon: Shield,
    title: 'Centro Sicurezza',
    description: 'Il presidio della sicurezza di Synergy: stato delle protezioni, controlli, monitoraggio. Riservato agli amministratori.',
  },
  '/impostazioni': {
    icon: Settings,
    title: 'Impostazioni',
    description: 'Le tue preferenze personali: profilo, sicurezza dell\u2019account, e la gestione del consenso per il Wellness.',
  },
  '/feedback-beta': {
    icon: MessageCircle,
    title: 'Feedback',
    description: 'Lo spazio democratico di Synergy. Segnala bug, proponi migliorie, condividi idee e vota le proposte dei colleghi. Le più sostenute salgono in cima. Puoi anche commentare per discutere. Synergy migliora grazie a voi.',
  },
  '/aiuto': {
    icon: HelpCircle,
    title: 'Help',
    description: 'Questa sezione. La guida a tutte le funzioni di Synergy, sempre disponibile, con la possibilità di rivedere il tour quando vuoi.',
  },
}

export default function Help() {
  const user = loadUser()
  const role = user?.ruolo || 'Project Manager'

  const sections = useMemo(() => {
    const nav = getAllowedNavForRole(role)
    return nav
      .map(item => ({ href: item.href, ...SECTION_INFO[item.href] }))
      .filter(s => s.title)
  }, [role])

  return (
    <div style={{ padding: '32px 16px', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
            Help
          </h1>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--muted)' }}>
            La guida a tutte le funzioni di Synergy, filtrata in base al tuo ruolo.
          </p>
        </div>
        <button
          onClick={restartTour}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600,
            color: '#fff', background: 'var(--red2)', border: 'none',
            borderRadius: 8, padding: '10px 18px', cursor: 'pointer',
            transition: 'opacity 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
          onMouseLeave={e => e.currentTarget.style.opacity = '1'}
        >
          <RotateCcw size={14} />
          Rivedi il tour
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        {sections.map(section => {
          const Icon = section.icon
          return (
            <div
              key={section.href}
              style={{
                background: 'var(--panel-solid, #1a1a1a)',
                border: '1px solid var(--line, #333)',
                borderRadius: 12,
                padding: '20px 20px 16px',
                transition: 'border-color 0.2s, box-shadow 0.2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--red2)'; e.currentTarget.style.boxShadow = '0 0 0 1px var(--red2)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--line, #333)'; e.currentTarget.style.boxShadow = 'none' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <Icon size={18} style={{ color: 'var(--red2)' }} />
                <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                  {section.title}
                </h3>
              </div>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--muted)', lineHeight: 1.7 }}>
                {section.description}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
