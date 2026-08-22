import { useMemo } from 'react'
import { getAllowedNavForRole } from '@/lib/auth'
import { loadUser } from '@/lib/auth'
import { restartTour } from '@/components/Onboarding'
import { RotateCcw, LayoutDashboard, CalendarDays, Users, MessageSquare, ClipboardList, Briefcase, DollarSign, FolderOpen, Presentation, Shield, BarChart3, Settings, MessageCircle, Palette } from 'lucide-react'

const SECTION_INFO: Record<string, { icon: React.ElementType; title: string; description: string }> = {
  '/dashboard': { icon: LayoutDashboard, title: 'Dashboard', description: 'Panoramica rapida: eventi imminenti, task in scadenza, statistiche del team.' },
  '/eventi': { icon: Briefcase, title: 'Eventi', description: 'Crea e gestisci eventi, assegna ruoli, monitora lo stato di avanzamento.' },
  '/network': { icon: Users, title: 'Network', description: 'Rubrica clienti e fornitori. Gestisci contatti, contratti e relazioni.' },
  '/task': { icon: ClipboardList, title: 'Task', description: 'Le tue attivita e quelle del team: scadenze, priorita, sotto-task.' },
  '/calendario': { icon: CalendarDays, title: 'Calendario', description: 'Vista unificata di eventi, task, ferie e scadenze.' },
  '/comunicazioni': { icon: MessageSquare, title: 'Comunicazioni', description: 'Chat di team, canali per evento, messaggi diretti in tempo reale.' },
  '/amministrazione': { icon: DollarSign, title: 'Amministrazione', description: 'Fatture, preventivi, pagamenti e gestione finanziaria.' },
  '/dossier': { icon: FolderOpen, title: 'Dossier', description: 'Documenti condivisi, template e archivio file per evento.' },
  '/presentazioni': { icon: Presentation, title: 'Presentazioni', description: 'Crea proposte commerciali da inviare ai clienti.' },
  '/creative-studio': { icon: Palette, title: 'Creative Studio', description: 'Strumenti creativi per visual, mood-board e concept.' },
  '/performance': { icon: BarChart3, title: 'Performance', description: 'Analisi KPI, report team e metriche di produttivita.' },
  '/utenti': { icon: Users, title: 'Utenti', description: 'Gestione account, ruoli e permessi del team.' },
  '/centro-sicurezza': { icon: Shield, title: 'Centro Sicurezza', description: 'Audit log, accessi, segnalazioni e policy di sicurezza.' },
  '/impostazioni': { icon: Settings, title: 'Impostazioni', description: 'Preferenze personali, notifiche e configurazione account.' },
  '/feedback-beta': { icon: MessageCircle, title: 'Feedback', description: 'Suggerisci miglioramenti, vota le proposte del team.' },
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
            Aiuto
          </h1>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--muted)' }}>
            Guida rapida alle sezioni disponibili per il tuo ruolo.
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
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
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
                {section.description}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
