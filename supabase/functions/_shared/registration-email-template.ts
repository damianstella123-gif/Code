// ── Types ────────────────────────────────────────────────────────────

export type RegistrationEmailBlockType =
  | "logo"
  | "hero"
  | "heading"
  | "text"
  | "event_details"
  | "button"
  | "divider"
  | "contacts"
  | "footer"
  | "qr_code";

const ALLOWED_BLOCK_TYPES: ReadonlySet<string> = new Set<RegistrationEmailBlockType>([
  "logo",
  "hero",
  "heading",
  "text",
  "event_details",
  "button",
  "divider",
  "contacts",
  "footer",
  "qr_code",
]);

export type RegistrationEmailVariableKey =
  | "first_name"
  | "last_name"
  | "event_title"
  | "event_dates"
  | "event_location"
  | "registration_url";

const ALLOWED_VARIABLES: ReadonlySet<string> = new Set<RegistrationEmailVariableKey>([
  "first_name",
  "last_name",
  "event_title",
  "event_dates",
  "event_location",
  "registration_url",
]);

const EMAIL_SAFE_FONTS: ReadonlySet<string> = new Set([
  "Arial",
  "Helvetica",
  "Georgia",
  "Times New Roman",
  "Courier New",
  "Verdana",
  "Tahoma",
  "Trebuchet MS",
  "Lucida Sans",
  "Palatino",
]);

export interface RegistrationEmailTheme {
  background_color: string;
  content_background_color: string;
  primary_color: string;
  text_color: string;
  muted_color: string;
  border_radius: number;
  font_family: string;
}

export interface RegistrationEmailBlock {
  id: string;
  type: RegistrationEmailBlockType;
  visible: boolean;
  content: Record<string, unknown>;
}

export interface RegistrationQrDesign {
  foreground_color: string;
  background_color: string;
  size: number;
  show_frame: boolean;
  frame_text: string;
  logo_url: string | null;
  logo_scale: number;
  error_correction: "H";
  dot_style: "square" | "rounded" | "dots";
  corner_square_style: "square" | "dot" | "extra_rounded";
  corner_dot_style: "square" | "dot";
  quiet_zone: number;
}

const DEFAULT_QR_DESIGN: RegistrationQrDesign = {
  foreground_color: "#111827",
  background_color: "#FFFFFF",
  size: 220,
  show_frame: true,
  frame_text: "Mostra questo QR al check-in",
  logo_url: null,
  logo_scale: 0.15,
  error_correction: "H",
  dot_style: "rounded",
  corner_square_style: "extra_rounded",
  corner_dot_style: "dot",
  quiet_zone: 4,
};

export interface RegistrationEmailDesign {
  theme: RegistrationEmailTheme;
  blocks: RegistrationEmailBlock[];
}

export interface RegistrationEmailVariables {
  first_name?: string;
  last_name?: string;
  event_title?: string;
  event_dates?: string;
  event_location?: string;
  registration_url?: string;
}

export interface RegistrationEmailValidationResult {
  valid: boolean;
  errors: string[];
}

// ── Defaults ─────────────────────────────────────────────────────────

const DEFAULT_THEME: RegistrationEmailTheme = {
  background_color: "#F4F4F5",
  content_background_color: "#FFFFFF",
  primary_color: "#2563EB",
  text_color: "#18181B",
  muted_color: "#71717A",
  border_radius: 8,
  font_family: "Arial",
};

// ── Validation helpers ───────────────────────────────────────────────

const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

const DANGEROUS_PATTERN =
  /<\s*(?:script|style|iframe|object|embed|form|link|meta)\b|on[a-z]+\s*=|javascript\s*:|data\s*:/i;

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isStr(v: unknown): v is string {
  return typeof v === "string";
}

function isHexColor(v: unknown): boolean {
  return isStr(v) && HEX_COLOR_RE.test(v);
}

function isHttpsUrl(v: unknown): boolean {
  if (!isStr(v) || v.length === 0) return false;
  try {
    const u = new URL(v);
    return u.protocol === "https:";
  } catch {
    return false;
  }
}

