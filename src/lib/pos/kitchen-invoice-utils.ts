import { colors } from '@/lib/pos/brand';
import { formatMoney, formatQty } from '@/lib/pos/kitchen-utils';
import { historyDateLabel, historyRecordedDay, historyTimeLabel } from '@/lib/pos/kitchen-history-utils';
import type { KitchenInvoice } from '@/lib/pos/kitchen-invoice-types';

/** The kitchen's own gap-free sequence, shown as five digits: 01000, 01001 ... */
export const invoiceNumber = (invoiceNo: number): string => String(invoiceNo).padStart(5, '0');
export const invoiceStatus = (status: KitchenInvoice['status']): string => status === 'paid' ? 'Paid' : status === 'cancelled' ? 'Cancelled' : 'To be paid';
export const invoiceMoney = (paise: number): string => formatMoney(paise / 100);
/** Calendar dates ('YYYY-MM-DD') as "1 Oct 2026". */
export const invoiceDate = (day: string): string => historyDateLabel(day);
/** Timestamps are stored in UTC; the issue date is the India date, never the UTC prefix. */
export const invoiceIssuedDate = (iso: string): string => { const day = historyRecordedDay(iso); return day ? historyDateLabel(day) : iso.slice(0, 10); };
const escape = (v: string): string => v.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

/** HTML is an exported print document, never rendered as app UI. No remote assets or scripts. */
export function kitchenInvoiceHtml(invoice: KitchenInvoice, checkedAt: Date = new Date()): string {
  const e = escape; const money = (n: number): string => e(invoiceMoney(n));
  const body = invoice.deliveries.flatMap(d => d.lines.map(l => `<tr><td>${e(invoiceDate(d.entry_date))}</td><td>${e(l.item_name)}</td><td class="number">${e(formatQty(l.qty, l.unit))}</td><td class="number">${money(l.price_paise)}</td><td class="number">${money(l.line_paise)}</td></tr>`)).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${e(invoiceNumber(invoice.invoice_no))}</title><style>
    @page{size:A4;margin:16mm}body{font-family:Arial,sans-serif;color:${colors.textPrimary};font-size:12px;line-height:1.5;margin:0;padding:24px;background:${colors.surfaceElevated}}
    h1{font-size:26px;margin:0 0 4px}h2{font-size:18px;margin:0}p{margin:4px 0}header{display:flex;justify-content:space-between;gap:24px;border-bottom:2px solid ${colors.primary};padding-bottom:16px}
    section{margin:18px 0}table{width:100%;border-collapse:collapse}thead{display:table-header-group}th{text-align:left;font-size:11px;color:${colors.textSecondary};background:${colors.surfaceTint}}
    td,th{padding:8px;border-bottom:1px solid ${colors.borderSoft};overflow-wrap:anywhere}tr{break-inside:avoid}.number{text-align:right;font-variant-numeric:tabular-nums}.totals{margin-left:auto;width:260px}.totals p{display:flex;justify-content:space-between;gap:16px}
    footer{border-top:1px solid ${colors.borderSoft};padding-top:12px;color:${colors.textSecondary};font-size:11px}@media print{body{padding:0}}
    </style></head><body><header><div><h2>${e(invoice.kitchen_name)}</h2><p>Branch supply invoice</p></div><div><h1>${e(invoiceNumber(invoice.invoice_no))}</h1><p>${e(invoiceStatus(invoice.status))}</p><p>Issued ${e(invoiceIssuedDate(invoice.created_at))}</p></div></header>
    <section><strong>Bill to ${e(invoice.party_name)}</strong><p>Delivery period: ${e(invoiceDate(invoice.start_date))} to ${e(invoiceDate(invoice.end_date))} (inclusive)</p></section>
    ${invoice.cancelled_at ? `<section><strong>Cancelled</strong><p>${e(invoice.cancel_reason ?? '')}</p></section>` : ''}
    <table><thead><tr><th>Date</th><th>Finished goods</th><th class="number">Quantity</th><th class="number">Rate</th><th class="number">Amount</th></tr></thead><tbody>${body}</tbody></table>
    <section class="totals"><p><strong>Invoice total</strong><strong>${money(invoice.total_paise)}</strong></p><p><span>Payments matched</span><span>${money(invoice.covered_paise)}</span></p><p><strong>Balance to pay</strong><strong>${money(invoice.open_paise)}</strong></p></section>
    <footer><p>Prepared by ${e(invoice.created_by_name)}. Payment status checked ${e(historyTimeLabel(checkedAt.toISOString()))}.</p><p>Selected deliveries only. Unmatched branch receipts are not included. No additional tax has been calculated.</p></footer></body></html>`;
}
