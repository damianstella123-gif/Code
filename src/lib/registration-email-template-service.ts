import { supabase } from './supabase';
import type {
  RegistrationEmailTheme,
  RegistrationEmailBlock,
} from '../../supabase/functions/_shared/registration-email-template';
import { validateRegistrationEmailDesign } from '../../supabase/functions/_shared/registration-email-template';

// ─── Types ──────────────────────────────────────────────────────────

export type RegistrationTemplateType =
  | 'invitation'
  | 'registration_confirmed'
  | 'registration_waitlist'
  | 'reminder';

export interface RegistrationEmailTemplate {
  id: string;
  event_id: string;
  client_id: string | null;
  site_id: string | null;
  name: string;
  template_type: RegistrationTemplateType;
  subject: string;
  preheader: string;
  theme: RegistrationEmailTheme;
  blocks: RegistrationEmailBlock[];
  is_active: boolean;
  version: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface RegistrationEmailTemplateInsert {
  event_id: string;
  site_id?: string | null;
  name: string;
  template_type: RegistrationTemplateType;
  subject: string;
  preheader?: string;
  theme: RegistrationEmailTheme;
  blocks: RegistrationEmailBlock[];
  is_active?: boolean;
}

export interface RegistrationEmailTemplateUpdate {
  name?: string;
  subject?: string;
  preheader?: string;
  theme?: RegistrationEmailTheme;
  blocks?: RegistrationEmailBlock[];
  is_active?: boolean;
}

// ─── Constants ──────────────────────────────────────────────────────

const TABLE = 'registration_email_templates' as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_TYPES = new Set<string>([
  'invitation',
  'registration_confirmed',
  'registration_waitlist',
  'reminder',
]);
const DANGEROUS_PATTERN =
  /<\s*(?:script|style|iframe|object|embed|form|link|meta)\b|on[a-z]+\s*=|javascript\s*:|data\s*:/i;

// ─── Validation helpers ─────────────────────────────────────────────

function requireUuid(value: unknown, label: string): void {
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    throw new Error(`${label}: identificativo non valido.`);
  }
}

function requireString(value: unknown, label: string, min: number, max: number): void {
  if (typeof value !== 'string') {
    throw new Error(`${label}: deve essere una stringa.`);
  }
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) {
    throw new Error(`${label}: lunghezza deve essere tra ${min} e ${max} caratteri.`);
  }
  if (DANGEROUS_PATTERN.test(value)) {
    throw new Error(`${label}: contenuto non consentito.`);
  }
}

function validateDesign(theme: RegistrationEmailTheme, blocks: RegistrationEmailBlock[]): void {
  const result = validateRegistrationEmailDesign({ theme, blocks });
  if (!result.valid) {
    throw new Error(result.errors[0] ?? 'Design non valido.');
  }
}

function validateInsert(input: RegistrationEmailTemplateInsert): void {
  if (typeof input.event_id !== 'string' || input.event_id.trim().length === 0) {
    throw new Error('Evento: identificativo mancante.');
  }
  if (input.site_id != null) {
    requireUuid(input.site_id, 'Sito di registrazione');
  }
  requireString(input.name, 'Nome template', 1, 100);
  if (!ALLOWED_TYPES.has(input.template_type)) {
    throw new Error('Tipo template non valido.');
  }
  requireString(input.subject, 'Oggetto', 1, 200);
  if (input.preheader !== undefined) {
    requireString(input.preheader, 'Preheader', 0, 300);
  }
  validateDesign(input.theme, input.blocks);
}

function validateUpdate(input: RegistrationEmailTemplateUpdate): void {
  if (input.name !== undefined) {
    requireString(input.name, 'Nome template', 1, 100);
  }
  if (input.subject !== undefined) {
    requireString(input.subject, 'Oggetto', 1, 200);
  }
  if (input.preheader !== undefined) {
    requireString(input.preheader, 'Preheader', 0, 300);
  }
  if (input.theme !== undefined && input.blocks !== undefined) {
    validateDesign(input.theme, input.blocks);
  } else if (input.theme !== undefined || input.blocks !== undefined) {
    throw new Error('Tema e blocchi devono essere aggiornati insieme.');
  }
}

// ─── Service ────────────────────────────────────────────────────────

export async function fetchRegistrationEmailTemplates(
  eventId: string,
  type?: RegistrationTemplateType,
): Promise<RegistrationEmailTemplate[]> {
  if (typeof eventId !== 'string' || eventId.trim().length === 0) {
    throw new Error('Evento: identificativo mancante.');
  }

  let query = supabase
    .from(TABLE)
    .select('*')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false });

  if (type) {
    if (!ALLOWED_TYPES.has(type)) {
      throw new Error('Tipo template non valido.');
    }
    query = query.eq('template_type', type);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error('Impossibile caricare i template email.');
  }
  return (data ?? []) as RegistrationEmailTemplate[];
}

export async function createRegistrationEmailTemplate(
  input: RegistrationEmailTemplateInsert,
): Promise<RegistrationEmailTemplate> {
  validateInsert(input);

  const row = {
    event_id: input.event_id,
    site_id: input.site_id ?? null,
    name: input.name.trim(),
    template_type: input.template_type,
    subject: input.subject.trim(),
    preheader: (input.preheader ?? '').trim(),
    theme: input.theme,
    blocks: input.blocks,
    is_active: input.is_active ?? true,
  };

  const { data, error } = await supabase.from(TABLE).insert(row).select().single();
  if (error) {
    throw new Error('Impossibile creare il template email.');
  }
  return data as RegistrationEmailTemplate;
}

export async function updateRegistrationEmailTemplate(
  id: string,
  input: RegistrationEmailTemplateUpdate,
): Promise<RegistrationEmailTemplate> {
  requireUuid(id, 'Template');
  validateUpdate(input);

  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.subject !== undefined) patch.subject = input.subject.trim();
  if (input.preheader !== undefined) patch.preheader = input.preheader.trim();
  if (input.theme !== undefined) patch.theme = input.theme;
  if (input.blocks !== undefined) patch.blocks = input.blocks;
  if (input.is_active !== undefined) patch.is_active = input.is_active;

  if (Object.keys(patch).length === 0) {
    throw new Error('Nessuna modifica specificata.');
  }

  const { data, error } = await supabase.from(TABLE).update(patch).eq('id', id).select().single();
  if (error) {
    throw new Error('Impossibile aggiornare il template email.');
  }
  return data as RegistrationEmailTemplate;
}

export async function deleteRegistrationEmailTemplate(id: string): Promise<void> {
  requireUuid(id, 'Template');

  const { error } = await supabase.from(TABLE).delete().eq('id', id);
  if (error) {
    throw new Error('Impossibile eliminare il template email.');
  }
}