function hasDangerousContent(v: unknown): boolean {
  return isStr(v) && DANGEROUS_PATTERN.test(v);
}

function checkStringField(
  v: unknown,
  label: string,
  min: number,
  max: number,
  errors: string[],
): void {
  if (!isStr(v) || v.trim().length < min || v.trim().length > max) {
    errors.push(`${label}: lunghezza deve essere tra ${min} e ${max} caratteri.`);
  } else if (hasDangerousContent(v)) {
    errors.push(`${label}: contenuto non consentito.`);
  }
}

function validateTheme(t: unknown, errors: string[]): void {
  if (!isObj(t)) {
    errors.push("Il tema deve essere un oggetto.");
    return;
  }
  const colorKeys: (keyof RegistrationEmailTheme)[] = [
    "background_color",
    "content_background_color",
    "primary_color",
    "text_color",
    "muted_color",
  ];
  for (const k of colorKeys) {
    if (!isHexColor(t[k])) {
      errors.push(`Tema: ${k} deve essere un colore #RRGGBB valido.`);
    }
  }
  if (typeof t.border_radius !== "number" || t.border_radius < 0 || t.border_radius > 32) {
    errors.push("Tema: border_radius deve essere un numero tra 0 e 32.");
  }
  if (!isStr(t.font_family) || !EMAIL_SAFE_FONTS.has(t.font_family)) {
    errors.push("Tema: font_family deve essere un font sicuro per email.");
  }
}

const QR_DOT_STYLES = new Set(["square", "rounded", "dots"]);
const QR_CORNER_SQUARE_STYLES = new Set(["square", "dot", "extra_rounded"]);
const QR_CORNER_DOT_STYLES = new Set(["square", "dot"]);

const QR_FORBIDDEN_KEYS = new Set([
  "qr_token", "token", "content", "data", "value", "svg", "path",
  "html", "css", "script", "style", "draw", "render",
]);

const QR_DATA_PATTERN =
  /data\s*:|javascript\s*:|<\s*(?:svg|path|script|style|img)\b/i;

function luminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const srgb = [r, g, b].map((c) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  );
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

