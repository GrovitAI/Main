/**
 * Task 339: counting stock from an Excel file. The template lists every active item with its unit and the
 * stock the system has, and a Counted column to fill. An import reads that sheet, matches each row to an
 * item by name (and Type when two items share a name), checks each figure, and hands back the quantities
 * for the Count stock screen to show. Nothing is saved from here: the person looks the figures over on the
 * screen and saves them there, under the day lock and permissions that always apply.
 *
 * Pure, with no app imports at run time, so a template can also be made outside the app.
 */

export type CountItemKind = 'raw_material' | 'finished_good';

/** What the import needs to know about an item. */
export type CountItem = { id: string; name: string; unit: string; item_kind: CountItemKind; stock: number; category: string | null };

type Cell = string | number | null;
export type CountSheet = {
  name: string;
  rows: readonly (readonly Cell[])[];
  widths?: readonly number[];
  formats?: Readonly<Record<number, string>>;
  headerRow?: number;
};

export const COUNT_SHEET_NAME = 'Stock count';
export const KIND_LABEL: Record<CountItemKind, string> = { raw_material: 'Raw material', finished_good: 'Finished good' };
export const COUNT_HEADINGS = ['Type', 'Category', 'Item*', 'Unit', 'In stock now', 'Counted*'] as const;

const byKindCategoryName = (a: CountItem, b: CountItem): number =>
  (a.item_kind === b.item_kind ? 0 : a.item_kind === 'raw_material' ? -1 : 1)
  || (a.category ?? '~').localeCompare(b.category ?? '~')
  || a.name.localeCompare(b.name);

/** The template: every item with Counted left empty, and a sheet that says how to fill it in. */
export function stockCountTemplateSheets(items: readonly CountItem[]): CountSheet[] {
  const sorted = [...items].sort(byKindCategoryName);
  const rows: Cell[][] = [
    [...COUNT_HEADINGS],
    ...sorted.map((i): Cell[] => [KIND_LABEL[i.item_kind], i.category, i.name, i.unit, i.stock, null]),
  ];
  const help: Cell[][] = [
    ['How to fill in the stock count'],
    [null],
    ['1', 'Type the stock you counted in the Counted column, in the unit shown (kg, L, pcs).'],
    ['2', 'Leave Counted empty for an item you did not count: it is left alone.'],
    ['3', 'Use plain numbers: 12, 2.5 or 0. Items counted in pcs take whole numbers only. Up to 3 decimals for kg and L.'],
    ['4', 'Do not change the Item names. They are how each row is matched. Rows can be in any order.'],
    ['5', 'Type, Category, Unit and In stock now are for your reference and are ignored on import. Type only matters if two items share a name.'],
    ['6', 'In the app, open Count stock, choose the day, then Import from Excel. The figures fill in on the screen for you to check; nothing is saved until you press Save.'],
    ['7', 'A count is the stock at the end of that day. Counting an earlier day needs a login that may enter earlier dates.'],
  ];
  return [
    { name: COUNT_SHEET_NAME, rows, headerRow: 0, widths: [16, 24, 36, 8, 14, 14], formats: { 4: '#,##0.###', 5: '#,##0.###' } },
    { name: 'How to fill in', rows: help, widths: [6, 110] },
  ];
}

const norm = (s: string): string => s.toLowerCase().replace(/\*/g, '').replace(/\s+/g, ' ').trim();

export type CountLine = { row: number; name: string; type: string | null; counted: unknown };

function column(heading: readonly unknown[], test: (h: string) => boolean): number {
  return heading.findIndex((h) => typeof h === 'string' && test(norm(h)));
}

/**
 * The lines of the sheet. The heading row is the first in the top 20 rows that names an item column and a
 * counted column ("Item*", "Item name", "Product"; "Counted*", "Count", "Quantity", "Qty"); everything below it is a line.
 * `row` is the line's row number in the sheet, as the person sees it.
 */
