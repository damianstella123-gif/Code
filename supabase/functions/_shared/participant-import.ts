import * as XLSX from "npm:xlsx@0.18.5/xlsx.mjs";

export interface SheetData {
  index: number;
  name: string;
  headers: string[];
  rows: string[][];
}

export interface Workbook {
  sheets: SheetData[];
}

export type ParticipantColumnKey =
  | "first_name"
  | "last_name"
  | "email"
  | "phone"
  | "company"
  | "job_title"
  | "dietary_requirements"
  | "accessibility_requirements"
  | "ignore";

export interface ColumnMapping {
  sourceIndex: number;
  sourceHeader: string;
  target: ParticipantColumnKey;
}

const MAX_ROWS = 5000;
const MAX_COLS = 100;

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const HEADER_MAP: [RegExp, Exclude<ParticipantColumnKey, "ignore">][] = [
  [/^(nome|first ?name|name|prenom)$/, "first_name"],
  [/^(cognome|last ?name|surname|family ?name)$/, "last_name"],
  [/^(e-?mail|email|mail|posta ?elettronica)$/, "email"],
  [/^(telefono|phone|mobile|cellulare|cell|tel)$/, "phone"],
  [/^(azienda|company|societa|organizzazione|org)$/, "company"],
  [/^(ruolo|qualifica|job ?title|position|posizione|titolo)$/, "job_title"],
  [/^(intolleranze|allergie|esigenze ?alimentari|dietary ?requirements|dietary ?restrictions|dieta|alimentazione)$/, "dietary_requirements"],
  [/^(accessibilita|accessibility|special ?needs|disabilita|esigenze ?speciali)$/, "accessibility_requirements"],
];

function matchHeader(header: string): Exclude<ParticipantColumnKey, "ignore"> | null {
  const n = normalize(header);
  for (const [re, key] of HEADER_MAP) {
    if (re.test(n)) return key;
  }
  return null;
}

function isRowEmpty(row: string[]): boolean {
  return row.every((cell) => !cell || !cell.trim());
}

const MAX_FILE_SIZE = 25 * 1024 * 1024;

export function parseParticipantWorkbook(buffer: Uint8Array): Workbook {
  if (buffer.byteLength > MAX_FILE_SIZE) {
    throw new Error("Il file supera la dimensione massima consentita (25 MB).");
  }
  const wb = XLSX.read(buffer, { type: "array" });
  const sheets: SheetData[] = [];

  for (let idx = 0; idx < wb.SheetNames.length; idx++) {
    const sheetName = wb.SheetNames[idx];
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;

    const raw: string[][] = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      defval: "",
      blankrows: false,
    });

    if (raw.length === 0) continue;

    const headerRow = raw[0].slice(0, MAX_COLS).map((cell) => String(cell ?? ""));
    const dataRows: string[][] = [];

    for (let i = 1; i < raw.length && dataRows.length < MAX_ROWS; i++) {
      const row = raw[i].slice(0, MAX_COLS).map((cell) => String(cell ?? ""));
      if (!isRowEmpty(row)) dataRows.push(row);
    }

    if (dataRows.length > 0) {
      sheets.push({ index: idx, name: sheetName, headers: headerRow, rows: dataRows });
    }
  }

  if (sheets.length === 0) {
    throw new Error("Il file non contiene fogli con dati validi.");
  }

  return { sheets };
}

export function autoMapParticipantHeaders(headers: string[]): ColumnMapping[] {
  const used = new Set<Exclude<ParticipantColumnKey, "ignore">>();
  const mappings: ColumnMapping[] = [];

  for (let i = 0; i < headers.length; i++) {
    const header = headers[i];
    const matched = matchHeader(header);
    if (matched && !used.has(matched)) {
      used.add(matched);
      mappings.push({ sourceIndex: i, sourceHeader: header, target: matched });
    } else {
      mappings.push({ sourceIndex: i, sourceHeader: header, target: "ignore" });
    }
  }

  return mappings;
}

// ---------------------------------------------------------------------------
// parseParticipantSheet
// ---------------------------------------------------------------------------

export interface ParsedParticipantRow {
  rowIndex: number;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  company: string;
  job_title: string;
  dietary_requirements: string;
  accessibility_requirements: string;
  extraFields: Record<string, string>;
}

export interface ParsedParticipantError {
  rowIndex: number;
  message: string;
}

export interface ParsedSheetResult {
  rows: ParsedParticipantRow[];
  errors: ParsedParticipantError[];
}