function contrastRatio(c1: string, c2: string): number {
  const l1 = luminance(c1);
  const l2 = luminance(c2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function validateQrDesign(c: Record<string, unknown>, prefix: string, errors: string[]): void {
  for (const key of Object.keys(c)) {
    if (QR_FORBIDDEN_KEYS.has(key)) {
      errors.push(`${prefix}: chiave "${key}" non consentita.`);
      return;
    }
  }
  for (const val of Object.values(c)) {
    if (isStr(val) && QR_DATA_PATTERN.test(val)) {
      errors.push(`${prefix}: contenuto non consentito.`);
      return;
    }
    if (isStr(val) && hasDangerousContent(val)) {
      errors.push(`${prefix}: contenuto non consentito.`);
      return;
    }
  }

  if (!isHexColor(c.foreground_color)) {
    errors.push(`${prefix}: foreground_color deve essere #RRGGBB.`);
  }
  if (!isHexColor(c.background_color)) {
    errors.push(`${prefix}: background_color deve essere #RRGGBB.`);
  }
  if (isHexColor(c.foreground_color) && isHexColor(c.background_color)) {
    if (contrastRatio(c.foreground_color as string, c.background_color as string) < 4.5) {
      errors.push(`${prefix}: il contrasto tra foreground e background deve essere almeno 4.5:1.`);
    }
  }

  if (typeof c.size !== "number" || c.size < 160 || c.size > 320) {
    errors.push(`${prefix}: size deve essere tra 160 e 320.`);
  }
  if (typeof c.show_frame !== "boolean") {
    errors.push(`${prefix}: show_frame deve essere un booleano.`);
  }
  if (!isStr(c.frame_text) || (c.frame_text as string).length > 100) {
    errors.push(`${prefix}: frame_text deve essere una stringa di massimo 100 caratteri.`);
  }
  if (isStr(c.frame_text) && hasDangerousContent(c.frame_text)) {
    errors.push(`${prefix}: frame_text contiene contenuto non consentito.`);
  }

  if (c.logo_url !== null) {
    if (!isHttpsUrl(c.logo_url)) {
      errors.push(`${prefix}: logo_url deve essere null oppure un URL HTTPS.`);
    }
  }
  if (typeof c.logo_scale !== "number" || c.logo_scale < 0 || c.logo_scale > 0.20) {
    errors.push(`${prefix}: logo_scale deve essere tra 0 e 0.20.`);
  }

  if (c.error_correction !== "H") {
    errors.push(`${prefix}: error_correction deve essere "H".`);
  }
  if (!isStr(c.dot_style) || !QR_DOT_STYLES.has(c.dot_style as string)) {
    errors.push(`${prefix}: dot_style deve essere square, rounded o dots.`);
  }
  if (!isStr(c.corner_square_style) || !QR_CORNER_SQUARE_STYLES.has(c.corner_square_style as string)) {
    errors.push(`${prefix}: corner_square_style deve essere square, dot o extra_rounded.`);
  }
  if (!isStr(c.corner_dot_style) || !QR_CORNER_DOT_STYLES.has(c.corner_dot_style as string)) {
    errors.push(`${prefix}: corner_dot_style deve essere square o dot.`);
  }

  if (typeof c.quiet_zone !== "number" || !Number.isInteger(c.quiet_zone) || c.quiet_zone < 4 || c.quiet_zone > 8) {
    errors.push(`${prefix}: quiet_zone deve essere un intero tra 4 e 8.`);
  }
}

function validateBlockContent(b: RegistrationEmailBlock, idx: number, errors: string[]): void {
  const c = b.content;
  const prefix = `Blocco ${idx + 1} (${b.type})`;

  for (const val of Object.values(c)) {
    if (isStr(val) && hasDangerousContent(val)) {
      errors.push(`${prefix}: contenuto non consentito.`);
      return;
    }
  }

  switch (b.type) {
    case "logo":
    case "hero":
      if (c.image_url !== undefined && !isHttpsUrl(c.image_url)) {
        errors.push(`${prefix}: l'URL dell'immagine deve utilizzare HTTPS.`);
      }
      if (c.alt_text !== undefined) checkStringField(c.alt_text, `${prefix} alt_text`, 0, 200, errors);
      break;
    case "heading":
      checkStringField(c.text, `${prefix} testo`, 1, 300, errors);
      break;
    case "text":
      checkStringField(c.text, `${prefix} testo`, 1, 5000, errors);
      break;
    case "event_details":
      break;
    case "button":
      checkStringField(c.label, `${prefix} etichetta`, 1, 100, errors);
      if (c.url !== undefined) {
        const url = c.url as string;
        if (url !== "{{registration_url}}" && !isHttpsUrl(url)) {
          errors.push(`${prefix}: l'URL del pulsante deve essere {{registration_url}} oppure HTTPS.`);
        }
      }
      break;
    case "divider":
      break;
    case "contacts":
      if (c.text !== undefined) checkStringField(c.text, `${prefix} testo`, 0, 2000, errors);
      break;
    case "footer":
      checkStringField(c.text, `${prefix} testo`, 0, 2000, errors);
      break;
    case "qr_code":
      validateQrDesign(c, prefix, errors);
      break;
  }
}

// ── Public: validate ─────────────────────────────────────────────────

export function validateRegistrationEmailDesign(
  input: unknown,
): RegistrationEmailValidationResult {
  const errors: string[] = [];

  if (!isObj(input)) {
    return { valid: false, errors: ["Il design deve essere un oggetto."] };
  }

  validateTheme(input.theme, errors);

  if (!Array.isArray(input.blocks)) {
    errors.push("I blocchi devono essere un array.");
    return { valid: false, errors };
  }

  if (input.blocks.length > 30) {
    errors.push("Massimo 30 blocchi consentiti.");
    return { valid: false, errors };
  }

  const seenIds = new Set<string>();

  for (let i = 0; i < input.blocks.length; i++) {
    const raw = input.blocks[i];
    if (!isObj(raw)) {
      errors.push(`Blocco ${i + 1}: deve essere un oggetto.`);
      continue;
    }
    if (!isStr(raw.id) || raw.id.trim().length === 0) {
      errors.push(`Blocco ${i + 1}: id mancante.`);
      continue;
    }
    if (seenIds.has(raw.id as string)) {
      errors.push(`Blocco ${i + 1}: id duplicato.`);
      continue;
    }
    seenIds.add(raw.id as string);

    if (!isStr(raw.type) || !ALLOWED_BLOCK_TYPES.has(raw.type as string)) {
      errors.push(`Blocco ${i + 1}: tipo non consentito.`);
      continue;
    }
    if (typeof raw.visible !== "boolean") {
      errors.push(`Blocco ${i + 1}: visible deve essere un booleano.`);
      continue;
    }
    if (!isObj(raw.content)) {
      errors.push(`Blocco ${i + 1}: content deve essere un oggetto.`);
      continue;
    }

    validateBlockContent(raw as unknown as RegistrationEmailBlock, i, errors);
  }

  return { valid: errors.length === 0, errors };
}

// ── HTML helpers ─────────────────────────────────────────────────────

const ESC_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESC_MAP[c]);
}

