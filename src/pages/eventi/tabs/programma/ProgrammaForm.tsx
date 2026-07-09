import { X } from 'lucide-react'
import type { Supplier } from '@/data/suppliers'
import { PROGRAM_CATEGORIES } from './types'

interface FormData {
  supplier_id: string
  titolo: string
  categoria: string
  data: string
  data_fine: string
  ora_inizio: string
  ora_fine: string
  luogo: string
  note: string
  pax: string
  servizio: string
}

interface ProgrammaFormProps {
  showForm: boolean
  formData: FormData
  setFormData: React.Dispatch<React.SetStateAction<FormData>>
  editingId: string | null
  resetForm: () => void
  handleSave: () => void
  suppliers: Supplier[]
}

export function ProgrammaForm({ showForm, formData, setFormData, editingId, resetForm, handleSave, suppliers }: ProgrammaFormProps) {
  if (!showForm) return null

  return (
    <div className="panel p-5 space-y-4" style={{ border: '1px solid var(--red2)', borderRadius: '12px' }}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
          {editingId ? 'Modifica voce programma' : 'Nuova voce programma'}
        </p>
        <button onClick={resetForm} className="p-1 rounded hover:bg-[var(--line)]"><X className="w-4 h-4" style={{ color: 'var(--muted)' }} /></button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Fornitore</label>
          <select
            value={formData.supplier_id}
            onChange={e => setFormData(prev => ({ ...prev, supplier_id: e.target.value, servizio: '' }))}
            className="w-full px-3 py-2 rounded-lg text-sm"
            style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}
          >
            <option value="">-- Nessun fornitore --</option>
            {suppliers.map(s => (
              <option key={s.id} value={s.id}>{s.nome}{s.categoria ? ` (${s.categoria})` : ''}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Servizio collegato</label>
          <input
            value={formData.servizio}
            onChange={e => setFormData(prev => ({ ...prev, servizio: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg text-sm"
            style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}
            placeholder="es. Coffee break, Allestimento palco..."
          />
        </div>

        <div>
          <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Titolo *</label>
          <input
            value={formData.titolo}
            onChange={e => setFormData(prev => ({ ...prev, titolo: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg text-sm"
            style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}
            placeholder="es. Coffee break, Meeting plenaria..."
          />
        </div>

        <div>
          <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Categoria</label>
          <select
            value={formData.categoria}
            onChange={e => setFormData(prev => ({ ...prev, categoria: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg text-sm"
            style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}
          >
            {PROGRAM_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div>
          <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Data *</label>
          <input
            type="date"
            value={formData.data}
            onChange={e => setFormData(prev => ({ ...prev, data: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg text-sm"
            style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}
          />
        </div>

        <div>
          <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Data fine</label>
          <input
            type="date"
            value={formData.data_fine}
            min={formData.data || undefined}
            onChange={e => setFormData(prev => ({ ...prev, data_fine: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg text-sm"
            style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}
          />
          <p className="text-[10px] mt-1" style={{ color: 'var(--muted)' }}>
            Lascia vuoto se dura un solo giorno. Es. pernottamento 27-28: data 27, data fine 29 (check-out).
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Ora inizio *</label>
            <input
              type="time"
              value={formData.ora_inizio}
              onChange={e => setFormData(prev => ({ ...prev, ora_inizio: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}
            />
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Ora fine</label>
            <input
              type="time"
              value={formData.ora_fine}
              onChange={e => setFormData(prev => ({ ...prev, ora_fine: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Location / Sala</label>
          <input
            value={formData.luogo}
            onChange={e => setFormData(prev => ({ ...prev, luogo: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg text-sm"
            style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}
            placeholder="es. Sala Galileo, Terrazza..."
          />
        </div>

        <div>
          <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Pax</label>
          <input
            type="number"
            value={formData.pax}
            onChange={e => setFormData(prev => ({ ...prev, pax: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg text-sm"
            style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}
            placeholder="Numero partecipanti"
          />
        </div>

        <div className="md:col-span-2">
          <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Note operative</label>
          <textarea
            value={formData.note}
            onChange={e => setFormData(prev => ({ ...prev, note: e.target.value }))}
            rows={2}
            className="w-full px-3 py-2 rounded-lg text-sm resize-none"
            style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}
            placeholder="Note operative, istruzioni..."
          />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button onClick={resetForm} className="px-4 py-2 rounded-lg text-xs font-medium" style={{ color: 'var(--muted)' }}>Annulla</button>
        <button
          onClick={handleSave}
          disabled={!formData.titolo.trim() || !formData.data || !formData.ora_inizio}
          className="px-4 py-2 rounded-lg text-xs font-medium text-white disabled:opacity-40"
          style={{ background: 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)' }}
        >
          {editingId ? 'Salva modifiche' : 'Aggiungi al programma'}
        </button>
      </div>
    </div>
  )
}
