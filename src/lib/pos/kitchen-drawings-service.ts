/**
 * Task 282: the owners' drawings at the kitchen. Money goes into an owner's drawings from Cash or
 * Bank, the owner spends only from it, and money can go back. Owners only; the database refuses
 * everyone else and keeps the rows out of the app's direct reach.
 */
import { supabase } from '@/lib/pos/supabase';
import { getTenantContext } from '@/lib/pos/tenant-context';
import { kitchenBranch } from '@/lib/pos/kitchen-service';
import { kitchenToday, validKitchenDate } from '@/lib/pos/kitchen-analytics-utils';
import { describeAccessError } from '@/lib/pos/kitchen-utils';
import type { ServiceResult } from '@/lib/pos/kitchen-types';
import type { MoneyAccount } from '@/lib/pos/kitchen-money-service';

export type DrawingKind = 'in' | 'spend' | 'back';
export type DrawingOwner = { id: string; name: string; left_paise: number; in_paise: number; spent_paise: number };
export type DrawingRow = {
  id: string; owner_id: string; kind: DrawingKind; account: MoneyAccount | null; amount_paise: number;
  category: string | null; note: string | null; draw_date: string; created_by: string; created_at: string;
};
export type DrawingsSummary = { owners: DrawingOwner[]; rows: DrawingRow[]; categories: string[] };
export type DrawingInput = {
  owner_id: string; kind: DrawingKind; amount_paise: number; draw_date: string;
  account?: MoneyAccount | null; category?: string | null; note?: string | null; request_key: string;
};

const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

function scope(): { p_tenant_id: string; p_branch_id: string } {
  return { p_tenant_id: getTenantContext().tenant_id, p_branch_id: kitchenBranch().id };
}

function explain(error: unknown, write: boolean): string {
  const message = record(error) && typeof error.message === 'string' ? error.message : '';
  const code = record(error) ? error.code : undefined;
  if (code === 'PGRST202' || code === '42P01') return 'Drawings are not on this database yet.';
  const access = describeAccessError(message);
  if (access) return access;
  if (message.includes('KITCHEN_FORBIDDEN') || code === '42501') return 'Only the owners can use drawings.';
  if (message.includes('KITCHEN_DRAWINGS_SOURCE_SHORT')) return 'More than there is in that account.';
  if (message.includes('KITCHEN_DRAWINGS_SHORT')) return 'More than is left in these drawings.';
  if (message.includes('KITCHEN_DRAWINGS_OWNER')) return 'That owner is no longer on the team.';
  if (message.includes('KITCHEN_DRAWINGS_INVALID')) return 'Check the amount and the date.';
  return write ? 'Unable to confirm the save. Refresh before trying again.' : 'Unable to load drawings. Please retry.';
}

export function parseDrawings(v: unknown): DrawingsSummary {
  const r = record(v) ? v : {};
  const owners = (Array.isArray(r.owners) ? r.owners : []).filter(record).map((o) => ({
    id: str(o.id), name: str(o.name) || 'Owner', left_paise: num(o.left_paise), in_paise: num(o.in_paise), spent_paise: num(o.spent_paise),
  }));
  const rows = (Array.isArray(r.rows) ? r.rows : []).filter(record).map((d): DrawingRow => ({
    id: str(d.id), owner_id: str(d.owner_id),
    kind: d.kind === 'in' || d.kind === 'back' ? d.kind : 'spend',
    account: d.account === 'cash' || d.account === 'bank' ? d.account : null,
    amount_paise: num(d.amount_paise), category: typeof d.category === 'string' ? d.category : null,
    note: typeof d.note === 'string' ? d.note : null, draw_date: str(d.draw_date), created_by: str(d.created_by), created_at: str(d.created_at),
  }));
  const categories = (Array.isArray(r.categories) ? r.categories : []).filter((c): c is string => typeof c === 'string');
  return { owners, rows, categories };
}

/** The owners and the month's rows; `month` is 'YYYY-MM'. */
export async function fetchDrawings(month: string): Promise<ServiceResult<DrawingsSummary>> {
  try {
    const { data, error } = await supabase.rpc('kitchen_drawings_summary', { ...scope(), p_month: month });
    if (error) return { data: null, error: explain(error, false) };
    return { data: parseDrawings(data), error: null };
  } catch (err) {
    return { data: null, error: explain(err, false) };
  }
}

export async function recordDrawing(input: DrawingInput): Promise<ServiceResult<string>> {
  try {
    if (!validKitchenDate(input.draw_date) || input.draw_date > kitchenToday() || !Number.isSafeInteger(input.amount_paise) || input.amount_paise <= 0) {
      return { data: null, error: 'Enter an amount and a date up to today.' };
    }
    const { p_tenant_id, p_branch_id } = scope();
    const { data, error } = await supabase.rpc('kitchen_drawings_record', { p: {
      tenant_id: p_tenant_id, branch_id: p_branch_id, owner_id: input.owner_id, kind: input.kind, amount_paise: input.amount_paise,
      draw_date: input.draw_date, account: input.kind === 'spend' ? null : input.account ?? null,
      category: input.kind === 'spend' ? input.category?.trim() || null : null, note: input.note?.trim() || null, request_key: input.request_key,
    } });
    if (error || typeof data !== 'string') return { data: null, error: explain(error, true) };
    return { data, error: null };
  } catch (err) {
    return { data: null, error: explain(err, true) };
  }
}

export async function voidDrawing(id: string): Promise<ServiceResult<string>> {
  try {
    const { data, error } = await supabase.rpc('kitchen_drawings_void', { ...scope(), p_id: id });
    if (error || data !== id) return { data: null, error: explain(error, true) };
    return { data, error: null };
  } catch (err) {
    return { data: null, error: explain(err, true) };
  }
}
