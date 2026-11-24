/**
 * Task 337: Excel (.xlsx) files. One place that turns sheets of rows into a workbook, so every report
 * and template looks alike: numbers stay numbers (sums and sorting work in Excel), columns are wide
 * enough to read, and the heading row has a filter. The browser downloads the file itself, the same
 * way the CSV exports do; the installed phone app has no way to save a file, so it keeps sharing CSV text.
 */
import type { WorkBook } from 'xlsx';

type XlsxModule = typeof import('xlsx');
/** The spreadsheet library is loaded when first needed, so it stays out of the app's first download. */
let loadXlsx: () => Promise<XlsxModule> = () => import('xlsx');
/** Lets a test supply the library, since Jest cannot run a dynamic import. */
export function setXlsxLoader(loader: () => Promise<XlsxModule>): void {
  loadXlsx = loader;
}
export const getXlsx = (): Promise<XlsxModule> => loadXlsx();

export type SheetCell = string | number | null;

export type SheetSpec = {
  /** Shown on the sheet's tab; changed to what Excel allows (31 letters, none of []:*?/\). */
  name: string;
  rows: readonly (readonly SheetCell[])[];
  /** Column widths, in characters. Worked out from the content when left out. */
  widths?: readonly number[];
  /** An Excel number format for the numbers in a column (counted from 0), such as '#,##0.00'. */
  formats?: Readonly<Record<number, string>>;
  /** The row (counted from 0) holding the column headings, which gets a filter. */
  headerRow?: number;
};

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const MONEY_FORMAT = '#,##0.00';
export const QTY_FORMAT = '#,##0.###';

/** A sheet tab name Excel accepts, different from the ones already used. */
export function sheetTabName(name: string, used: ReadonlySet<string>): string {
  const base = (name.replace(/[[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').trim() || 'Sheet').slice(0, 31);
  const taken = new Set([...used].map((n) => n.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; ; n += 1) {
    const suffix = ` (${n})`;
    const candidate = base.slice(0, 31 - suffix.length) + suffix;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

/** Column widths that fit the longest cell, within 8 to 60 characters. */
export function fitWidths(rows: readonly (readonly SheetCell[])[]): number[] {
  const widths: number[] = [];
  for (const row of rows) {
    row.forEach((cell, c) => {
      const length = cell === null ? 0 : typeof cell === 'number' ? String(cell).length + 2 : Math.max(...String(cell).split('\n').map((line) => line.length));
      widths[c] = Math.max(widths[c] ?? 8, Math.min(60, length + 2));
    });
  }
  return widths;
}

function columnName(index: number): string {
  let n = index;
  let out = '';
  do { out = String.fromCharCode(65 + (n % 26)) + out; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return out;
}

export async function buildWorkbook(sheets: readonly SheetSpec[]): Promise<WorkBook> {
  const XLSX = await loadXlsx();
  const book = XLSX.utils.book_new();
  const used = new Set<string>();
  for (const spec of sheets) {
    const sheet = XLSX.utils.aoa_to_sheet(spec.rows.map((row) => [...row]));
    const columns = Math.max(0, ...spec.rows.map((row) => row.length));
    sheet['!cols'] = (spec.widths ?? fitWidths(spec.rows)).map((wch) => ({ wch }));
    for (const [column, format] of Object.entries(spec.formats ?? {})) {
      spec.rows.forEach((_, r) => {
        const cell = sheet[`${columnName(Number(column))}${r + 1}`];
        if (cell && cell.t === 'n') cell.z = format;
      });
    }
    if (spec.headerRow !== undefined && columns > 0 && spec.rows.length > spec.headerRow + 1) {
      sheet['!autofilter'] = { ref: `A${spec.headerRow + 1}:${columnName(columns - 1)}${spec.rows.length}` };
    }
    const name = sheetTabName(spec.name, used);
    used.add(name);
    XLSX.utils.book_append_sheet(book, sheet, name);
  }
  return book;
}

/** The file's bytes, for tests and for anything that needs them rather than a download. */
export async function workbookBytes(sheets: readonly SheetSpec[]): Promise<Uint8Array> {
  const XLSX = await loadXlsx();
  const out: unknown = XLSX.write(await buildWorkbook(sheets), { type: 'array', bookType: 'xlsx' });
  return out instanceof Uint8Array ? out : new Uint8Array(out as ArrayBuffer);
}

/** Downloads the workbook in the browser. */
export async function downloadWorkbook(filename: string, sheets: readonly SheetSpec[]): Promise<void> {
  const XLSX = await loadXlsx();
  XLSX.writeFile(await buildWorkbook(sheets), filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}
