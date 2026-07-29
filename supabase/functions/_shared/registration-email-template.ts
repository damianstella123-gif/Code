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
  | "footer";

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
      // Accepts optional overrides; rendered from variables
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

function nl2br(s: string): string {
  return esc(s).replace(/\n/g, "<br>");
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
      case "divider":
        parts.push("---");
        break;
    }
  }

  return parts.filter(Boolean).join("\n\n") + "\n";
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
