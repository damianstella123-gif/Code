import { useState, useMemo } from 'react'
import {
  CheckCircle,
  Clock,
  AlertTriangle,
  XCircle,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Play,
  Lock,
  ArrowLeft,
  User,
  Calendar,
  GitBranch,
  Zap,
  Activity,
  FileText,
  Truck,
  MessageSquare,
  Plus,
  TrendingUp,
  Flag,
} from 'lucide-react'
import { workflowsDemo } from '@/data/workflow'
import type { EventoWorkflow, WorkflowFase, FaseStato, LogTipo } from '@/data/workflow'
import { events } from '@/data/events'
import { tasks } from '@/data/tasks'
import { users } from '@/data/users'
import { suppliers } from '@/data/suppliers'
import { loadUser } from '@/lib/auth'

// ─── localStorage ─────────────────────────────────────────────────────────────

const SK = 'simmetria_workflows'

function loadWFs(): EventoWorkflow[] {
  try {
    const r = localStorage.getItem(SK)
    return r ? JSON.parse(r) : workflowsDemo
  } catch { return workflowsDemo }
}
function saveWFs(wfs: EventoWorkflow[]) {
  localStorage.setItem(SK, JSON.stringify(wfs))
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })
}
function formatDateTime(d: string) {
  return new Date(d).toLocaleString('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}
function daysLeft(d: string) {
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000)
}

function statoColor(s: FaseStato): string {
  switch (s) {
    case 'completata': return 'var(--green)'
    case 'in_corso': return 'var(--blue)'
    case 'critica': return 'var(--red2)'
    case 'bloccata': return 'var(--red2)'
    case 'in_attesa': return 'var(--muted)'
  }
}
function statoLabel(s: FaseStato): string {
  switch (s) {
    case 'completata': return 'Completata'
    case 'in_corso': return 'In Corso'
    case 'critica': return 'Critica'
    case 'bloccata': return 'Bloccata'
    case 'in_attesa': return 'In Attesa'
  }
}
function statoIcon(s: FaseStato) {
  switch (s) {
    case 'completata': return CheckCircle
    case 'in_corso': return Play
    case 'critica': return AlertTriangle
    case 'bloccata': return Lock
    case 'in_attesa': return Clock
  }
}

function logColor(tipo: LogTipo): string {
  switch (tipo) {
    case 'avanzamento': return 'var(--green)'
    case 'alert': return 'var(--yellow)'
    case 'blocco': return 'var(--red2)'
    case 'commento': return 'var(--blue)'
    case 'sistema': return 'var(--muted)'
  }
}
function logIcon(tipo: LogTipo) {
  switch (tipo) {
    case 'avanzamento': return TrendingUp
    case 'alert': return AlertTriangle
    case 'blocco': return Lock
    case 'commento': return MessageSquare
    case 'sistema': return Activity
  }
}

function userName(id: string) {
  return users.find(u => u.id === id)?.nome ?? id
}
function userAvatar(id: string) {
  return users.find(u => u.id === id)?.avatar
}
function wfAvanzamentoGlobale(wf: EventoWorkflow): number {
  const tot = wf.fasi.reduce((s, f) => s + f.avanzamento, 0)
  return Math.round(tot / wf.fasi.length)
}

function eventStatoColor(s: string): string {
  switch (s) {
    case 'in_corso': return 'var(--red2)'
    case 'pianificazione': return 'var(--blue)'
    case 'completato': return 'var(--green)'
    default: return 'var(--muted)'
  }
}

// ─── Progress ring ────────────────────────────────────────────────────────────

function ProgressRing({ pct, size = 64, stroke = 5, color }: { pct: number; size?: number; stroke?: number; color: string }) {
  const r = (size - stroke * 2) / 2
  const circ = 2 * Math.PI * r
  const offset = circ - (pct / 100) * circ
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--panel2)" strokeWidth={stroke} fill="none" />
      <circle
        cx={size / 2} cy={size / 2} r={r}
        stroke={color} strokeWidth={stroke} fill="none"
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.6s ease' }}
      />
    </svg>
  )
}