function resolveVar(
  template: string,
  vars: RegistrationEmailVariables,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    if (!ALLOWED_VARIABLES.has(key)) return "";
    const val = vars[key as RegistrationEmailVariableKey];
    return esc(val ?? "");
  });
}

function resolveVarPlain(
  template: string,
  vars: RegistrationEmailVariables,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    if (!ALLOWED_VARIABLES.has(key)) return "";
    return vars[key as RegistrationEmailVariableKey] ?? "";
  });
}

// ── Public: render HTML ──────────────────────────────────────────────

export function renderRegistrationEmailHtml(
  design: RegistrationEmailDesign,
  variables: RegistrationEmailVariables,
): string {
  const validation = validateRegistrationEmailDesign(design);
  if (!validation.valid) {
    throw new Error(`Design non valido: ${validation.errors[0]}`);
  }

  const t = design.theme;
  const ff = esc(t.font_family);
  const radius = `${t.border_radius}px`;

  const visibleBlocks = design.blocks.filter((b) => b.visible);
  const blockHtml = visibleBlocks.map((b) => renderBlockHtml(b, t, variables)).join("");

  return `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(variables.event_title ?? "")}</title>
</head>
<body style="margin:0;padding:0;background-color:${esc(t.background_color)};font-family:${ff},sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${esc(t.background_color)};">
<tr><td align="center" style="padding:24px 16px;">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" style="max-width:640px;width:100%;background-color:${esc(t.content_background_color)};border-radius:${radius};overflow:hidden;">
${blockHtml}
</table>
</td></tr>
</table>
</body>
</html>`;
}

