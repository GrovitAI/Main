/**
 * Task 332: the tables of a branch and their QR codes. Pure helpers: the address a code opens, the
 * next table names to add, the QR picture as one drawing path, and the printable sheet of codes.
 */
import qrGenerator from 'qrcode-generator';

export type QrTable = { id: string; label: string; code: string; is_active: boolean };
export type QrSettings = { enabled: boolean; tables: QrTable[] };

/** Where the codes lead when the app is not running in a browser. */
export const QR_DEFAULT_ORIGIN = 'https://www.leleban.grovitai.com';
export const MAX_TABLES = 100;

/** The address in a table's QR code. */
export function tableLink(origin: string, code: string): string {
  return `${origin.replace(/\/+$/, '')}/t/${code}`;
}

/** "Table 4" for a table named 4; a name that is already words stays as it is ("Terrace 2"). */
export function tableTitle(label: string): string {
  return /^\d+$/.test(label.trim()) ? `Table ${label.trim()}` : label.trim();
}

/** The next `count` table names after the highest number in use (1, 2, 3 … when there are none), kept within MAX_TABLES in all. */
export function nextTableLabels(existing: readonly string[], count: number): string[] {
  const room = Math.max(0, MAX_TABLES - existing.length);
  const n = Math.max(0, Math.min(Math.floor(count), room));
  const highest = existing.reduce((max, l) => (/^\d+$/.test(l.trim()) ? Math.max(max, Number(l.trim())) : max), 0);
  return Array.from({ length: n }, (_, i) => String(highest + i + 1));
}

/** The QR picture of `value` as one path of dark squares in a grid of `size` by `size`. */
export function qrSvgPath(value: string): { size: number; d: string } {
  const qr = qrGenerator(0, 'M');
  qr.addData(value);
  qr.make();
  const size = qr.getModuleCount();
  let d = '';
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
    }
  }
  return { size, d };
}

/** One QR code as an inline SVG, with the quiet border a scanner needs. */
export function qrSvg(value: string, pixels: number): string {
  const { size, d } = qrSvgPath(value);
  const edge = size + 8;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${pixels}" height="${pixels}" viewBox="-4 -4 ${edge} ${edge}" shape-rendering="crispEdges"><rect x="-4" y="-4" width="${edge}" height="${edge}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

const escapeHtml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A printable page of table cards, four to an A4 sheet: the badge, the table, its QR code and what to do. */
export function qrSheetHtml(branch: string, tables: readonly { label: string; link: string }[], logo: string): string {
  const cards = tables.map((t) => `<section class="card"><img class="logo" src="${logo}" alt=""><h1>${escapeHtml(tableTitle(t.label))}</h1>${qrSvg(t.link, 300)}<p>Scan to see the menu and order</p><small>${escapeHtml(branch)}</small></section>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(branch)} table QR codes</title><style>
@page{size:A4;margin:10mm}*{box-sizing:border-box}body{margin:0;font-family:'Segoe UI',Arial,sans-serif;color:#0f2744}
.sheet{display:grid;grid-template-columns:1fr 1fr;gap:8mm}
.card{break-inside:avoid;border:1.5px solid #c5d9eb;border-radius:14px;padding:8mm 6mm;text-align:center;height:135mm;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3mm}
.logo{width:20mm;height:20mm;border-radius:5mm}h1{margin:0;font-size:30pt;line-height:1}p{margin:0;font-size:13pt;font-weight:600}small{font-size:10pt;color:#5b6b7c}
svg{width:62mm;height:62mm}
</style></head><body><div class="sheet">${cards}</div></body></html>`;
}