// ─── Comment modal ────────────────────────────────────────────────────────────

function AddLogModal({ onClose, onAdd }: { onClose: () => void; onAdd: (text: string, tipo: LogTipo) => void }) {
  const [text, setText] = useState('')
  const [tipo, setTipo] = useState<LogTipo>('commento')
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl overflow-hidden animate-fade-in"
        style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5" style={{ borderBottom: '1px solid var(--line)' }}>
          <h3 className="font-bold text-base" style={{ color: 'var(--text)' }}>Aggiungi nota al log</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10"><XCircle className="w-4 h-4" style={{ color: 'var(--muted)' }} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs uppercase tracking-wide mb-2 block" style={{ color: 'var(--muted)' }}>Tipo</label>
            <div className="flex gap-2 flex-wrap">
              {(['commento', 'avanzamento', 'alert', 'blocco'] as LogTipo[]).map(t => (
                <button key={t} onClick={() => setTipo(t)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all"
                  style={{
                    background: tipo === t ? `${logColor(t)}18` : 'var(--panel2)',
                    color: tipo === t ? logColor(t) : 'var(--muted)',
                    border: `1px solid ${tipo === t ? logColor(t) + '40' : 'var(--line)'}`,
                  }}
                >{t}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide mb-2 block" style={{ color: 'var(--muted)' }}>Testo</label>
            <textarea rows={3} value={text} onChange={e => setText(e.target.value)}
              placeholder="Descrivi l'attività..."
              className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none resize-none"
              style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}
            />
          </div>
          <div className="flex gap-3">
            <button onClick={onClose}
              className="flex-1 py-3 rounded-xl text-sm font-medium"
              style={{ background: 'var(--panel2)', color: 'var(--muted)', border: '1px solid var(--line)' }}
            >Annulla</button>
            <button onClick={() => { if (text.trim()) { onAdd(text.trim(), tipo); onClose() } }}
              className="flex-1 py-3 rounded-xl text-sm font-medium"
              style={{ background: 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)', color: 'white' }}
            >Aggiungi</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Fase detail card ─────────────────────────────────────────────────────────

interface FaseCardProps {
  fase: WorkflowFase
  isCurrent: boolean
  isNext: boolean
  canAdvance: boolean
  blockingTasks: string[]
  onAdvance: () => void
  onAddLog: (text: string, tipo: LogTipo) => void
  expanded: boolean
  onToggle: () => void
}

function FaseCard({ fase, isCurrent, isNext, canAdvance, blockingTasks, onAdvance, onAddLog, expanded, onToggle }: FaseCardProps) {
  const [showLogModal, setShowLogModal] = useState(false)
  const Icon = statoIcon(fase.stato)
  const color = statoColor(fase.stato)
  const dl = daysLeft(fase.deadline)
  const phaseTasks = tasks.filter(t => fase.taskIds.includes(t.id))
  const phaseSuppliers = suppliers.filter(s => fase.fornitoriIds.includes(s.id))
  const responsible = users.find(u => u.id === fase.responsabileId)

  return (
    <>
      <div
        className="panel overflow-hidden transition-all"
        style={{
          borderLeft: `3px solid ${color}`,
          opacity: fase.stato === 'in_attesa' && !isNext ? 0.55 : 1,
        }}
      >
        {/* Header */}
        <button
          onClick={onToggle}
          className="w-full flex items-center gap-4 p-4 text-left hover:bg-white/2 transition-all"
        >
          {/* Step number / icon */}
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: `${color}15`, border: `1px solid ${color}30` }}
          >
            {fase.stato === 'completata' ? (
              <CheckCircle className="w-5 h-5" style={{ color }} />
            ) : (
              <span className="font-bold text-sm" style={{ color }}>{fase.ordine}</span>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm" style={{ color: 'var(--text)' }}>{fase.nome}</span>
              {isCurrent && (
                <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: 'rgba(77,180,255,0.15)', color: 'var(--blue)' }}>
                  FASE ATTIVA
                </span>
              )}
              <span className="text-xs px-2 py-0.5 rounded" style={{ background: `${color}12`, color }}>
                <Icon className="w-3 h-3 inline mr-1 -mt-0.5" />{statoLabel(fase.stato)}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-xs" style={{ color: 'var(--muted)' }}>
                <Calendar className="w-3 h-3 inline mr-1" />
                {formatDate(fase.deadline)}
                {dl < 0 && fase.stato !== 'completata' && (
                  <span style={{ color: 'var(--red2)' }}> · {Math.abs(dl)}g scaduta</span>
                )}
                {dl >= 0 && dl <= 7 && fase.stato !== 'completata' && (
                  <span style={{ color: 'var(--yellow)' }}> · tra {dl}g</span>
                )}
              </span>
              {responsible && (
                <span className="text-xs flex items-center gap-1" style={{ color: 'var(--muted)' }}>
                  <User className="w-3 h-3" />{responsible.nome.split(' ')[0]}
                </span>
              )}
            </div>
          </div>

          {/* Progress */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="text-right hidden sm:block">
              <p className="text-xl font-bold" style={{ color }}>{fase.avanzamento}%</p>
            </div>
            <div className="relative flex-shrink-0">
              <ProgressRing pct={fase.avanzamento} size={44} stroke={3} color={color} />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xs font-bold" style={{ color }}>{fase.avanzamento}</span>
              </div>
            </div>
            {expanded ? <ChevronUp className="w-4 h-4" style={{ color: 'var(--muted)' }} /> : <ChevronDown className="w-4 h-4" style={{ color: 'var(--muted)' }} />}
          </div>
        </button>

        {/* Expanded content */}
        {expanded && (
          <div className="border-t" style={{ borderColor: 'var(--line)' }}>
            <div className="p-4 space-y-4">
              {/* Description */}
              <p className="text-sm" style={{ color: 'var(--muted)' }}>{fase.descrizione}</p>

              {/* Progress bar */}
              <div>
                <div className="flex justify-between text-xs mb-1.5" style={{ color: 'var(--muted)' }}>
                  <span>Avanzamento fase</span>
                  <span style={{ color }}>{fase.avanzamento}%</span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--panel2)' }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${fase.avanzamento}%`, background: `linear-gradient(90deg, ${color}, ${color}cc)` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Tasks */}
                {phaseTasks.length > 0 && (
                  <div>
                    <p className="text-xs uppercase tracking-wide mb-2 flex items-center gap-1.5" style={{ color: 'var(--muted)' }}>
                      <FileText className="w-3 h-3" /> Task collegati
                    </p>
                    <div className="space-y-1.5">
                      {phaseTasks.map(t => {
                        const isCritico = fase.taskCriticiIds.includes(t.id)
                        const tc = t.stato === 'completato' ? 'var(--green)' : t.stato === 'in_corso' ? 'var(--blue)' : t.priorita === 'alta' ? 'var(--red2)' : 'var(--muted)'
                        return (
                          <div key={t.id} className="flex items-center gap-2 p-2 rounded-lg" style={{ background: 'var(--panel2)' }}>
                            <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: tc }} />
                            <span className="text-xs flex-1 truncate" style={{ color: 'var(--text)' }}>{t.titolo}</span>
                            {isCritico && (
                              <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,49,95,0.1)', color: 'var(--red2)', flexShrink: 0 }}>
                                critico
                              </span>
                            )}
                            <span className="text-xs capitalize flex-shrink-0" style={{ color: tc }}>
                              {t.stato === 'da_fare' ? 'da fare' : t.stato === 'in_corso' ? 'in corso' : '✓'}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Suppliers */}
                {phaseSuppliers.length > 0 && (
                  <div>
                    <p className="text-xs uppercase tracking-wide mb-2 flex items-center gap-1.5" style={{ color: 'var(--muted)' }}>
                      <Truck className="w-3 h-3" /> Fornitori coinvolti
                    </p>
                    <div className="space-y-1.5">
                      {phaseSuppliers.map(s => (
                        <div key={s.id} className="flex items-center gap-2 p-2 rounded-lg" style={{ background: 'var(--panel2)' }}>
                          <div
                            className="w-5 h-5 rounded flex items-center justify-center text-xs font-bold flex-shrink-0"
                            style={{ background: 'rgba(208,0,58,0.15)', color: 'var(--red2)' }}
                          >{s.nome.charAt(0)}</div>
                          <span className="text-xs flex-1 truncate" style={{ color: 'var(--text)' }}>{s.nome}</span>
                          <span className="text-xs" style={{ color: 'var(--muted)' }}>{s.categoria}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Note */}
              {fase.note && (
                <div className="p-3 rounded-xl text-sm" style={{ background: 'var(--panel2)', color: 'var(--text)' }}>
                  <span className="text-xs uppercase tracking-wide mr-2" style={{ color: 'var(--muted)' }}>Note:</span>
                  {fase.note}
                </div>
              )}

              {/* Blocking alert */}
              {blockingTasks.length > 0 && isCurrent && (
                <div className="p-3 rounded-xl flex items-start gap-2" style={{ background: 'rgba(255,49,95,0.07)', border: '1px solid rgba(255,49,95,0.2)' }}>
                  <Lock className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'var(--red2)' }} />
                  <div>
                    <p className="text-xs font-semibold mb-1" style={{ color: 'var(--red2)' }}>
                      Avanzamento bloccato — {blockingTasks.length} task critico{blockingTasks.length !== 1 ? 'i' : ''} incompleto{blockingTasks.length !== 1 ? 'i' : ''}:
                    </p>
                    <p className="text-xs" style={{ color: 'var(--muted)' }}>{blockingTasks.join(', ')}</p>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-3 flex-wrap">
                {isCurrent && fase.stato !== 'completata' && (
                  <button
                    onClick={onAdvance}
                    disabled={!canAdvance}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
                    style={{
                      background: canAdvance ? 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)' : 'var(--panel2)',
                      color: canAdvance ? 'white' : 'var(--muted)',
                      border: `1px solid ${canAdvance ? 'transparent' : 'var(--line)'}`,
                      cursor: canAdvance ? 'pointer' : 'not-allowed',
                      boxShadow: canAdvance ? 'var(--shadow-red)' : 'none',
                    }}
                  >
                    {canAdvance ? <Play className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                    {canAdvance ? 'Avanza fase' : 'Bloccato'}
                  </button>
                )}
                <button
                  onClick={() => setShowLogModal(true)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all"
                  style={{ background: 'var(--panel2)', color: 'var(--muted)', border: '1px solid var(--line)' }}
                >
                  <Plus className="w-4 h-4" /> Log attività
                </button>
              </div>

              {/* Activity log */}
              {fase.log.length > 0 && (
                <div>
                  <p className="text-xs uppercase tracking-wide mb-2 flex items-center gap-1.5" style={{ color: 'var(--muted)' }}>
                    <Activity className="w-3 h-3" /> Log attività
                  </p>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {[...fase.log].reverse().map(entry => {
                      const LogIcon = logIcon(entry.tipo)
                      const lc = logColor(entry.tipo)
                      const av = userAvatar(entry.autoreId)
                      return (
                        <div key={entry.id} className="flex items-start gap-2.5">
                          <div
                            className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                            style={{ background: `${lc}18` }}
                          >
                            <LogIcon className="w-3 h-3" style={{ color: lc }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs" style={{ color: 'var(--text)', lineHeight: 1.5 }}>{entry.testo}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              {av && <img src={av} alt="" className="w-3.5 h-3.5 rounded-full" />}
                              <span className="text-xs" style={{ color: 'var(--muted)' }}>
                                {userName(entry.autoreId)} · {formatDateTime(entry.data)}
                              </span>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {showLogModal && (
        <AddLogModal
          onClose={() => setShowLogModal(false)}
          onAdd={onAddLog}
        />
      )}
    </>
  )
}

// ─── Timeline mini ────────────────────────────────────────────────────────────

function TimelineMini({ wf }: { wf: EventoWorkflow }) {
  return (
    <div className="flex items-center gap-0 w-full">
      {wf.fasi.map((fase, i) => {
        const color = statoColor(fase.stato)
        const isLast = i === wf.fasi.length - 1
        return (
          <div key={fase.id} className="flex items-center flex-1 min-w-0">
            <div
              title={`${fase.nome} — ${statoLabel(fase.stato)}`}
              className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center z-10"
              style={{
                background: fase.stato === 'completata' ? color : fase.stato === 'in_corso' ? `${color}25` : 'var(--panel2)',
                border: `2px solid ${color}`,
              }}
            >
              {fase.stato === 'completata' && <CheckCircle className="w-3 h-3" style={{ color: 'white' }} />}
              {fase.stato === 'in_corso' && <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: color }} />}
            </div>
            {!isLast && (
              <div
                className="flex-1 h-0.5"
                style={{
                  background: i < wf.faseCorrenteOrdine - 1
                    ? 'var(--green)'
                    : 'var(--line)',
                }}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Workflow detail ──────────────────────────────────────────────────────────

function WorkflowDetail({ wf: initWf, onBack }: { wf: EventoWorkflow; onBack: () => void }) {
  const [wf, setWf] = useState<EventoWorkflow>(initWf)
  const [expandedFasi, setExpandedFasi] = useState<Set<string>>(new Set([
    initWf.fasi.find(f => f.ordine === initWf.faseCorrenteOrdine)?.id ?? '',
  ]))

  const currentUser = loadUser()
  const evento = events.find(e => e.id === wf.eventoId)
  const avanzamento = wfAvanzamentoGlobale(wf)

  function persist(updated: EventoWorkflow) {
    setWf(updated)
    const all = loadWFs()
    const next = all.map(w => w.id === updated.id ? updated : w)
    saveWFs(next)
  }

  function toggleExpand(id: string) {
    setExpandedFasi(prev => {
      const s = new Set(prev)
      s.has(id) ? s.delete(id) : s.add(id)
      return s
    })
  }

  function advanceFase(faseId: string) {
    const now = new Date().toISOString()
    const authorId = currentUser?.id ?? 'usr_001'

    const updated: EventoWorkflow = {
      ...wf,
      aggiornatoIl: now.slice(0, 10),
      fasi: wf.fasi.map(f => {
        if (f.id !== faseId) {
          // unlock next
          if (f.ordine === wf.faseCorrenteOrdine + 1) {
            return {
              ...f,
              stato: 'in_corso' as FaseStato,
              log: [...f.log, {
                id: `log_${Date.now()}`,
                tipo: 'sistema' as LogTipo,
                testo: `Fase avviata automaticamente`,
                autoreId: authorId,
                data: now,
              }],
            }
          }
          return f
        }
        return {
          ...f,
          stato: 'completata' as FaseStato,
          avanzamento: 100,
          log: [
            ...f.log,
            {
              id: `log_${Date.now()}_adv`,
              tipo: 'avanzamento' as LogTipo,
              testo: `Fase completata al 100% da ${userName(authorId)}`,
              autoreId: authorId,
              data: now,
            },
          ],
        }
      }),
      faseCorrenteOrdine: wf.faseCorrenteOrdine + 1,
    }
    persist(updated)

    // Expand next phase
    const nextFase = updated.fasi.find(f => f.ordine === updated.faseCorrenteOrdine)
    if (nextFase) setExpandedFasi(prev => new Set([...prev, nextFase.id]))
  }

  function addLog(faseId: string, text: string, tipo: LogTipo) {
    const authorId = currentUser?.id ?? 'usr_001'
    const now = new Date().toISOString()
    const updated: EventoWorkflow = {
      ...wf,
      aggiornatoIl: now.slice(0, 10),
      fasi: wf.fasi.map(f =>
        f.id !== faseId ? f : {
          ...f,
          log: [...f.log, {
            id: `log_${Date.now()}`,
            tipo,
            testo: text,
            autoreId: authorId,
            data: now,
          }],
        }
      ),
    }
    persist(updated)
  }

  function getBlockingTasks(fase: WorkflowFase): string[] {
    return fase.taskCriticiIds
      .map(tid => tasks.find(t => t.id === tid))
      .filter(t => t && t.stato !== 'completato')
      .map(t => t!.titolo)
  }

  const completate = wf.fasi.filter(f => f.stato === 'completata').length
  const faseAttiva = wf.fasi.find(f => f.ordine === wf.faseCorrenteOrdine)

  return (
    <div className="space-y-6 animate-fade-in">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm transition-all hover:opacity-80"
        style={{ color: 'var(--muted)' }}
      >
        <ArrowLeft className="w-4 h-4" /> Tutti i workflow
      </button>

      {/* Hero */}
      <div className="panel p-6 relative overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'linear-gradient(135deg, rgba(208,0,58,0.04) 0%, transparent 60%)' }}
        />
        <div className="relative">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <GitBranch className="w-4 h-4" style={{ color: 'var(--red2)' }} />
                <span className="text-xs uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Workflow evento</span>
              </div>
              <h2 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>{evento?.nome ?? wf.eventoId}</h2>
              <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
                {evento?.location} · {evento && formatDate(evento.dataInizio)}
              </p>
            </div>

            <div className="flex items-center gap-4">
              <div className="relative">
                <ProgressRing pct={avanzamento} size={72} stroke={5} color={avanzamento >= 80 ? 'var(--green)' : avanzamento >= 50 ? 'var(--blue)' : 'var(--yellow)'} />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-lg font-bold" style={{ color: 'var(--text)' }}>{avanzamento}%</span>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{completate} / {wf.fasi.length} fasi</p>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>
                  Fase attiva: <span style={{ color: 'var(--blue)' }}>{faseAttiva?.nome ?? '—'}</span>
                </p>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>
                  Agg. {formatDate(wf.aggiornatoIl)}
                </p>
              </div>
            </div>
          </div>

          {/* Timeline */}
          <div className="mb-2">
            <p className="text-xs uppercase tracking-wide mb-3" style={{ color: 'var(--muted)' }}>Timeline</p>
            <TimelineMini wf={wf} />
            <div className="flex justify-between mt-2">
              <span className="text-xs" style={{ color: 'var(--muted)' }}>{wf.fasi[0].nome}</span>
              <span className="text-xs" style={{ color: 'var(--muted)' }}>{wf.fasi[wf.fasi.length - 1].nome}</span>
            </div>
          </div>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          {
            label: 'Avanzamento', value: `${avanzamento}%`,
            color: avanzamento >= 80 ? 'var(--green)' : avanzamento >= 50 ? 'var(--blue)' : 'var(--yellow)',
          },
          {
            label: 'Fasi completate', value: `${completate}/${wf.fasi.length}`,
            color: 'var(--text)',
          },
          {
            label: 'Task aperti',
            value: String(wf.fasi.flatMap(f => f.taskIds).filter(tid => {
              const t = tasks.find(x => x.id === tid)
              return t && t.stato !== 'completato'
            }).length),
            color: 'var(--yellow)',
          },
          {
            label: 'Budget',
            value: `€${((evento?.budget ?? 0) / 1000).toFixed(0)}K`,
            color: 'var(--text)',
          },
        ].map((kpi, i) => (
          <div key={i} className="panel p-4">
            <p className="text-xs" style={{ color: 'var(--muted)' }}>{kpi.label}</p>
            <p className="text-2xl font-bold mt-1" style={{ color: kpi.color }}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Fasi */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm" style={{ color: 'var(--text)' }}>Fasi del workflow</h3>
          <button
            onClick={() => {
              const allIds = new Set(wf.fasi.map(f => f.id))
              if (expandedFasi.size === allIds.size) setExpandedFasi(new Set())
              else setExpandedFasi(allIds)
            }}
            className="text-xs px-3 py-1.5 rounded-lg transition-all"
            style={{ background: 'var(--panel)', color: 'var(--muted)', border: '1px solid var(--line)' }}
          >
            {expandedFasi.size === wf.fasi.length ? 'Comprimi tutto' : 'Espandi tutto'}
          </button>
        </div>
        <div className="space-y-3">
          {wf.fasi.map(fase => {
            const isCurrent = fase.ordine === wf.faseCorrenteOrdine
            const isNext = fase.ordine === wf.faseCorrenteOrdine + 1
            const blocking = getBlockingTasks(fase)
            const canAdvance = isCurrent && blocking.length === 0 && fase.stato !== 'completata'

            return (
              <FaseCard
                key={fase.id}
                fase={fase}
                isCurrent={isCurrent}
                isNext={isNext}
                canAdvance={canAdvance}
                blockingTasks={blocking}
                onAdvance={() => advanceFase(fase.id)}
                onAddLog={(text, tipo) => addLog(fase.id, text, tipo)}
                expanded={expandedFasi.has(fase.id)}
                onToggle={() => toggleExpand(fase.id)}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Workflow list card ───────────────────────────────────────────────────────

function WorkflowCard({ wf, onClick }: { wf: EventoWorkflow; onClick: () => void }) {
  const evento = events.find(e => e.id === wf.eventoId)
  const avanzamento = wfAvanzamentoGlobale(wf)
  const faseAttiva = wf.fasi.find(f => f.ordine === wf.faseCorrenteOrdine)
  const taskAperti = wf.fasi.flatMap(f => f.taskCriticiIds).filter(tid => {
    const t = tasks.find(x => x.id === tid)
    return t && t.stato !== 'completato'
  }).length
  const hasAlert = taskAperti > 0 || wf.fasi.some(f => f.stato === 'critica' || f.stato === 'bloccata')
  const aColor = avanzamento >= 80 ? 'var(--green)' : avanzamento >= 50 ? 'var(--blue)' : 'var(--yellow)'
  const ec = eventStatoColor(evento?.stato ?? '')

  return (
    <div
      className="panel hover-card cursor-pointer p-5"
      onClick={onClick}
      style={{ borderLeft: `3px solid ${ec}` }}
    >
      <div className="flex items-start gap-4">
        <div className="relative flex-shrink-0">
          <ProgressRing pct={avanzamento} size={56} stroke={4} color={aColor} />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xs font-bold" style={{ color: aColor }}>{avanzamento}</span>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <div>
              <p className="font-semibold" style={{ color: 'var(--text)' }}>{evento?.nome ?? wf.eventoId}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                {evento?.location} · {evento && formatDate(evento.dataInizio)}
              </p>
            </div>
            {hasAlert && (
              <span className="text-xs px-2 py-0.5 rounded flex items-center gap-1 flex-shrink-0" style={{ background: 'rgba(255,194,75,0.12)', color: 'var(--yellow)' }}>
                <AlertTriangle className="w-3 h-3" />
                {taskAperti > 0 ? `${taskAperti} task bloccanti` : 'Attenzione'}
              </span>
            )}
          </div>

          {/* Mini timeline */}
          <div className="my-3">
            <TimelineMini wf={wf} />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs px-2 py-0.5 rounded" style={{ background: `${ec}15`, color: ec }}>
                <Flag className="w-3 h-3 inline mr-1 -mt-0.5" />
                {faseAttiva?.nome ?? 'Completato'}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--muted)' }}>
              <span>{wf.fasi.filter(f => f.stato === 'completata').length}/{wf.fasi.length} fasi</span>
              <ChevronRight className="w-4 h-4" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Workflow() {
  const currentUser = loadUser()
  const [workflows, setWorkflows] = useState<EventoWorkflow[]>(() => loadWFs())
  const [selected, setSelected] = useState<EventoWorkflow | null>(null)

  // Re-sync when returning from detail
  function handleBack() {
    setWorkflows(loadWFs())
    setSelected(null)
  }

  const visibleWfs = useMemo(() => {
    if (!currentUser) return workflows
    const ruolo = currentUser.ruolo
    if (ruolo === 'Admin' || ruolo === 'Finance') return workflows
    if (ruolo === 'Manager' || ruolo === 'Operativo') {
      const myEventIds = events
        .filter(e => e.responsabile === currentUser.id || e.team.includes(currentUser.id))
        .map(e => e.id)
      return workflows.filter(w => myEventIds.includes(w.eventoId))
    }
    return workflows
  }, [workflows, currentUser])

  const totAvanzamento = Math.round(visibleWfs.reduce((s, w) => s + wfAvanzamentoGlobale(w), 0) / (visibleWfs.length || 1))
  const completati = visibleWfs.filter(w => w.fasi.every(f => f.stato === 'completata')).length
  const inCorso = visibleWfs.filter(w => w.fasi.some(f => f.stato === 'in_corso')).length
  const critici = visibleWfs.filter(w =>
    w.fasi.flatMap(f => f.taskCriticiIds).some(tid => {
      const t = tasks.find(x => x.id === tid)
      return t && t.stato !== 'completato'
    })
  ).length

  if (selected) {
    const fresh = loadWFs().find(w => w.id === selected.id) ?? selected
    return <WorkflowDetail wf={fresh} onBack={handleBack} />
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold" style={{ color: 'var(--text)' }}>Workflow</h1>
        <p className="mt-1" style={{ color: 'var(--muted)' }}>Avanzamento operativo eventi</p>
      </div>

      {/* Alerts */}
      {critici > 0 && (
        <div className="flex items-center gap-3 p-3.5 rounded-xl" style={{ background: 'rgba(255,194,75,0.07)', border: '1px solid rgba(255,194,75,0.2)' }}>
          <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--yellow)' }} />
          <p className="text-sm" style={{ color: 'var(--yellow)' }}>
            {critici} workflow ha task critici non completati che bloccano l'avanzamento.
          </p>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Avanzamento medio', value: `${totAvanzamento}%`, color: totAvanzamento >= 70 ? 'var(--green)' : 'var(--yellow)' },
          { label: 'Workflow attivi', value: String(inCorso), color: 'var(--blue)' },
          { label: 'Completati', value: String(completati), color: 'var(--green)' },
          { label: 'Con criticità', value: String(critici), color: critici > 0 ? 'var(--red2)' : 'var(--muted)' },
        ].map((kpi, i) => (
          <div key={i} className="panel p-4">
            <div className="flex items-center gap-2 mb-1">
              <Zap className="w-3.5 h-3.5" style={{ color: kpi.color }} />
              <p className="text-xs" style={{ color: 'var(--muted)' }}>{kpi.label}</p>
            </div>
            <p className="text-2xl font-bold" style={{ color: kpi.color }}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Workflow cards */}
      <div>
        <h2 className="font-semibold text-sm mb-3" style={{ color: 'var(--text)' }}>
          Workflow eventi ({visibleWfs.length})
        </h2>
        <div className="space-y-3">
          {visibleWfs.length === 0 ? (
            <div className="panel p-12 text-center" style={{ color: 'var(--muted)' }}>
              <GitBranch className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p>Nessun workflow disponibile</p>
            </div>
          ) : visibleWfs.map((wf, i) => (
            <div key={wf.id} className="animate-fade-in" style={{ animationDelay: `${i * 50}ms` }}>
              <WorkflowCard wf={wf} onClick={() => setSelected(wf)} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
