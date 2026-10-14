import { supabase } from '@/lib/pos/supabase';
import { getTenantContext } from '@/lib/pos/tenant-context';
import { kitchenBranch } from '@/lib/pos/kitchen-service';
import { kitchenReportRange } from '@/lib/pos/kitchen-analytics-utils';
import type { KitchenCategory, ServiceResult } from '@/lib/pos/kitchen-types';
import type { KitchenReport, KitchenReportFilter, KitchenReportRow, ReportOption } from '@/lib/pos/kitchen-analytics-types';

export const KITCHEN_REPORT_PAGE_SIZE = 50;
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const nullable = (value: unknown): string | null => typeof value === 'string' ? value : null;
const numeric = (value: unknown): number => {
  const parsed = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(parsed) || Math.abs(parsed) > Number.MAX_SAFE_INTEGER) throw new Error('Invalid report number');
  return parsed;
};
/** Fields added after a report version (task 209): absent from an older database means zero. */
const optionalNumeric = (value: unknown): number => value === undefined || value === null ? 0 : numeric(value);
const options = (value: unknown): ReportOption[] => {
  if (!Array.isArray(value)) throw new Error('Invalid report options');
  return value.map((row: unknown) => {
    if (!record(row) || typeof row.id !== 'string' || typeof row.label !== 'string') throw new Error('Invalid report option');
    return { id: row.id, label: row.label };
  });
};

export function parseKitchenReport(value: unknown): KitchenReport {
  if (!record(value) || !record(value.summary) || !record(value.options) || !Array.isArray(value.rows)) throw new Error('Invalid report');
  const summary = value.summary;
  const rows = value.rows.map((raw: unknown): KitchenReportRow => {
    if (!record(raw) || typeof raw.key !== 'string' || !['sale', 'category', 'entry', 'cash', 'profit'].includes(String(raw.kind))) throw new Error('Invalid report row');
    return {
      key: raw.key, kind: raw.kind as KitchenReportRow['kind'], entry_id: nullable(raw.entry_id), date: nullable(raw.date),
      party_id: nullable(raw.party_id), party: String(raw.party ?? ''), item_id: nullable(raw.item_id), item: nullable(raw.item),
      unit: nullable(raw.unit), quantity: raw.quantity === null ? null : numeric(raw.quantity),
      price_paise: raw.price_paise === null ? null : numeric(raw.price_paise), amount_paise: numeric(raw.amount_paise),
      documents: numeric(raw.documents), category: nullable(raw.category), source: String(raw.source ?? ''),
      payment: nullable(raw.payment), mode: nullable(raw.mode), money_in_paise: numeric(raw.money_in_paise), money_out_paise: numeric(raw.money_out_paise),
      cost_paise: raw.cost_paise === undefined || raw.cost_paise === null ? null : numeric(raw.cost_paise),
    };
  });
  return {
    summary: { sales_paise: numeric(summary.sales_paise), purchases_paise: numeric(summary.purchases_paise),
      expenses_paise: numeric(summary.expenses_paise), cash_in_paise: numeric(summary.cash_in_paise), cash_out_paise: numeric(summary.cash_out_paise),
      cost_paise: optionalNumeric(summary.cost_paise), cost_missing_items: optionalNumeric(summary.cost_missing_items), cost_missing_sales_paise: optionalNumeric(summary.cost_missing_sales_paise) },
    total_rows: numeric(value.total_rows), filtered_paise: numeric(value.filtered_paise),
    filtered_in_paise: numeric(value.filtered_in_paise), filtered_out_paise: numeric(value.filtered_out_paise), rows,
    options: { branches: options(value.options.branches), items: options(value.options.items),
      vendors: options(value.options.vendors), categories: options(value.options.categories) },
  };
}

/** One consistent DB snapshot per report/export; never infer totals from the recent-entry store. */
export async function fetchKitchenReport(filter: KitchenReportFilter, signal?: AbortSignal, exporting = false): Promise<ServiceResult<KitchenReport>> {
  try {
    if (!Number.isSafeInteger(filter.page ?? 0) || (filter.page ?? 0) < 0) {
      return { data: null, error: 'Choose a valid report page.' };
    }
    let range;
    try { range = kitchenReportRange(filter); } catch { return { data: null, error: 'Choose a valid start and end date.' }; }
    const { tenant_id } = getTenantContext();
    const branch_id = kitchenBranch().id;
    const request = supabase.rpc('kitchen_range_report', {
      p_tenant_id: tenant_id, p_branch_id: branch_id, p_start_date: range.startDate, p_end_date: range.endDate, p_report: filter.report,
      p_party_id: filter.partyId ?? null, p_item_id: filter.itemId ?? null, p_category: filter.category ?? null,
      p_include_expenses: filter.includeExpenses ?? false, p_detail: filter.detail ?? false,
      p_offset: (filter.page ?? 0) * KITCHEN_REPORT_PAGE_SIZE, p_limit: KITCHEN_REPORT_PAGE_SIZE, p_export: exporting,
    });
    const { data, error } = await (signal ? request.abortSignal(signal) : request);
    if (error) {
      return { data: null, error: error.message.includes('KITCHEN_EXPORT_TOO_LARGE')
        ? 'This export has over 10,000 rows. Narrow the filters and try again.'
        : 'Unable to load the kitchen report. Please retry.' };
    }
    return { data: parseKitchenReport(data), error: null };
  } catch {
    return { data: null, error: 'Unable to load the kitchen report. Please retry.' };
  }
}

export async function fetchKitchenPurchaseCategories(includeInactive = false): Promise<ServiceResult<KitchenCategory[]>> {
  try {
    const { tenant_id } = getTenantContext();
    const branch_id = kitchenBranch().id;
    let query = supabase.from('kitchen_purchase_categories').select('id,name,is_active').eq('tenant_id', tenant_id).eq('branch_id', branch_id).order('name');
    if (!includeInactive) query = query.eq('is_active', true);
    const { data, error } = await query;
    if (error) return { data: null, error: 'Unable to load purchase categories. Please retry.' };
    return { data: (data ?? []).filter(record).map(row => ({ id: String(row.id), name: String(row.name), is_active: row.is_active === true, sort_order: 0 })), error: null };
  } catch {
    return { data: null, error: 'Unable to load purchase categories. Please retry.' };
  }
}

export async function saveKitchenPurchaseCategory(name: string, id?: string, isActive = true): Promise<ServiceResult<KitchenCategory>> {
  try {
    const clean = name.trim();
    if (!clean || clean.length > 80) return { data: null, error: 'Use a category name between 1 and 80 characters.' };
    const { tenant_id } = getTenantContext();
    const branch_id = kitchenBranch().id;
    const fields = { name: clean, is_active: isActive };
    const query = id
      ? supabase.from('kitchen_purchase_categories').update(fields).eq('id', id).eq('tenant_id', tenant_id).eq('branch_id', branch_id)
      : supabase.from('kitchen_purchase_categories').insert({ ...fields, tenant_id, branch_id });
    const { data, error } = await query.select('id,name,is_active').single();
    if (error || !record(data)) return { data: null, error: error?.code === '23505' ? 'That category already exists.' : 'Unable to save the category. Please retry.' };
    return { data: { id: String(data.id), name: String(data.name), is_active: data.is_active === true, sort_order: 0 }, error: null };
  } catch {
    return { data: null, error: 'Unable to save the category. Please retry.' };
  }
}
