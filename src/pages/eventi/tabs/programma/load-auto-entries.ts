import { supabase } from '@/lib/supabase'
import type { Event } from '@/data/events'
import {
  SVC_CATEGORIES, HOTEL_TIPOS,
  type SupplierService, type HotelDetail, type RestaurantDetail,
  type ExperienceDetail, type CateringDetail, type StaffInternoDetail,
  type StaffEsternoDetail, type VarieDetail,
} from '../../supplier-details-types'
import type { ProgramEntry } from './types'

export async function loadAutoEntries(event: Event): Promise<ProgramEntry[]> {
  const [svcRes, hotelRes, restRes, expRes, catRes, staffIntRes, staffExtRes, varieRes, avRes, allestRes, graficaRes] = await Promise.all([
    supabase.from('event_supplier_services').select('*').eq('event_id', event.id),
    supabase.from('event_hotel_details').select('*').eq('event_id', event.id),
    supabase.from('event_restaurant_details').select('*').eq('event_id', event.id),
    supabase.from('event_experience_details').select('*').eq('event_id', event.id),
    supabase.from('event_catering_details').select('*').eq('event_id', event.id),
    supabase.from('event_staff_interno_details').select('*').eq('event_id', event.id),
    supabase.from('event_staff_esterno_details').select('*').eq('event_id', event.id),
    supabase.from('event_varie_details').select('*').eq('event_id', event.id),
    supabase.from('event_audio_video_details').select('*').eq('event_id', event.id),
    supabase.from('event_allestimenti_details').select('*').eq('event_id', event.id),
    supabase.from('event_grafica_stampa_details').select('*').eq('event_id', event.id),
  ])

  const program: ProgramEntry[] = []

  for (const svc of (svcRes.data ?? []) as SupplierService[]) {
    if (svc.data && svc.ora_inizio) {
      program.push({
        id: svc.id, supplier_id: svc.supplier_id,
        titolo: svc.titolo,
        categoria: SVC_CATEGORIES.find(c => c.value === svc.categoria)?.label ?? svc.categoria,
        data: svc.data, ora_inizio: svc.ora_inizio, ora_fine: svc.ora_fine,
        luogo: svc.partenza && svc.destinazione ? `${svc.partenza} → ${svc.destinazione}` : svc.luogo,
        note: svc.note,
      })
    }
  }

  for (const h of (hotelRes.data ?? []) as HotelDetail[]) {
    const sotto = h.sotto_categoria || h.tipo || 'pernottamento'
    const tipoLabel = HOTEL_TIPOS.find(t => t.value === sotto)?.label ?? sotto
    if (sotto === 'pernottamento') {
      if (h.check_in_date) {
        const roomInfo = [h.quantita ? `${h.quantita} camere` : '', h.room_type].filter(Boolean).join(' ')
        program.push({ id: h.id + '-cin', supplier_id: h.supplier_id, titolo: 'Check-in Hotel', categoria: 'Hotel', data: h.check_in_date, ora_inizio: h.check_in_time || '14:00', ora_fine: null, luogo: h.luogo, note: roomInfo })
      }
      if (h.check_out_date) {
        const roomInfo = [h.quantita ? `${h.quantita} camere` : '', h.room_type].filter(Boolean).join(' ')
        program.push({ id: h.id + '-cout', supplier_id: h.supplier_id, titolo: 'Check-out Hotel', categoria: 'Hotel', data: h.check_out_date, ora_inizio: h.check_out_time || '10:00', ora_fine: null, luogo: h.luogo, note: roomInfo })
      }
    } else if (sotto === 'meeting_room' || sotto === 'breakout_room' || sotto === 'sala_regia') {
      if (h.data && h.ora_inizio) {
        program.push({ id: h.id + '-meet', supplier_id: h.supplier_id, titolo: `${tipoLabel}${h.luogo ? ' - ' + h.luogo : ''}${h.meeting_pax ? ' ' + h.meeting_pax + ' pax' : ''}`, categoria: 'Meeting', data: h.data, ora_inizio: h.ora_inizio, ora_fine: h.ora_fine, luogo: h.luogo, note: [h.meeting_setup, h.meeting_equipment, h.note].filter(Boolean).join(' | ') })
      }
    } else {
      if (h.data && h.ora_inizio) {
        program.push({ id: h.id, supplier_id: h.supplier_id, titolo: tipoLabel, categoria: 'F&B', data: h.data, ora_inizio: h.ora_inizio, ora_fine: null, luogo: h.luogo, note: h.note })
      }
    }
  }

  for (const r of (restRes.data ?? []) as RestaurantDetail[]) {
    if (r.data && r.ora_inizio) {
      program.push({ id: r.id + '-start', supplier_id: r.supplier_id, titolo: r.tipologia_servizio || 'Servizio ristorante', categoria: 'Ristorante', data: r.data, ora_inizio: r.ora_inizio, ora_fine: r.ora_fine, luogo: r.nome_sala, note: r.pax_confermati ? `${r.pax_confermati} pax` : '' })
    }
  }

  for (const e of (expRes.data ?? []) as ExperienceDetail[]) {
    if (e.data && e.ora_inizio) {
      program.push({ id: e.id, supplier_id: e.supplier_id ?? '', titolo: e.nome_attivita || 'Experience', categoria: 'Experience', data: e.data, ora_inizio: e.ora_inizio, ora_fine: e.ora_fine, luogo: e.location, note: [e.pax ? `${e.pax} pax` : '', e.durata_minuti ? `${e.durata_minuti} min` : '', e.note_operative].filter(Boolean).join(' | ') })
    }
  }

  for (const c of (catRes.data ?? []) as CateringDetail[]) {
    const ora = c.ora_inizio || c.ora
    if (c.data && ora) {
      program.push({ id: c.id, supplier_id: c.supplier_id ?? '', titolo: c.tipologia || 'Catering', categoria: 'Catering', data: c.data, ora_inizio: ora, ora_fine: c.ora_fine, luogo: '', note: c.pax ? `${c.pax} pax` : '' })
    }
  }

  for (const si of (staffIntRes.data ?? []) as StaffInternoDetail[]) {
    if (si.data && si.ora_inizio) {
      const nome = [(si as any).nome, (si as any).cognome].filter(Boolean).join(' ') || si.risorsa || ''
      const label = si.ruolo ? (nome ? `${si.ruolo} - ${nome}` : si.ruolo) : (nome || 'Staff Simmetria')
      program.push({ id: si.id, supplier_id: si.supplier_id ?? '', titolo: label, categoria: 'Staff Simmetria', data: si.data, ora_inizio: si.ora_inizio, ora_fine: si.ora_fine, luogo: '', note: si.note || '' })
    }
  }

  for (const se of (staffExtRes.data ?? []) as StaffEsternoDetail[]) {
    if (se.data && se.ora_inizio) {
      const nome = [(se as any).nome, (se as any).cognome].filter(Boolean).join(' ')
      const label = se.ruolo ? (nome ? `${se.ruolo} - ${nome}` : `${se.ruolo}${se.quantita > 1 ? ' x' + se.quantita : ''}`) : (nome || 'Staff Esterno')
      program.push({ id: se.id, supplier_id: se.supplier_id ?? '', titolo: label, categoria: 'Staff Esterno', data: se.data, ora_inizio: se.ora_inizio, ora_fine: se.ora_fine, luogo: '', note: [se.lingue, se.note].filter(Boolean).join(' | ') })
    }
  }

  for (const v of (varieRes.data ?? []) as VarieDetail[]) {
    if (v.data && v.ora_inizio) {
      program.push({ id: v.id, supplier_id: v.supplier_id ?? '', titolo: v.descrizione || 'Varie', categoria: 'Varie', data: v.data, ora_inizio: v.ora_inizio, ora_fine: null, luogo: '', note: v.note || '' })
    }
  }

  for (const av of (avRes.data ?? []) as Record<string, unknown>[]) {
    if (av.data_montaggio && av.ora_montaggio) program.push({ id: av.id + '-mont', supplier_id: (av.supplier_id as string) ?? '', titolo: 'Montaggio AV', categoria: 'Audio Video', data: av.data_montaggio as string, ora_inizio: av.ora_montaggio as string, ora_fine: null, luogo: '', note: (av.tipologia_servizio as string) || '' })
    if (av.data_prove && av.ora_prove) program.push({ id: av.id + '-prove', supplier_id: (av.supplier_id as string) ?? '', titolo: 'Prove AV', categoria: 'Audio Video', data: av.data_prove as string, ora_inizio: av.ora_prove as string, ora_fine: null, luogo: '', note: '' })
    if (av.data_evento && av.ora_evento) program.push({ id: av.id + '-evt', supplier_id: (av.supplier_id as string) ?? '', titolo: (av.tipologia_servizio as string) || 'Servizio AV', categoria: 'Audio Video', data: av.data_evento as string, ora_inizio: av.ora_evento as string, ora_fine: null, luogo: '', note: '' })
    if (av.data_smontaggio && av.ora_smontaggio) program.push({ id: av.id + '-smont', supplier_id: (av.supplier_id as string) ?? '', titolo: 'Smontaggio AV', categoria: 'Audio Video', data: av.data_smontaggio as string, ora_inizio: av.ora_smontaggio as string, ora_fine: null, luogo: '', note: '' })
  }

  for (const al of (allestRes.data ?? []) as Record<string, unknown>[]) {
    if (al.data_montaggio && al.ora_montaggio) program.push({ id: al.id + '-mont', supplier_id: (al.supplier_id as string) ?? '', titolo: `Montaggio: ${(al.descrizione as string) || 'Allestimento'}`, categoria: 'Allestimenti', data: al.data_montaggio as string, ora_inizio: al.ora_montaggio as string, ora_fine: null, luogo: (al.area_utilizzo as string) || '', note: '' })
    if (al.data_smontaggio && al.ora_smontaggio) program.push({ id: al.id + '-smont', supplier_id: (al.supplier_id as string) ?? '', titolo: `Smontaggio: ${(al.descrizione as string) || 'Allestimento'}`, categoria: 'Allestimenti', data: al.data_smontaggio as string, ora_inizio: al.ora_smontaggio as string, ora_fine: null, luogo: (al.area_utilizzo as string) || '', note: '' })
  }

  for (const g of (graficaRes.data ?? []) as Record<string, unknown>[]) {
    if (g.data_consegna) program.push({ id: g.id as string, supplier_id: (g.supplier_id as string) ?? '', titolo: `Consegna: ${(g.tipo_materiale as string) || 'Materiale'}`, categoria: 'Grafica/Stampa', data: g.data_consegna as string, ora_inizio: '09:00', ora_fine: null, luogo: '', note: (g.formato as string) || '' })
  }

  return program
}
