import * as XLSX from 'xlsx';
import { setXlsxLoader, workbookBytes } from '@/lib/pos/xlsx-export';
import {
  COUNT_HEADINGS, COUNT_SHEET_NAME, matchCountLines, parseCounted, readCountRows, stockCountTemplateSheets, type CountItem,
} from '@/lib/pos/stock-count-import-utils';

setXlsxLoader(async () => XLSX);

const items: CountItem[] = [
  { id: 'r1', name: 'Whipping cream', unit: 'L', item_kind: 'raw_material', stock: 12.5, category: 'Dairy' },
  { id: 'r2', name: 'Milk', unit: 'L', item_kind: 'raw_material', stock: 30, category: 'Dairy' },
  { id: 'r3', name: 'Gloves', unit: 'pcs', item_kind: 'raw_material', stock: 200, category: 'Cleaning' },
  { id: 'f1', name: 'Fazea base', unit: 'pcs', item_kind: 'finished_good', stock: 40, category: 'Bases' },
  { id: 'r4', name: 'Custard', unit: 'kg', item_kind: 'raw_material', stock: 5, category: 'Powders' },
  { id: 'f2', name: 'Custard', unit: 'kg', item_kind: 'finished_good', stock: 2, category: 'Sauces' },
];

describe('the template', () => {
  it('lists every item, raw materials first, with Counted empty and a how-to sheet', () => {
    const [count, help] = stockCountTemplateSheets(items);
    expect(count?.name).toBe(COUNT_SHEET_NAME);
    expect(count?.rows[0]).toEqual([...COUNT_HEADINGS]);
    expect(count?.rows).toHaveLength(items.length + 1);
    const names = (count?.rows ?? []).slice(1).map((r) => r[2]);
    expect(names).toEqual(['Gloves', 'Milk', 'Whipping cream', 'Custard', 'Fazea base', 'Custard']);
    expect((count?.rows ?? []).slice(1).every((r) => r[5] === null)).toBe(true);
    expect((count?.rows ?? []).slice(1, 5).map((r) => r[0])).toEqual(['Raw material', 'Raw material', 'Raw material', 'Raw material']);
    expect((count?.rows ?? []).slice(5).map((r) => r[0])).toEqual(['Finished good', 'Finished good']);
    expect(help?.name).toBe('How to fill in');
  });

  it('survives a round trip through a real .xlsx file: fill Counted, read it back, match every item', async () => {
    const sheets = stockCountTemplateSheets(items);
    const book = XLSX.read(await workbookBytes(sheets), { type: 'array' });
    const sheet = book.Sheets[COUNT_SHEET_NAME];
    expect(sheet).toBeDefined();
    if (!sheet) return;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null });
    // The person types a figure in the Counted column (column F) for Milk and Fazea base.
    const milk = rows.findIndex((r) => r[2] === 'Milk');
    const base = rows.findIndex((r) => r[2] === 'Fazea base');
    sheet[`F${milk + 1}`] = { t: 'n', v: 28.25 };
    sheet[`F${base + 1}`] = { t: 'n', v: 36 };
    const filled = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null });
    const read = readCountRows(filled);
    expect(read.error).toBeNull();
    const result = matchCountLines(read.lines, items);
    expect(result.matched.map((m) => [m.itemId, m.qty])).toEqual([['r2', 28.25], ['f1', 36]]);
    // Every other row was left empty, which is not a problem.
    expect(result.problems).toEqual([]);
    expect(result.blank).toBe(items.length - 2);
  });
});

describe('readCountRows', () => {
  it('finds the heading row anywhere in the top rows and reads the usual names for the columns', () => {
    const read = readCountRows([['Stock count for Kolathur'], [], ['Product', 'Qty'], ['Milk', 5], ['Gloves', '120']]);
    expect(read.error).toBeNull();
    expect(read.lines).toEqual([{ row: 4, name: 'Milk', type: null, counted: 5 }, { row: 5, name: 'Gloves', type: null, counted: '120' }]);
  });

  it('refuses a file with no Item and Counted columns, or no rows', () => {
    expect(readCountRows([['Name', 'Price'], ['Milk', 5]]).error).toMatch(/Item column and a Counted column/);
    expect(readCountRows([['Item*', 'Counted*']]).error).toBe('The file has no items to count.');
    expect(readCountRows([]).lines).toEqual([]);
  });

  it('skips rows that are empty in both columns, keeps a figure with no name', () => {
    const read = readCountRows([['Item', 'Counted'], [null, null], ['', ''], [null, 4]]);
    expect(read.lines).toEqual([{ row: 4, name: '', type: null, counted: 4 }]);
  });
});

describe('parseCounted', () => {
  it('reads numbers and text that holds a number', () => {
    expect(parseCounted(12, 'kg')).toEqual({ qty: 12 });
    expect(parseCounted(' 1,250.5 ', 'kg')).toEqual({ qty: 1250.5 });
    expect(parseCounted('0', 'L')).toEqual({ qty: 0 });
    expect(parseCounted(2.34567, 'kg')).toEqual({ qty: 2.346 });
  });
  it('refuses what is not a number, a negative, a fraction of a piece and a silly size', () => {
    expect(parseCounted('twelve', 'kg')).toEqual({ error: 'Not a number' });
    expect(parseCounted('12 kg', 'kg')).toEqual({ error: 'Not a number' });
    expect(parseCounted(true, 'kg')).toEqual({ error: 'Not a number' });
    expect(parseCounted(NaN, 'kg')).toEqual({ error: 'Not a number' });
    expect(parseCounted(-1, 'kg')).toEqual({ error: 'Cannot be below 0' });
    expect(parseCounted('-3', 'kg')).toEqual({ error: 'Cannot be below 0' });
    expect(parseCounted(2.5, 'pcs')).toEqual({ error: 'Whole numbers only for pcs' });
    expect(parseCounted(5_000_000, 'kg')).toEqual({ error: 'Too large' });
  });
});

