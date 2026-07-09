import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { Event } from '@/data/events'

export function EventEconomicSummary({ event }: { event: Event }) {
  const [totals, setTotals] = useState({ venduto: 0, costo: 0, margine: 0, marginePct: 0 })

  useEffect(() => {
    async function load() {
      const [svcRes, hotelRes, restRes, expRes, catRes, staffIntRes, staffExtRes, varieRes, avRes, allestRes, graficaRes] = await Promise.all([
        supabase.from('event_supplier_services').select('venduto_unitario,venduto_totale,costo_unitario,costo_totale,quantita').eq('event_id', event.id),
        supabase.from('event_hotel_details').select('venduto_unitario,venduto_totale,costo_unitario,costo_totale,quantita').eq('event_id', event.id),
        supabase.from('event_restaurant_details').select('budget_per_persona,budget_totale,costo_per_persona,costo_totale_reale,pax_confermati,pax_previsti').eq('event_id', event.id),
        supabase.from('event_experience_details').select('venduto_unitario,venduto_totale,costo_unitario,costo_totale,pax').eq('event_id', event.id),
        supabase.from('event_catering_details').select('venduto_per_persona,venduto_totale,costo_per_persona,costo_totale,pax').eq('event_id', event.id),
        supabase.from('event_staff_interno_details').select('venduto_unitario,venduto_totale,costo_giornaliero,costo_unitario,costo_totale,quantita').eq('event_id', event.id),
        supabase.from('event_staff_esterno_details').select('venduto_unitario,venduto_totale,costo_unitario,costo_totale,quantita').eq('event_id', event.id),
        supabase.from('event_varie_details').select('venduto_unitario,venduto_totale,costo_unitario,costo_totale,quantita').eq('event_id', event.id),
        supabase.from('event_audio_video_details').select('venduto_unitario,venduto_totale,costo_unitario,costo_totale,quantita').eq('event_id', event.id),
        supabase.from('event_allestimenti_details').select('venduto_unitario,venduto_totale,costo_unitario,costo_totale,quantita').eq('event_id', event.id),
        supabase.from('event_grafica_stampa_details').select('venduto_unitario,venduto_totale,costo_unitario,costo_totale,quantita').eq('event_id', event.id),
      ])
      let venduto = 0, costo = 0
      for (const s of (svcRes.data ?? [])) {
        const qty = s.quantita ?? 1
        venduto += s.venduto_totale ?? (s.venduto_unitario ? s.venduto_unitario * qty : 0)
        costo += s.costo_totale ?? (s.costo_unitario ? s.costo_unitario * qty : 0)
      }
      for (const h of (hotelRes.data ?? [])) {
        const qty = h.quantita ?? 1
        venduto += h.venduto_totale ?? (h.venduto_unitario ? h.venduto_unitario * qty : 0)
        costo += h.costo_totale ?? (h.costo_unitario ? h.costo_unitario * qty : 0)
      }
      for (const r of (restRes.data ?? [])) {
        const pax = r.pax_confermati ?? r.pax_previsti ?? 1
        venduto += r.budget_totale ? Number(r.budget_totale) : (r.budget_per_persona ? Number(r.budget_per_persona) * pax : 0)
        costo += r.costo_totale_reale ? Number(r.costo_totale_reale) : (r.costo_per_persona ? Number(r.costo_per_persona) * pax : 0)
      }
      for (const e of (expRes.data ?? [])) {
        const pax = e.pax ?? 1
        venduto += e.venduto_totale ?? (e.venduto_unitario ? e.venduto_unitario * pax : 0)
        costo += e.costo_totale ?? (e.costo_unitario ? e.costo_unitario * pax : 0)
      }
      for (const c of (catRes.data ?? [])) {
        const pax = c.pax ?? 1
        venduto += c.venduto_totale ?? (c.venduto_per_persona ? c.venduto_per_persona * pax : 0)
        costo += c.costo_totale ?? (c.costo_per_persona ? c.costo_per_persona * pax : 0)
      }
      for (const si of (staffIntRes.data ?? [])) {
        const qty = si.quantita ?? 1
        venduto += si.venduto_totale ? Number(si.venduto_totale) : (si.venduto_unitario ? Number(si.venduto_unitario) * qty : 0)
        costo += si.costo_totale ? Number(si.costo_totale) : (si.costo_giornaliero ? Number(si.costo_giornaliero) : (si.costo_unitario ? Number(si.costo_unitario) * qty : 0))
      }
      for (const se of (staffExtRes.data ?? [])) {
        const qty = se.quantita ?? 1
        venduto += se.venduto_totale ?? (se.venduto_unitario ? se.venduto_unitario * qty : 0)
        costo += se.costo_totale ?? (se.costo_unitario ? se.costo_unitario * qty : 0)
      }
      for (const v of (varieRes.data ?? [])) {
        const qty = v.quantita ?? 1
        venduto += v.venduto_totale ?? (v.venduto_unitario ? v.venduto_unitario * qty : 0)
        costo += v.costo_totale ?? (v.costo_unitario ? v.costo_unitario * qty : 0)
      }
      for (const av of (avRes.data ?? [])) {
        const qty = av.quantita ?? 1
        venduto += av.venduto_totale ?? (av.venduto_unitario ? av.venduto_unitario * qty : 0)
        costo += av.costo_totale ?? (av.costo_unitario ? av.costo_unitario * qty : 0)
      }
      for (const al of (allestRes.data ?? [])) {
        const qty = al.quantita ?? 1
        venduto += al.venduto_totale ?? (al.venduto_unitario ? al.venduto_unitario * qty : 0)
        costo += al.costo_totale ?? (al.costo_unitario ? al.costo_unitario * qty : 0)
      }
      for (const g of (graficaRes.data ?? [])) {
        const qty = g.quantita ?? 1
        venduto += g.venduto_totale ?? (g.venduto_unitario ? g.venduto_unitario * qty : 0)
        costo += g.costo_totale ?? (g.costo_unitario ? g.costo_unitario * qty : 0)
      }
      const margine = venduto - costo
      const marginePct = venduto > 0 ? (margine / venduto) * 100 : 0
      setTotals({ venduto, costo, margine, marginePct })
    }
    load()
  }, [event.id])

  if (!totals.venduto && !totals.costo) {
    return (
      <div className="md:col-span-2" style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)', borderRadius: '14px', padding: '20px' }}>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)', marginBottom: '12px' }}>Controllo Economico</p>
        <p style={{ fontSize: '13px', color: 'var(--muted)' }}>Inserisci venduto e costo nei servizi operativi per visualizzare il riepilogo.</p>
      </div>
    )
  }

  return (
    <div className="md:col-span-2" style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)', borderRadius: '14px', padding: '20px' }}>
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)', marginBottom: '16px' }}>Controllo Economico</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="text-center p-3 rounded-xl" style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--muted)' }}>VENDUTO</p>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '18px', fontWeight: 700, color: 'var(--text)', marginTop: '4px' }}>{'\u20AC'}{totals.venduto.toLocaleString('it-IT', { minimumFractionDigits: 0 })}</p>
        </div>
        <div className="text-center p-3 rounded-xl" style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--muted)' }}>COSTI</p>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '18px', fontWeight: 700, color: 'var(--yellow)', marginTop: '4px' }}>{'\u20AC'}{totals.costo.toLocaleString('it-IT', { minimumFractionDigits: 0 })}</p>
        </div>
        <div className="text-center p-3 rounded-xl" style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--muted)' }}>MARGINE</p>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '18px', fontWeight: 700, color: totals.margine >= 0 ? 'var(--green)' : 'var(--red2)', marginTop: '4px' }}>{'\u20AC'}{totals.margine.toLocaleString('it-IT', { minimumFractionDigits: 0 })}</p>
        </div>
        <div className="text-center p-3 rounded-xl" style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--muted)' }}>MARGINE %</p>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '18px', fontWeight: 700, color: totals.marginePct >= 20 ? 'var(--green)' : totals.marginePct >= 0 ? 'var(--yellow)' : 'var(--red2)', marginTop: '4px' }}>{totals.marginePct.toFixed(1)}%</p>
        </div>
      </div>
    </div>
  )
}
