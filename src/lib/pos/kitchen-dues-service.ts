/**
 * Tasks 316-318: what is still open with each branch and vendor (kitchen_party_dues) and the month
 * close (kitchen_month_close). Both are reads scoped to the kitchen's tenant and branch; every
 * function is try/catch, typed, and returns a sentence rather than a raw database error.
 */
import { supabase } from '@/lib/pos/supabase';
import { getTenantContext } from '@/lib/pos/tenant-context';
import { kitchenBranch } from '@/lib/pos/kitchen-service';
import { OFFLINE_LOAD_TEXT, describeAccessError, isOfflineError } from '@/lib/pos/kitchen-utils';
import type { ServiceResult } from '@/lib/pos/kitchen-types';
import type { KitchenCarriedRow, KitchenDue, KitchenDueType, KitchenMonthClose, KitchenMonthCloseParty } from '@/lib/pos/kitchen-dues-types';

const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const object = (v: unknown): Record<string, unknown> => { if (!record(v)) throw Error('Invalid record'); return v; };
const text = (v: unknown): string => { if (typeof v !== 'string') throw Error('Invalid text'); return v; };
const nullableText = (v: unknown): string | null => (v === null || v === undefined ? null : text(v));
const paise = (v: unknown): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^-?\d+$/.test(v) ? Number(v) : NaN;
  if (!Number.isSafeInteger(n)) throw Error('Invalid amount');
  return n;
};
const rupees = (v: unknown): number => paise(v) / 100;
const nullableRupees = (v: unknown): number | null => (v === null || v === undefined ? null : rupees(v));
const DUE_TYPES: readonly KitchenDueType[] = ['sent', 'bought', 'spent', 'carried', 'opening'];
const dueType = (v: unknown): KitchenDueType => { const t = DUE_TYPES.find((x) => x === v); if (!t) throw Error('Invalid due type'); return t; };
const kind = (v: unknown): 'branch' | 'vendor' => { if (v !== 'branch' && v !== 'vendor') throw Error('Invalid kind'); return v; };

/** A refusal, an older database or a lost connection in words; the raw error stays in the console. */
function explain(error: { code?: string; message?: string } | null, fallback: string): string {
  const message = error?.message ?? '';
  console.error('[kitchen-dues-service]', error?.code ?? 'UNKNOWN', message);
  if (error?.code === 'PGRST202' || error?.code === '42883') return 'This needs the kitchen’s latest database update.';
  if (isOfflineError(message)) return OFFLINE_LOAD_TEXT;
  return describeAccessError(message) ?? fallback;
}

export function parseKitchenDues(value: unknown): KitchenDue[] {
  if (!Array.isArray(value)) throw Error('Invalid dues');
  return value.map((raw) => {
    const row = object(raw);
    return {
      party_id: text(row.party_id),
      entry_id: nullableText(row.entry_id),
      type: dueType(row.type),
      entry_date: nullableText(row.entry_date),
      amount: rupees(row.amount_paise),
      open: rupees(row.open_paise),
    };
  });
}

/**
 * Every bill of one branch or vendor (or of all of them) with what is still open on it, as of a day
 * (today when left out). `openOnly` asks the database for the bills with something open only.
 */
export async function fetchKitchenDues(partyId: string | null, asOf: string | null = null, openOnly = false): Promise<ServiceResult<KitchenDue[]>> {
  try {
    const { tenant_id } = getTenantContext();
    const request = supabase.rpc('kitchen_party_dues', {
      p_tenant_id: tenant_id, p_branch_id: kitchenBranch().id, p_party_id: partyId, p_as_of: asOf,
    });
    const { data, error } = await (openOnly ? request.gt('open_paise', 0) : request);
    if (error) return { data: null, error: explain(error, 'Unable to load what is still open.') };
    return { data: parseKitchenDues(data), error: null };
  } catch (err) {
    console.error('[kitchen-dues-service]', err);
    return { data: null, error: 'Unable to load what is still open.' };
  }
}

export function parseKitchenMonthClose(value: unknown): KitchenMonthClose {
  const root = object(value);
  const t = object(root.totals);
  const check = object(root.check);
  if (!Array.isArray(root.parties) || !Array.isArray(root.carried)) throw Error('Invalid month close');
  return {
    from: text(root.from),
    to: text(root.to),
    totals: {
      sales: rupees(t.sales_paise), carriedSales: rupees(t.carried_sales_paise),
      purchases: rupees(t.purchases_paise), carriedPurchases: rupees(t.carried_purchases_paise),
      expenses: rupees(t.expenses_paise), expensesLater: rupees(t.expenses_later_paise),
      received: rupees(t.received_paise), paidVendors: rupees(t.paid_vendors_paise),
      cashIn: rupees(t.cash_in_paise), cashOut: rupees(t.cash_out_paise), bankIn: rupees(t.bank_in_paise), bankOut: rupees(t.bank_out_paise),
      movedToBank: rupees(t.moved_to_bank_paise), movedToCash: rupees(t.moved_to_cash_paise),
      drawingsCash: rupees(t.drawings_cash_paise), drawingsBank: rupees(t.drawings_bank_paise),
      hasOpening: t.has_opening === true, openingAsOf: nullableText(t.opening_as_of),
      startCash: nullableRupees(t.start_cash_paise), startBank: nullableRupees(t.start_bank_paise),
      endCash: nullableRupees(t.end_cash_paise), endBank: nullableRupees(t.end_bank_paise),
    },
    parties: root.parties.map((raw): KitchenMonthCloseParty => {
      const p = object(raw);
      return {
        party_id: text(p.party_id), kind: kind(p.kind), name: text(p.name), is_active: p.is_active !== false,
        atStart: rupees(p.at_start_paise), bills: rupees(p.bills_paise), paid: rupees(p.paid_paise), atEnd: rupees(p.at_end_paise),
        open: rupees(p.open_paise), oldestDue: nullableText(p.oldest_due), openingDue: p.opening_due === true,
      };
    }),
    carried: root.carried.map((raw): KitchenCarriedRow => {
      const c = object(raw);
      return {
        id: text(c.id), entry_date: text(c.entry_date), party_id: text(c.party_id), party: nullableText(c.party) ?? 'A removed name',
        kind: kind(c.kind), amount: rupees(c.amount_paise), note: nullableText(c.note), created_by: nullableText(c.created_by) ?? 'Staff',
      };
    }),
    check: { pending: rupees(check.pending_paise), open: rupees(check.open_paise), difference: rupees(check.difference_paise) },
  };
}

/** A month's (or any range's) close: figures, cash and bank at each end, each branch's and vendor's pending. */
export async function fetchKitchenMonthClose(from: string, to: string, signal?: AbortSignal): Promise<ServiceResult<KitchenMonthClose>> {
  try {
    const { tenant_id } = getTenantContext();
    const request = supabase.rpc('kitchen_month_close', { p_tenant_id: tenant_id, p_branch_id: kitchenBranch().id, p_from: from, p_to: to });
    const { data, error } = await (signal ? request.abortSignal(signal) : request);
    if (error) return { data: null, error: explain(error, 'Unable to load the month close. Please retry.') };
    return { data: parseKitchenMonthClose(data), error: null };
  } catch (err) {
    console.error('[kitchen-dues-service]', err);
    return { data: null, error: 'Unable to load the month close. Please retry.' };
  }
}
