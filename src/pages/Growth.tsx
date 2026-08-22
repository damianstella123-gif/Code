import { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, Target, TrendingUp } from 'lucide-react'
import {
  fetchMyGrowthAreas, createGrowthArea, createGrowthObjective,
  updateObjectiveStato, deleteGrowthArea,
  type GrowthArea, type GrowthObjective,
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

  async function handleStatoChange(areaId: string, objId: string, stato: GrowthObjective['stato']) {
    const ok = await updateObjectiveStato(objId, stato)
    if (ok) {
      setAreas(prev => prev.map(a =>
        a.id === areaId
          ? { ...a, growth_objectives: a.growth_objectives.map(o => o.id === objId ? { ...o, stato } : o) }
          : a
      ))
    }
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
      </div>

      {/* Add area form */}
      <form onSubmit={handleAddArea} className="flex gap-2 px-4 py-3" style={{ maxWidth: 600 }}>
        <input
          type="text"
          value={newAreaTitle}
          onChange={e => setNewAreaTitle(e.target.value)}
          placeholder="Nuova area di crescita..."
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

      {/* Areas list */}
      <div className="space-y-4 px-4 pb-8">
        {areas.length === 0 && (
          <div className="text-center py-12" style={{ color: 'var(--muted)' }}>
            <Target className="w-10 h-10 mx-auto mb-3" style={{ opacity: 0.4 }} />
            <p className="text-sm">Nessuna area di crescita ancora definita.</p>
            <p className="text-xs mt-1">Inizia aggiungendo un ambito su cui vuoi migliorare.</p>
          </div>
        )}

        {areas.map(area => (
          <div
            key={area.id}
            className="rounded-[14px] p-4"
            style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}
          >
            {/* Area header */}
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

            {/* Objectives */}
            {area.growth_objectives.length > 0 && (
              <div className="space-y-2 mb-3">
                {area.growth_objectives.map(obj => (
                  <div
                    key={obj.id}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg"
                    style={{ background: 'var(--bg)', border: '1px solid var(--line)' }}
                  >
                    <span className="flex-1 text-sm" style={{ color: 'var(--text)' }}>{obj.titolo}</span>
                    <select
                      value={obj.stato}
                      onChange={e => handleStatoChange(area.id, obj.id, e.target.value as GrowthObjective['stato'])}
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
            )}

            {/* Add objective form */}
            <div className="flex gap-2">
              <input
                type="text"
                value={newObjByArea[area.id] ?? ''}
                onChange={e => setNewObjByArea(prev => ({ ...prev, [area.id]: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddObjective(area.id) } }}
                placeholder="Aggiungi obiettivo..."
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
          </div>
        ))}
      </div>
    </div>
  )
}
