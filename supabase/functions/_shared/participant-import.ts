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

export function parseParticipantWorkbook(buffer: Uint8Array): Workbook {
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
