/**
 * Task 339: the browser's side of counting stock from Excel: making the template file and reading a
 * chosen file. What a file means (matching rows to items, checking figures) is in
 * stock-count-import-utils.ts; this only turns a file into rows and rows into a file.
 */
import { downloadWorkbook, getXlsx } from '@/lib/pos/xlsx-export';
import { COUNT_SHEET_NAME, readCountRows, stockCountTemplateSheets, type CountItem, type CountLine } from '@/lib/pos/stock-count-import-utils';

export const COUNT_TEMPLATE_FILE = 'stock-count-template.xlsx';

/** Downloads the template: every active item, Counted empty, and a sheet on how to fill it in. */
export async function downloadCountTemplate(items: readonly CountItem[]): Promise<void> {
  await downloadWorkbook(COUNT_TEMPLATE_FILE, stockCountTemplateSheets(items));
}

/**
 * The lines of a chosen .xlsx or .csv file. The sheet named Stock count is read; a file without one is
 * read from its first sheet that has an Item and a Counted column.
 */
export async function readCountFile(bytes: ArrayBuffer): Promise<{ lines: CountLine[]; error: string | null }> {
  const XLSX = await getXlsx();
  const book = XLSX.read(new Uint8Array(bytes), { type: 'array' });
  const names = [...book.SheetNames].sort((a, b) => (a === COUNT_SHEET_NAME ? -1 : b === COUNT_SHEET_NAME ? 1 : 0));
  let last: { lines: CountLine[]; error: string | null } = { lines: [], error: 'The file has no sheets.' };
  for (const name of names) {
    const sheet = book.Sheets[name];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true });
    last = readCountRows(rows);
    if (!last.error) return last;
  }
  return last;
}
