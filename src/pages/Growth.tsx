import { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, Target, TrendingUp, Send, ChevronDown, ChevronUp, Users, Share2 } from 'lucide-react'
import {
  fetchMyGrowthAreas, createGrowthArea, createGrowthObjective,
  updateObjectiveStato, deleteGrowthArea,
  fetchMyReports, fetchAreasForPerson, createGrowthAreaForReport,
  shareGrowthArea, createGrowthObjectiveForReport,
  fetchGrowthNotes, addGrowthNote,
  type GrowthArea, type GrowthObjective, type GrowthNote, type ReportProfile,
} from '@/lib/growth-service'

const STATI_LABEL: Record<GrowthObjective['stato'], string> = {
  da_iniziare: 'Da iniziare',
  in_corso: 'In corso',
  raggiunto: 'Raggiunto',
}

const STATI_COLOR: Record<GrowthObjective['stato'], string> = {
  da_iniziare: 'var(--muted)',
  in_corso: 'var(--blue)',
  raggiunto: 'var(--green)',
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'ora'
  if (mins < 60) return `${mins}m fa`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h fa`
  const days = Math.floor(hrs / 24)
  return `${days}g fa`
}

// ─── Notes Thread ──────────────────────────────────────────────────────────

function NotesThread({ areaId }: { areaId: string }) {
  const [notes, setNotes] = useState<GrowthNote[]>([])
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)

  async function loadNotes() {
    if (loaded) return
    const data = await fetchGrowthNotes(areaId)
    setNotes(data)
    setLoaded(true)
  }

  function toggle() {
    const next = !open
    setOpen(next)
    if (next) loadNotes()
  }

  async function handleSend() {
    const t = body.trim()
    if (!t || sending) return
    setSending(true)
    const note = await addGrowthNote(areaId, t)
    if (note) setNotes(prev => [...prev, note])
    setBody('')
    setSending(false)
  }

  return (
    <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--line)' }}>
      <button
        onClick={toggle}
        className="flex items-center gap-1.5 text-xs font-medium"
        style={{ color: 'var(--muted)' }}
      >
        {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        Dialogo {loaded && notes.length > 0 && `(${notes.length})`}
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          {notes.length === 0 && loaded && (
            <p className="text-xs" style={{ color: 'var(--muted)' }}>Nessun messaggio ancora.</p>
          )}
          {notes.length > 0 && (
            <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
              {notes.map(n => (
                <div key={n.id} className="px-2.5 py-1.5 rounded-md text-xs" style={{ background: 'var(--bg)', color: 'var(--text)' }}>
                  <span>{n.body}</span>
                  <span className="ml-2" style={{ color: 'var(--muted)', fontSize: 10 }}>{timeAgo(n.created_at)}</span>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-1.5">
            <input
              type="text"
              value={body}
              onChange={e => setBody(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSend() } }}
              placeholder="Scrivi..."
              className="flex-1 px-2.5 py-1.5 rounded-md text-xs"
              style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}
            />
            <button
              onClick={handleSend}
              disabled={!body.trim() || sending}
              className="px-2 py-1.5 rounded-md transition-opacity"
              style={{ background: 'var(--red2)', color: '#fff', opacity: body.trim() ? 1 : 0.4 }}
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Objectives List (reused in both personal and team sections) ───────────

function ObjectivesList({
  objectives,
  areaId,
  onStatoChange,
}: {
  objectives: GrowthObjective[]
  areaId: string
  onStatoChange: (areaId: string, objId: string, stato: GrowthObjective['stato']) => void
}) {
  if (objectives.length === 0) return null
  return (
    <div className="space-y-2 mb-3">
      {objectives.map(obj => (
        <div
          key={obj.id}
          className="flex items-center gap-3 px-3 py-2 rounded-lg"
          style={{ background: 'var(--bg)', border: '1px solid var(--line)' }}
        >
          <span className="flex-1 text-sm" style={{ color: 'var(--text)' }}>{obj.titolo}</span>
          <select
            value={obj.stato}
            onChange={e => onStatoChange(areaId, obj.id, e.target.value as GrowthObjective['stato'])}
            className="text-xs font-medium px-2 py-1 rounded-md cursor-pointer"
            style={{
              background: 'transparent',
              border: `1px solid ${STATI_COLOR[obj.stato]}`,
              color: STATI_COLOR[obj.stato],
            }}
          >
            {(Object.keys(STATI_LABEL) as GrowthObjective['stato'][]).map(s => (
              <option key={s} value={s}>{STATI_LABEL[s]}</option>
            ))}
          </select>
        </div>
      ))}
    </div>
  )
}

// ─── Team Section ──────────────────────────────────────────────────────────

interface ReportWithAreas extends ReportProfile {
  areas: GrowthArea[]
}

function TeamSection() {
  const [reports, setReports] = useState<ReportWithAreas[]>([])
  const [loading, setLoading] = useState(true)
  const [newAreaByReport, setNewAreaByReport] = useState<Record<string, string>>({})
  const [newObjByArea, setNewObjByArea] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    (async () => {
      const ppl = await fetchMyReports()
      if (ppl.length === 0) { setLoading(false); return }
      const withAreas: ReportWithAreas[] = await Promise.all(
        ppl.map(async p => ({ ...p, areas: await fetchAreasForPerson(p.id) }))
      )
      setReports(withAreas)
      setLoading(false)
    })()
  }, [])

  if (loading || reports.length === 0) return null

  async function handleAddArea(reportId: string) {
    const t = (newAreaByReport[reportId] ?? '').trim()
    if (!t || saving) return
    setSaving(true)
    const area = await createGrowthAreaForReport(reportId, t)
    if (area) {
      setReports(prev => prev.map(r =>
        r.id === reportId ? { ...r, areas: [...r.areas, area] } : r
      ))
    }
    setNewAreaByReport(prev => ({ ...prev, [reportId]: '' }))
    setSaving(false)
  }

  async function handleShare(reportId: string, areaId: string) {
    const ok = await shareGrowthArea(areaId)
    if (ok) {
      setReports(prev => prev.map(r =>
        r.id === reportId
          ? { ...r, areas: r.areas.map(a => a.id === areaId ? { ...a, stato: 'condiviso' as const } : a) }
          : r
      ))
    }
  }

  async function handleAddObjective(reportId: string, areaId: string) {
    const t = (newObjByArea[areaId] ?? '').trim()
    if (!t || saving) return
    setSaving(true)
    const obj = await createGrowthObjectiveForReport(areaId, t)
    if (obj) {
      setReports(prev => prev.map(r =>
        r.id === reportId
          ? { ...r, areas: r.areas.map(a => a.id === areaId ? { ...a, growth_objectives: [...a.growth_objectives, obj] } : a) }
          : r
      ))
    }
    setNewObjByArea(prev => ({ ...prev, [areaId]: '' }))
    setSaving(false)
  }

  function handleStatoChange(areaId: string, objId: string, stato: GrowthObjective['stato']) {
    updateObjectiveStato(objId, stato).then(ok => {
      if (ok) {
        setReports(prev => prev.map(r => ({
          ...r,
          areas: r.areas.map(a =>
            a.id === areaId
              ? { ...a, growth_objectives: a.growth_objectives.map(o => o.id === objId ? { ...o, stato } : o) }
              : a
          ),
        })))
      }
    })
  }

  return (
    <div className="px-4 pb-8">
      <div className="flex items-center gap-2 mb-1 mt-2">
        <Users className="w-5 h-5" style={{ color: 'var(--blue)' }} />
        <h2 className="font-semibold text-base" style={{ color: 'var(--text)' }}>Il mio team</h2>
      </div>
      <p className="text-xs mb-4" style={{ color: 'var(--muted)' }}>
        Qui puoi proporre aree di crescita per chi ti riporta. Restano in bozza, visibili solo a te, finché non le condividi.
      </p>

      <div className="space-y-6">
        {reports.map(report => (
          <div key={report.id}>
            <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text)' }}>
              {report.first_name} {report.last_name}
            </h3>

            <div className="space-y-3">
              {report.areas.map(area => (
                <div
                  key={area.id}
                  className="rounded-[14px] p-4"
                  style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <h4 className="font-medium text-sm flex-1" style={{ color: 'var(--text)' }}>{area.titolo}</h4>
                    {area.stato === 'bozza' && (
                      <>
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: 'var(--line)', color: 'var(--muted)' }}>Bozza</span>
                        <button
                          onClick={() => handleShare(report.id, area.id)}
                          className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md"
                          style={{ background: 'var(--blue)', color: '#fff' }}
                        >
                          <Share2 className="w-3 h-3" /> Condividi
                        </button>
                      </>
                    )}
                  </div>

                  <ObjectivesList
                    objectives={area.growth_objectives}
                    areaId={area.id}
                    onStatoChange={handleStatoChange}
                  />

                  {/* Add objective */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newObjByArea[area.id] ?? ''}
                      onChange={e => setNewObjByArea(prev => ({ ...prev, [area.id]: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddObjective(report.id, area.id) } }}
                      placeholder="Es: Presentare a un cliente senza supervisione entro fine anno"
                      className="flex-1 px-3 py-1.5 rounded-lg text-sm"
                      style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}
                    />
                    <button
                      onClick={() => handleAddObjective(report.id, area.id)}
                      disabled={!(newObjByArea[area.id] ?? '').trim() || saving}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-medium transition-opacity"
                      style={{ background: 'var(--line)', color: 'var(--text)', opacity: (newObjByArea[area.id] ?? '').trim() ? 1 : 0.5 }}
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-[10px] mt-1" style={{ color: 'var(--muted)' }}>Un traguardo concreto e verificabile.</p>

                  {area.stato === 'condiviso' && <NotesThread areaId={area.id} />}
                </div>
              ))}

              {/* Add area for this report */}
              <div className="flex gap-2" style={{ maxWidth: 500 }}>
                <input
                  type="text"
                  value={newAreaByReport[report.id] ?? ''}
                  onChange={e => setNewAreaByReport(prev => ({ ...prev, [report.id]: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddArea(report.id) } }}
                  placeholder="Es: Autonomia nelle trattative, Public speaking, Gestione del tempo..."
                  className="flex-1 px-3 py-1.5 rounded-lg text-sm"
                  style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--text)' }}
                />
                <button
                  onClick={() => handleAddArea(report.id)}
                  disabled={!(newAreaByReport[report.id] ?? '').trim() || saving}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-opacity"
                  style={{ background: 'var(--line)', color: 'var(--text)', opacity: (newAreaByReport[report.id] ?? '').trim() ? 1 : 0.5 }}
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────

export default function Growth() {
  const [areas, setAreas] = useState<GrowthArea[]>([])
  const [loading, setLoading] = useState(true)
  const [newAreaTitle, setNewAreaTitle] = useState('')
  const [newObjByArea, setNewObjByArea] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const data = await fetchMyGrowthAreas()
    setAreas(data)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function handleAddArea(e: React.FormEvent) {
    e.preventDefault()
    const t = newAreaTitle.trim()
    if (!t || saving) return
    setSaving(true)
    const area = await createGrowthArea(t)
    if (area) setAreas(prev => [...prev, area])
    setNewAreaTitle('')
    setSaving(false)
  }

  async function handleAddObjective(areaId: string) {
    const t = (newObjByArea[areaId] ?? '').trim()
    if (!t || saving) return
    setSaving(true)
    const obj = await createGrowthObjective(areaId, t)
    if (obj) {
      setAreas(prev => prev.map(a =>
        a.id === areaId ? { ...a, growth_objectives: [...a.growth_objectives, obj] } : a
      ))
    }
    setNewObjByArea(prev => ({ ...prev, [areaId]: '' }))
    setSaving(false)
  }

  function handleStatoChange(areaId: string, objId: string, stato: GrowthObjective['stato']) {
    updateObjectiveStato(objId, stato).then(ok => {
      if (ok) {
        setAreas(prev => prev.map(a =>
          a.id === areaId
            ? { ...a, growth_objectives: a.growth_objectives.map(o => o.id === objId ? { ...o, stato } : o) }
            : a
        ))
      }
    })
  }

  async function handleDeleteArea(areaId: string) {
    const ok = await deleteGrowthArea(areaId)
    if (ok) setAreas(prev => prev.filter(a => a.id !== areaId))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin mx-auto" style={{ borderColor: 'var(--red2)', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  return (
    <div className="wire-page" style={{ maxWidth: 900, margin: '0 auto' }}>
      <div className="wire-masthead" style={{ gap: 8 }}>
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5" style={{ color: 'var(--red2)' }} />
          <span className="wire-masthead-title">La mia crescita professionale</span>
        </div>
        <p className="text-xs mt-1 px-4" style={{ color: 'var(--muted)', maxWidth: 600 }}>
          Un&rsquo;area è una direzione ampia su cui crescere (es. &ldquo;Autonomia nelle trattative&rdquo;). Sotto ogni area aggiungi obiettivi concreti (es. &ldquo;Chiudere 3 trattative senza supporto entro ottobre&rdquo;) per misurare i progressi.
        </p>
      </div>

      {/* Add area form */}
      <form onSubmit={handleAddArea} className="flex gap-2 px-4 py-3" style={{ maxWidth: 600 }}>
        <input
          type="text"
          value={newAreaTitle}
          onChange={e => setNewAreaTitle(e.target.value)}
          placeholder="Es: Autonomia nelle trattative, Public speaking, Gestione del tempo..."
          className="flex-1 px-3 py-2 rounded-lg text-sm"
          style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--text)' }}
        />
        <button
          type="submit"
          disabled={!newAreaTitle.trim() || saving}
          className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium transition-opacity"
          style={{ background: 'var(--red2)', color: '#fff', opacity: newAreaTitle.trim() ? 1 : 0.5 }}
        >
          <Plus className="w-4 h-4" /> Aggiungi
        </button>
      </form>

      {/* Personal areas */}
      <div className="space-y-4 px-4 pb-8">
        {areas.length === 0 && (
          <div className="text-center py-12" style={{ color: 'var(--muted)' }}>
            <Target className="w-10 h-10 mx-auto mb-3" style={{ opacity: 0.4 }} />
            <p className="text-sm">Ancora nessuna area.</p>
            <p className="text-xs mt-1">Esempio: crea l&rsquo;area &ldquo;Autonomia nelle trattative&rdquo;, poi aggiungi l&rsquo;obiettivo &ldquo;Chiudere 3 trattative senza supporto entro ottobre&rdquo;.</p>
          </div>
        )}

        {areas.map(area => (
          <div
            key={area.id}
            className="rounded-[14px] p-4"
            style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-base" style={{ color: 'var(--text)' }}>{area.titolo}</h3>
              <button
                onClick={() => handleDeleteArea(area.id)}
                className="p-1.5 rounded-md transition-colors hover:bg-[var(--line)]"
                title="Elimina area"
              >
                <Trash2 className="w-4 h-4" style={{ color: 'var(--muted)' }} />
              </button>
            </div>

            <ObjectivesList
              objectives={area.growth_objectives}
              areaId={area.id}
              onStatoChange={handleStatoChange}
            />

            {/* Add objective form */}
            <div className="flex gap-2">
              <input
                type="text"
                value={newObjByArea[area.id] ?? ''}
                onChange={e => setNewObjByArea(prev => ({ ...prev, [area.id]: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddObjective(area.id) } }}
                placeholder="Es: Presentare a un cliente senza supervisione entro fine anno"
                className="flex-1 px-3 py-1.5 rounded-lg text-sm"
                style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}
              />
              <button
                onClick={() => handleAddObjective(area.id)}
                disabled={!(newObjByArea[area.id] ?? '').trim() || saving}
                className="px-2.5 py-1.5 rounded-lg text-xs font-medium transition-opacity"
                style={{ background: 'var(--line)', color: 'var(--text)', opacity: (newObjByArea[area.id] ?? '').trim() ? 1 : 0.5 }}
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-[10px] mt-1" style={{ color: 'var(--muted)' }}>Un traguardo concreto e verificabile.</p>

            {area.stato === 'condiviso' && <NotesThread areaId={area.id} />}
          </div>
        ))}
      </div>

      {/* Team section — only renders if the user has reports */}
      <TeamSection />
    </div>
  )
}
