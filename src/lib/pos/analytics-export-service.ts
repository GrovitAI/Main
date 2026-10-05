import { supabase } from '@/lib/pos/supabase';
import { getTenantContext } from '@/lib/pos/tenant-context';
import { getBusinessDayBounds } from '@/lib/pos/reporting-utils';
import type { AnalyticsFilters, ServiceResult, TransactionRow } from '@/lib/analytics/analytics-service';

type BillRow = {
  id: string;
  invoice_number: string | null;
  created_at: string;
  subtotal: number | string | null;
  tax_amount: number | string | null;
  discount_amount: number | string | null;
  total_amount: number | string | null;
  status: string | null;
  branches: { name: string } | null;
};
type ItemRow = { bill_id: string; qty: number; item_name: string | null };
const PAGE_SIZE = 1000;
const ITEM_CHUNK_SIZE = 50;
const EXPORT_ERROR = 'Unable to load all transactions. Please retry the export.';

/** CSV-only detail reads. Charts never need these rows. A failed page rejects the whole export. */
export async function fetchAnalyticsTransactions(filters: AnalyticsFilters): Promise<ServiceResult<TransactionRow[]>> {
  try {
    const { tenant_id, branch_id, canViewAllBranches } = getTenantContext();
    // Preserve the existing owner-only all-branches reporting scope.
    const effectiveBranchId = canViewAllBranches ? (filters.branchId ?? null) : branch_id;
    const { startTimestamp, endTimestamp } = getBusinessDayBounds('custom', filters.startDate, filters.endDate);
    const bills: BillRow[] = [];

    for (let page = 0; ; page++) {
      let query = supabase.from('bills')
        .select('id, invoice_number, created_at, subtotal, tax_amount, discount_amount, total_amount, status, branches(name)')
        .eq('tenant_id', tenant_id)
        .or(`and(status.eq.paid,settled_at.gte.${startTimestamp},settled_at.lt.${endTimestamp}),and(status.neq.paid,created_at.gte.${startTimestamp},created_at.lt.${endTimestamp})`)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (effectiveBranchId) query = query.eq('branch_id', effectiveBranchId);
      const { data, error } = await query;
      if (error || !data) return { data: null, error: EXPORT_ERROR };
      bills.push(...(data as unknown as BillRow[]));
      if (data.length < PAGE_SIZE) break;
    }

    const chunks: string[][] = [];
    for (let i = 0; i < bills.length; i += ITEM_CHUNK_SIZE) {
      chunks.push(bills.slice(i, i + ITEM_CHUNK_SIZE).map((bill) => bill.id));
    }
    const results = await Promise.all(chunks.map(async (ids): Promise<ServiceResult<ItemRow[]>> => {
      const items: ItemRow[] = [];
      // bill_items has no tenant/branch columns: enforce scope through its parent bill.
      for (let page = 0; ; page++) {
        let query = supabase.from('bill_items')
          .select('bill_id, qty, item_name, bills!inner(tenant_id, branch_id)')
          .eq('bills.tenant_id', tenant_id)
          .in('bill_id', ids)
          .order('id', { ascending: true })
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
        if (effectiveBranchId) query = query.eq('bills.branch_id', effectiveBranchId);
        const { data, error } = await query;
        if (error || !data) return { data: null, error: EXPORT_ERROR };
        items.push(...(data as unknown as ItemRow[]));
        if (data.length < PAGE_SIZE) break;
      }
      return { data: items, error: null };
    }));
    if (results.some((result) => result.error || result.data === null)) return { data: null, error: EXPORT_ERROR };
    const itemsByBill = new Map<string, string[]>();
    for (const result of results) {
      for (const item of result.data ?? []) {
        const summary = itemsByBill.get(item.bill_id) ?? [];
        summary.push(`${Number(item.qty) || 0}x ${item.item_name || 'Item'}`);
        itemsByBill.set(item.bill_id, summary);
      }
    }
    return {
      data: bills.map((bill) => ({
        id: bill.id,
        invoice_number: bill.invoice_number ?? 'PENDING',
        created_at: bill.created_at,
        branch_name: bill.branches?.name ?? '—',
        items_summary: itemsByBill.get(bill.id)?.join(', ') ?? 'No Items',
        subtotal: Number(bill.subtotal) || 0,
        tax_amount: Number(bill.tax_amount) || 0,
        discount_amount: Number(bill.discount_amount) || 0,
        total_amount: Number(bill.total_amount) || 0,
        status: bill.status ?? 'paid',
      })),
      error: null,
    };
  } catch {
    return { data: null, error: EXPORT_ERROR };
  }
}
