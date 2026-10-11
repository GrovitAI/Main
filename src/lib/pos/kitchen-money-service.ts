import { supabase } from '@/lib/pos/supabase';
import { getTenantContext } from '@/lib/pos/tenant-context';
import { kitchenBranch } from '@/lib/pos/kitchen-service';
import { kitchenToday, validKitchenDate } from '@/lib/pos/kitchen-analytics-utils';
import type { ServiceResult } from '@/lib/pos/kitchen-types';

/** Cash is cash in hand; Bank includes UPI, which settles into the bank account. */
export type MoneyAccount = 'cash' | 'bank';
export type MoneyMove = {
  id: string; move_date: string; from_account: MoneyAccount; to_account: MoneyAccount;
  amount_paise: number; note: string | null; created_by: string; created_at: string;
};
export type MoneySummary = {
  has_opening: boolean; as_of: string | null; opening_cash_paise: number; opening_bank_paise: number; opening_updated_by: string | null;
  cash_in_paise: number; cash_out_paise: number; bank_in_paise: number; bank_out_paise: number;
  moved_to_bank_paise: number; moved_to_cash_paise: number; cash_paise: number; bank_paise: number; moves: MoneyMove[];
};

/** ₹100 crore cap per figure, matching the database checks (10^11 paise). */
export const MONEY_LIMIT_PAISE = 100_000_000_000;

const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const object = (v: unknown): Record<string, unknown> => { if (!record(v)) throw Error('Invalid record'); return v; };
const text = (v: unknown): string => { if (typeof v !== 'string') throw Error('Invalid text'); return v; };
const nullableText = (v: unknown): string | null => v === null || v === undefined ? null : text(v);
const paise = (v: unknown): number => { const n = Number(v); if ((typeof v !== 'number' && (typeof v !== 'string' || !/^-?\d+$/.test(v))) || !Number.isSafeInteger(n)) throw Error('Invalid amount'); return n; };
const account = (v: unknown): MoneyAccount => { if (v !== 'cash' && v !== 'bank') throw Error('Invalid account'); return v; };
const date = (v: unknown): string => { const d = text(v); if (!validKitchenDate(d)) throw Error('Invalid date'); return d; };

function move(v: unknown): MoneyMove {
  const r = object(v); const amount = paise(r.amount_paise);
  if (amount <= 0) throw Error('Invalid transfer');
  return { id: text(r.id), move_date: date(r.move_date), from_account: account(r.from_account), to_account: account(r.to_account),
    amount_paise: amount, note: nullableText(r.note), created_by: text(r.created_by), created_at: text(r.created_at) };
}
export function parseMoneySummary(v: unknown): MoneySummary {
  const r = object(v); const has = r.has_opening === true;
  const moves = Array.isArray(r.moves) ? r.moves.map(move) : [];
  return { has_opening: has, as_of: has ? date(r.as_of) : null, opening_cash_paise: paise(r.opening_cash_paise), opening_bank_paise: paise(r.opening_bank_paise),
    opening_updated_by: nullableText(r.opening_updated_by), cash_in_paise: paise(r.cash_in_paise), cash_out_paise: paise(r.cash_out_paise),
    bank_in_paise: paise(r.bank_in_paise), bank_out_paise: paise(r.bank_out_paise), moved_to_bank_paise: paise(r.moved_to_bank_paise),
    moved_to_cash_paise: paise(r.moved_to_cash_paise), cash_paise: paise(r.cash_paise), bank_paise: paise(r.bank_paise), moves };
}
function scope(): { p_tenant_id: string; p_branch_id: string } {
  return { p_tenant_id: getTenantContext().tenant_id, p_branch_id: kitchenBranch().id };
}
function safeError(error: unknown, write = false): string {
  const r = record(error) ? error : null; const code = r?.code; const message = typeof r?.message === 'string' ? r.message : '';
  if (code === 'PGRST202' || code === '42P01') return 'Cash and bank balances are not on this database yet.';
  if (message.includes('KITCHEN_FORBIDDEN') || code === '42501') return 'This login cannot keep the kitchen’s cash and bank.';
  if (message.includes('KITCHEN_MONEY_CHANGED') || code === '23505') return 'This transfer changed. Refresh before trying again.';
  if (message.includes('KITCHEN_MONEY_INVALID')) return 'Check the amount and the date.';
  return write ? 'Unable to confirm the save. Refresh before trying again.' : 'Unable to load cash and bank. Please retry.';
}

export async function fetchKitchenMoney(): Promise<ServiceResult<MoneySummary>> {
  try {
    const { data, error } = await supabase.rpc('kitchen_money_summary', scope());
    if (error) return { data: null, error: safeError(error) };
    return { data: parseMoneySummary(data), error: null };
  } catch { return { data: null, error: safeError(null) }; }
}

export async function setKitchenMoneyOpening(asOf: string, cashPaise: number, bankPaise: number): Promise<ServiceResult<string>> {
  try {
    if (!validKitchenDate(asOf) || asOf > kitchenToday() || !Number.isSafeInteger(cashPaise) || cashPaise < 0 || cashPaise > MONEY_LIMIT_PAISE
      || !Number.isSafeInteger(bankPaise) || Math.abs(bankPaise) > MONEY_LIMIT_PAISE) return { data: null, error: 'Enter the opening cash, bank and a date up to today.' };
    const { data, error } = await supabase.rpc('kitchen_set_money_opening', { ...scope(), p_as_of: asOf, p_cash_paise: cashPaise, p_bank_paise: bankPaise });
    if (error || typeof data !== 'string') return { data: null, error: safeError(error, true) };
    return { data, error: null };
  } catch { return { data: null, error: safeError(null, true) }; }
}

export async function moveKitchenMoney(moveDate: string, from: MoneyAccount, amountPaise: number, note: string, requestKey: string): Promise<ServiceResult<string>> {
  try {
    const to: MoneyAccount = from === 'cash' ? 'bank' : 'cash';
    if (!validKitchenDate(moveDate) || moveDate > kitchenToday() || !Number.isSafeInteger(amountPaise) || amountPaise <= 0 || amountPaise > MONEY_LIMIT_PAISE
      || note.trim().length > 200 || requestKey.length < 12 || requestKey.length > 80) return { data: null, error: 'Enter an amount and a date up to today.' };
    const { data, error } = await supabase.rpc('kitchen_move_money', { ...scope(), p_move_date: moveDate, p_from: from, p_to: to,
      p_amount_paise: amountPaise, p_note: note.trim() || null, p_request_key: requestKey });
    if (error || typeof data !== 'string') return { data: null, error: safeError(error, true) };
    return { data, error: null };
  } catch { return { data: null, error: safeError(null, true) }; }
}

export async function voidKitchenMoneyMove(id: string): Promise<ServiceResult<string>> {
  try {
    const { data, error } = await supabase.rpc('kitchen_void_money_move', { ...scope(), p_move_id: id });
    if (error || data !== id) return { data: null, error: safeError(error, true) };
    return { data, error: null };
  } catch { return { data: null, error: safeError(null, true) }; }
}