export function readCountRows(rows: readonly (readonly unknown[])[]): { lines: CountLine[]; error: string | null } {
  for (let r = 0; r < Math.min(rows.length, 20); r += 1) {
    const heading = rows[r] ?? [];
    const item = column(heading, (h) => h === 'item' || h === 'item name' || h === 'name' || h === 'product' || h === 'product name');
    const counted = column(heading, (h) => h === 'counted' || h === 'count' || h === 'counted qty' || h === 'counted quantity' || h === 'quantity' || h === 'qty' || h === 'new stock');
    if (item < 0 || counted < 0) continue;
    const type = column(heading, (h) => h === 'type' || h === 'kind');
    const lines: CountLine[] = [];
    for (let i = r + 1; i < rows.length; i += 1) {
      const row = rows[i] ?? [];
      const name = row[item];
      const text = typeof name === 'string' ? name.trim() : typeof name === 'number' ? String(name) : '';
      const kind = type >= 0 && typeof row[type] === 'string' ? (row[type] as string).trim() : null;
      const value = row[counted];
      const emptyCounted = value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
      if (!text && emptyCounted) continue;
      lines.push({ row: i + 1, name: text, type: kind, counted: value ?? null });
    }
    return { lines, error: lines.length === 0 ? 'The file has no items to count.' : null };
  }
  return { lines: [], error: 'The file does not look like the stock count template: it needs an Item column and a Counted column.' };
}

export type CountMatch = { itemId: string; name: string; unit: string; kind: CountItemKind; qty: number; text: string; was: number; row: number };
export type CountProblem = { row: number; name: string; reason: string };
export type CountImport = { matched: CountMatch[]; problems: CountProblem[]; blank: number };

function kindOf(type: string | null): CountItemKind | null {
  if (!type) return null;
  const t = norm(type);
  if (t.startsWith('raw')) return 'raw_material';
  if (t.startsWith('finish') || t.startsWith('goods') || t === 'fg') return 'finished_good';
  return null;
}

/** A counted figure as a number, or why it is not one. Text such as "1,250.5" and " 12 " is read; anything else is refused. */
export function parseCounted(value: unknown, unit: string): { qty: number } | { error: string } {
  let n: number;
  if (typeof value === 'number') n = value;
  else if (typeof value === 'string') {
    const cleaned = value.replace(/[\s,]/g, '');
    if (!/^\d+(\.\d+)?$/.test(cleaned) && !/^-\d+(\.\d+)?$/.test(cleaned)) return { error: 'Not a number' };
    n = Number(cleaned);
  } else return { error: 'Not a number' };
  if (!Number.isFinite(n)) return { error: 'Not a number' };
  if (n < 0) return { error: 'Cannot be below 0' };
  if (unit === 'pcs') return Number.isInteger(n) ? { qty: n } : { error: 'Whole numbers only for pcs' };
  if (n > 1_000_000) return { error: 'Too large' };
  return { qty: Math.round(n * 1000) / 1000 };
}

/** Matches the sheet's lines to items. A row left blank is not a problem; it is simply not counted. */
export function matchCountLines(lines: readonly CountLine[], items: readonly CountItem[]): CountImport {
  const byName = new Map<string, CountItem[]>();
  for (const item of items) {
    const key = norm(item.name);
    byName.set(key, [...(byName.get(key) ?? []), item]);
  }
  const matched = new Map<string, CountMatch>();
  const problems: CountProblem[] = [];
  let blank = 0;
  for (const line of lines) {
    const empty = line.counted === null || line.counted === undefined || (typeof line.counted === 'string' && line.counted.trim() === '');
    if (!line.name) { problems.push({ row: line.row, name: '', reason: 'No item name' }); continue; }
    const found = byName.get(norm(line.name)) ?? [];
    const kind = kindOf(line.type);
    const candidates = kind ? found.filter((i) => i.item_kind === kind) : found;
    if (candidates.length === 0) { problems.push({ row: line.row, name: line.name, reason: found.length > 0 ? 'No item of that Type has this name' : 'Not in the item list' }); continue; }
    if (candidates.length > 1) { problems.push({ row: line.row, name: line.name, reason: 'Two items share this name: set the Type' }); continue; }
    if (empty) { blank += 1; continue; }
    const item = candidates[0];
    if (!item) continue;
    const parsed = parseCounted(line.counted, item.unit);
    if ('error' in parsed) { problems.push({ row: line.row, name: line.name, reason: parsed.error }); continue; }
    const before = matched.get(item.id);
    if (before) problems.push({ row: before.row, name: before.name, reason: `Listed again on row ${line.row}; that figure is used` });
    matched.set(item.id, { itemId: item.id, name: item.name, unit: item.unit, kind: item.item_kind, qty: parsed.qty, text: String(parsed.qty), was: item.stock, row: line.row });
  }
  return { matched: [...matched.values()].sort((a, b) => a.row - b.row), problems: problems.sort((a, b) => a.row - b.row), blank };
}