function renderBlockHtml(
  block: RegistrationEmailBlock,
  theme: RegistrationEmailTheme,
  vars: RegistrationEmailVariables,
): string {
  const c = block.content;
  const tc = esc(theme.text_color);
  const mc = esc(theme.muted_color);
  const pc = esc(theme.primary_color);
  const ff = esc(theme.font_family);
  const radius = `${theme.border_radius}px`;

  switch (block.type) {
    case "logo": {
      const url = isStr(c.image_url) && c.image_url ? esc(c.image_url) : "";
      const alt = isStr(c.alt_text) ? esc(c.alt_text) : "";
      if (!url) return "";
      return `<tr><td align="center" style="padding:24px 32px;">
<img src="${url}" alt="${alt}" style="max-width:180px;max-height:80px;display:block;" />
</td></tr>`;
    }
    case "hero": {
      const url = isStr(c.image_url) && c.image_url ? esc(c.image_url) : "";
      const alt = isStr(c.alt_text) ? esc(c.alt_text) : "";
      if (!url) return "";
      return `<tr><td style="padding:0;">
<img src="${url}" alt="${alt}" style="width:100%;max-width:640px;display:block;" />
</td></tr>`;
    }
    case "heading": {
      const text = isStr(c.text) ? resolveVar(c.text, vars) : "";
      return `<tr><td style="padding:24px 32px 8px;font-family:${ff},sans-serif;font-size:22px;font-weight:700;color:${tc};line-height:1.2;">
${text}
</td></tr>`;
    }
    case "text": {
      const raw = isStr(c.text) ? c.text : "";
      const resolved = resolveVar(raw, vars);
      const html = resolved.replace(/\n/g, "<br>");
      return `<tr><td style="padding:8px 32px 16px;font-family:${ff},sans-serif;font-size:15px;color:${tc};line-height:1.6;">
${html}
</td></tr>`;
    }
    case "event_details": {
      const title = esc(vars.event_title ?? "");
      const dates = esc(vars.event_dates ?? "");
      const location = esc(vars.event_location ?? "");
      const rows: string[] = [];
      if (title) rows.push(`<strong>${title}</strong>`);
      if (dates) rows.push(dates);
      if (location) rows.push(location);
      if (rows.length === 0) return "";
      return `<tr><td style="padding:16px 32px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${esc(theme.background_color)};border-radius:${radius};padding:16px;">
<tr><td style="font-family:${ff},sans-serif;font-size:14px;color:${tc};line-height:1.6;">
${rows.join("<br>")}
</td></tr>
</table>
</td></tr>`;
    }
    case "button": {
      const label = isStr(c.label) ? resolveVar(c.label, vars) : "";
      const rawUrl = isStr(c.url) ? c.url : "{{registration_url}}";
      const href = esc(resolveVarPlain(rawUrl, vars));
      return `<tr><td align="center" style="padding:16px 32px 24px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0">
<tr><td align="center" style="background-color:${pc};border-radius:${radius};padding:12px 32px;">
<a href="${href}" target="_blank" style="color:#ffffff;font-family:${ff},sans-serif;font-size:15px;font-weight:600;text-decoration:none;display:inline-block;">${label}</a>
</td></tr>
</table>
</td></tr>`;
    }
    case "divider":
      return `<tr><td style="padding:8px 32px;">
<hr style="border:none;border-top:1px solid ${mc};margin:0;" />
</td></tr>`;
    case "contacts": {
      const text = isStr(c.text) ? resolveVar(c.text, vars) : "";
      const html = text.replace(/\n/g, "<br>");
      return `<tr><td style="padding:8px 32px;font-family:${ff},sans-serif;font-size:13px;color:${mc};line-height:1.5;">
${html}
</td></tr>`;
    }
    case "footer": {
      const text = isStr(c.text) ? resolveVar(c.text, vars) : "";
      const html = text.replace(/\n/g, "<br>");
      return `<tr><td style="padding:16px 32px 24px;font-family:${ff},sans-serif;font-size:12px;color:${mc};line-height:1.5;text-align:center;">
${html}
</td></tr>`;
    }
    case "qr_code": {
      const qr = { ...DEFAULT_QR_DESIGN, ...c } as RegistrationQrDesign;
      const imgSize = `${qr.size}px`;
      const cardBg = esc(qr.background_color);
      const cardFg = esc(qr.foreground_color);
      let frameHtml = "";
      if (qr.show_frame && qr.frame_text) {
        frameHtml = `<tr><td align="center" style="padding:8px 0 0;font-family:${ff},sans-serif;font-size:12px;color:${cardFg};">
${esc(qr.frame_text)}
</td></tr>`;
      }
      return `<tr><td align="center" style="padding:16px 32px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="background-color:${cardBg};border-radius:${radius};padding:16px;">
<tr><td align="center">
<img src="cid:registration-qr" alt="QR Code" width="${qr.size}" height="${qr.size}" style="width:${imgSize};height:${imgSize};display:block;" />
</td></tr>
${frameHtml}
</table>
</td></tr>`;
    }
    default:
      return "";
  }
}

// ── Public: render plain text ────────────────────────────────────────