export function parseParticipantSheet(
  sheet: SheetData,
  mapping: ColumnMapping[],
  preserveUnmapped = false,
): ParsedSheetResult {
  const hasFirstName = mapping.some((m) => m.target === "first_name");
  const hasLastName = mapping.some((m) => m.target === "last_name");

  if (!hasFirstName || !hasLastName) {
    throw new Error('Le colonne "Nome" e "Cognome" sono obbligatorie.');
  }

  type MappedKey = Exclude<ParticipantColumnKey, "ignore">;
  const fieldIndices: Record<MappedKey, number | null> = {
    first_name: null,
    last_name: null,
    email: null,
    phone: null,
    company: null,
    job_title: null,
    dietary_requirements: null,
    accessibility_requirements: null,
  };

  const ignoredMappings: ColumnMapping[] = [];

  for (const m of mapping) {
    if (m.target === "ignore") {
      ignoredMappings.push(m);
    } else {
      fieldIndices[m.target] = m.sourceIndex;
    }
  }

  const rows: ParsedParticipantRow[] = [];
  const errors: ParsedParticipantError[] = [];

  for (let i = 0; i < sheet.rows.length; i++) {
    const rawRow = sheet.rows[i];
    const rowIndex = i + 2;

    const get = (key: MappedKey): string => {
      const idx = fieldIndices[key];
      if (idx === null || idx >= rawRow.length) return "";
      return (rawRow[idx] ?? "").trim();
    };

    const firstName = get("first_name");
    const lastName = get("last_name");

    if (!firstName && !lastName) continue;

    if (!firstName) {
      errors.push({ rowIndex, message: `Riga ${rowIndex}: il campo "Nome" è obbligatorio.` });
      continue;
    }

    if (!lastName) {
      errors.push({ rowIndex, message: `Riga ${rowIndex}: il campo "Cognome" è obbligatorio.` });
      continue;
    }

    let email = get("email");
    if (email) {
      email = email.toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.push({ rowIndex, message: `Riga ${rowIndex}: indirizzo email non valido.` });
        continue;
      }
    }

    const extraFields: Record<string, string> = {};
    if (preserveUnmapped) {
      for (const m of ignoredMappings) {
        const val = (rawRow[m.sourceIndex] ?? "").trim();
        if (val && m.sourceHeader) {
          extraFields[m.sourceHeader] = val;
        }
      }
    }

    rows.push({
      rowIndex,
      first_name: firstName,
      last_name: lastName,
      email,
      phone: get("phone"),
      company: get("company"),
      job_title: get("job_title"),
      dietary_requirements: get("dietary_requirements"),
      accessibility_requirements: get("accessibility_requirements"),
      extraFields,
    });
  }

  return { rows, errors };
}

// ---------------------------------------------------------------------------
// summarizeParticipantImport
// ---------------------------------------------------------------------------

export interface ImportSummary {
  sheet_index: number;
  sheet_name: string;
  headers: string[];
  row_count: number;
  valid_count: number;
  invalid_count: number;
  suggested_mapping: ColumnMapping[];
}

export function summarizeParticipantImport(
  sheet: SheetData,
  mapping: ColumnMapping[],
): ImportSummary {
  const hasFirstName = mapping.some((m) => m.target === "first_name");
  const hasLastName = mapping.some((m) => m.target === "last_name");

  const firstNameIdx = mapping.find((m) => m.target === "first_name")?.sourceIndex ?? -1;
  const lastNameIdx = mapping.find((m) => m.target === "last_name")?.sourceIndex ?? -1;

  let validCount = 0;
  let invalidCount = 0;

  for (const row of sheet.rows) {
    const fn = firstNameIdx >= 0 ? (row[firstNameIdx] ?? "").trim() : "";
    const ln = lastNameIdx >= 0 ? (row[lastNameIdx] ?? "").trim() : "";
    if (hasFirstName && hasLastName && fn && ln) {
      validCount++;
    } else {
      invalidCount++;
    }
  }

  const sanitizedHeaders = sheet.headers.map((h) =>
    h.replace(/[<>"'&]/g, "").slice(0, 100),
  );

  return {
    sheet_index: sheet.index,
    sheet_name: sheet.name,
    headers: sanitizedHeaders,
    row_count: sheet.rows.length,
    valid_count: validCount,
    invalid_count: invalidCount,
    suggested_mapping: mapping,
  };
}