describe('matchCountLines', () => {
  const line = (row: number, name: string, counted: unknown, type: string | null = null) => ({ row, name, type, counted });

  it('matches by name ignoring case, spacing and a trailing star', () => {
    const result = matchCountLines([line(2, '  whipping   CREAM ', 4), line(3, 'Milk*', '7')], items);
    expect(result.matched.map((m) => [m.itemId, m.qty, m.was])).toEqual([['r1', 4, 12.5], ['r2', 7, 30]]);
    expect(result.problems).toEqual([]);
  });

  it('says why a row cannot be used, with its row number, and still uses the rest', () => {
    const result = matchCountLines([line(2, 'Milk', 5), line(3, 'Mystery powder', 2), line(4, 'Gloves', 2.5), line(5, 'Whipping cream', 'lots'), line(6, '', 3)], items);
    expect(result.matched.map((m) => m.itemId)).toEqual(['r2']);
    expect(result.problems).toEqual([
      { row: 3, name: 'Mystery powder', reason: 'Not in the item list' },
      { row: 4, name: 'Gloves', reason: 'Whole numbers only for pcs' },
      { row: 5, name: 'Whipping cream', reason: 'Not a number' },
      { row: 6, name: '', reason: 'No item name' },
    ]);
  });

  it('needs the Type when two items share a name, and honours it', () => {
    expect(matchCountLines([line(2, 'Custard', 3)], items).problems).toEqual([{ row: 2, name: 'Custard', reason: 'Two items share this name: set the Type' }]);
    const raw = matchCountLines([line(2, 'Custard', 3, 'Raw material')], items);
    expect(raw.matched.map((m) => m.itemId)).toEqual(['r4']);
    const finished = matchCountLines([line(2, 'Custard', 1, 'finished good')], items);
    expect(finished.matched.map((m) => m.itemId)).toEqual(['f2']);
    expect(matchCountLines([line(2, 'Milk', 1, 'Finished good')], items).problems[0]?.reason).toBe('No item of that Type has this name');
  });

  it('counts rows left blank apart from problems, and an item listed twice uses the later figure', () => {
    const result = matchCountLines([line(2, 'Milk', null), line(3, 'Gloves', ''), line(4, 'Milk', 9), line(5, 'Milk', 11)], items);
    expect(result.blank).toBe(2);
    expect(result.matched.map((m) => [m.itemId, m.qty, m.row])).toEqual([['r2', 11, 5]]);
    expect(result.problems).toEqual([{ row: 4, name: 'Milk', reason: 'Listed again on row 5; that figure is used' }]);
  });

  it('turns a figure into the text the form shows', () => {
    expect(matchCountLines([line(2, 'Milk', 28.25)], items).matched[0]?.text).toBe('28.25');
    expect(matchCountLines([line(2, 'Gloves', 0)], items).matched[0]?.text).toBe('0');
  });
});

// The template file handed to the kitchen must keep working with the importer.
describe('the shipped template file', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require('path') as typeof import('path');
  const file = path.resolve(__dirname, '../../../../docs/templates/stock-count-import-template.xlsx');

  it('has the importer\'s headings and every item once, with nothing counted yet', () => {
    const book = XLSX.readFile(file);
    expect(book.SheetNames).toEqual([COUNT_SHEET_NAME, 'How to fill in']);
    const sheet = book.Sheets[COUNT_SHEET_NAME];
    if (!sheet) throw new Error('no Stock count sheet');
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null });
    expect(rows[0]).toEqual([...COUNT_HEADINGS]);
    const read = readCountRows(rows);
    expect(read.error).toBeNull();
    expect(read.lines).toHaveLength(38);
    expect(read.lines.every((l) => l.counted === null)).toBe(true);
    expect(new Set(read.lines.map((l) => `${l.type}|${l.name}`)).size).toBe(38);
  });

  it('matches every row to an item when the items are the same list, and fills in what is counted', () => {
    const book = XLSX.readFile(file);
    const sheet = book.Sheets[COUNT_SHEET_NAME];
    if (!sheet) throw new Error('no Stock count sheet');
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null });
    const catalogue: CountItem[] = rows.slice(1).map((r, n) => ({
      id: `i${n}`, name: String(r[2]), unit: String(r[3]), item_kind: r[0] === 'Raw material' ? 'raw_material' : 'finished_good', stock: 0, category: r[1] === null ? null : String(r[1]),
    }));
    rows[1] = [...(rows[1] ?? [])]; rows[1][5] = 3;
    rows[2] = [...(rows[2] ?? [])]; rows[2][5] = 1.5;
    const result = matchCountLines(readCountRows(rows).lines, catalogue);
    expect(result.problems).toEqual([]);
    expect(result.matched.map((m) => m.qty)).toEqual([3, 1.5]);
    expect(result.blank).toBe(36);
  });
});