export function renderRegistrationEmailText(
  design: RegistrationEmailDesign,
  variables: RegistrationEmailVariables,
): string {
  const validation = validateRegistrationEmailDesign(design);
  if (!validation.valid) {
    throw new Error(`Design non valido: ${validation.errors[0]}`);
  }

  const parts: string[] = [];

  for (const block of design.blocks) {
    if (!block.visible) continue;
    const c = block.content;

    switch (block.type) {
      case "heading":
        if (isStr(c.text)) parts.push(resolveVarPlain(c.text, variables).toUpperCase());
        break;
      case "text":
        if (isStr(c.text)) parts.push(resolveVarPlain(c.text, variables));
        break;
      case "event_details": {
        const lines: string[] = [];
        if (variables.event_title) lines.push(variables.event_title);
        if (variables.event_dates) lines.push(variables.event_dates);
        if (variables.event_location) lines.push(variables.event_location);
        if (lines.length) parts.push(lines.join("\n"));
        break;
      }
      case "button":
        if (isStr(c.label)) parts.push(resolveVarPlain(c.label as string, variables));
        if (isStr(c.url)) {
          const resolved = resolveVarPlain(c.url as string, variables);
          if (resolved) parts.push(resolved);
        }
        break;
      case "contacts":
        if (isStr(c.text)) parts.push(resolveVarPlain(c.text as string, variables));
        break;
      case "footer":
        if (isStr(c.text)) parts.push("---\n" + resolveVarPlain(c.text as string, variables));
        break;
      case "qr_code":
        parts.push("QR code allegato alla presente email.");
        break;
      case "divider":
        parts.push("---");
        break;
    }
  }

  return parts.filter(Boolean).join("\n\n") + "\n";
}

// ── Public: default confirmation design ─────────────────────────────

export function createDefaultConfirmationDesign(): RegistrationEmailDesign {
  return {
    theme: { ...DEFAULT_THEME },
    blocks: [
      {
        id: "logo-1",
        type: "logo",
        visible: true,
        content: { image_url: "", alt_text: "Logo" },
      },
      {
        id: "heading-1",
        type: "heading",
        visible: true,
        content: { text: "Registrazione confermata" },
      },
      {
        id: "text-1",
        type: "text",
        visible: true,
        content: {
          text: "Ciao {{first_name}},\n\nla tua registrazione all'evento {{event_title}} è stata confermata.\nDi seguito trovi i dettagli e il tuo codice QR per l'accesso.",
        },
      },
      {
        id: "event-details-1",
        type: "event_details",
        visible: true,
        content: {},
      },
      {
        id: "qr-code-1",
        type: "qr_code",
        visible: true,
        content: { ...DEFAULT_QR_DESIGN },
      },
      {
        id: "footer-1",
        type: "footer",
        visible: true,
        content: {
          text: "Questa email è stata inviata automaticamente. Per informazioni, contatta l'organizzatore dell'evento.",
        },
      },
    ],
  };
}

// ── Public: default invitation design ────────────────────────────────

export function createDefaultInvitationDesign(): RegistrationEmailDesign {
  return {
    theme: { ...DEFAULT_THEME },
    blocks: [
      {
        id: "logo-1",
        type: "logo",
        visible: true,
        content: { image_url: "", alt_text: "Logo" },
      },
      {
        id: "heading-1",
        type: "heading",
        visible: true,
        content: { text: "Sei invitato!" },
      },
      {
        id: "text-1",
        type: "text",
        visible: true,
        content: {
          text: "Ciao {{first_name}},\n\nsei stato invitato a partecipare all'evento {{event_title}}.\nDi seguito trovi i dettagli dell'evento.",
        },
      },
      {
        id: "event-details-1",
        type: "event_details",
        visible: true,
        content: {},
      },
      {
        id: "button-1",
        type: "button",
        visible: true,
        content: { label: "Conferma la tua partecipazione", url: "{{registration_url}}" },
      },
      {
        id: "footer-1",
        type: "footer",
        visible: true,
        content: {
          text: "Questa email \u00e8 stata inviata automaticamente. Per informazioni, contatta l'organizzatore dell'evento.",
        },
      },
    ],
  };
}
