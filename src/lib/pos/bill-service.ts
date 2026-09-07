import { computeBillTotals, fromPaise, type BillTotals, type DiscountType } from './money-utils';
import type { PosOrderItem } from './order-types';
import type { ServiceResult } from './settlement-service';
import { supabase } from './supabase';
import { logSupabaseError } from './supabase-debug';
import { getTenantContext } from './tenant-context';

/**
 * Bill persistence. Every amount written here comes from `computeBillTotals`
 * so a provisional (unpaid) bill printed by Save & Print carries exactly the
 * figures `settle_order` will later compute in the database.
 */

export type BillStatus = 'paid' | 'unpaid' | 'cancelled';

export type BillRow = {
  id: string;
  tenant_id: string;
  branch_id: string;
  open_order_id: string | null;
  invoice_number: string | null;
  status: string;
  payment_status: string | null;
  subtotal_paise: number | null;
  tax_paise: number | null;
  discount_paise: number | null;
  grand_total_paise: number | null;
};

export type UpsertBillInput = {
  orderId: string;
  invoiceNumber: string;
  status: BillStatus;
  /** Cart lines; omitted (or empty) for cancellations. */
  items?: PosOrderItem[];
  discountType: DiscountType;
  /** Percent (0–100) for 'percent', rupees for 'fixed'. */
  discountValue: number;
  taxPercentage: number;
  complimentary?: boolean;
};

type BillSettledRow = {
  status: string | null;
  payment_status: string | null;
};

/** Computes the totals a bill write will persist for the given cart. */
export function computeTotalsForBill(input: Omit<UpsertBillInput, 'orderId' | 'invoiceNumber' | 'status'>): BillTotals {
  const lines = (input.items ?? []).map((item) => ({ id: item.id, qty: item.qty, price: item.price ?? 0 }));
  return computeBillTotals(lines, {
    discountType: input.discountType,
    discountValue: input.discountValue,
    taxPercentage: input.taxPercentage,
    complimentary: input.complimentary,
  });
}

/** True when the order's bill has already been settled in the database. */
export async function isBillSettled(orderId: string): Promise<ServiceResult<boolean>> {
  try {
    const { tenant_id, branch_id } = getTenantContext();
    const { data, error } = await supabase
      .from('bills')
      .select('status, payment_status')
      .eq('open_order_id', orderId)
      .eq('tenant_id', tenant_id)
      .eq('branch_id', branch_id)
      .maybeSingle();

    if (error) {
      logSupabaseError('isBillSettled', error);
      return { data: null, error: 'Unable to verify bill status.' };
    }

    const row: BillSettledRow | null = data;
    const settled = !!row && (row.status === 'paid' || row.payment_status === 'paid');
    return { data: settled, error: null };
  } catch {
    return { data: null, error: 'Unable to verify bill status.' };
  }
}

/**
 * Creates or updates the bill for an order and re-syncs its line items.
 * Resolves only after every write has been confirmed by the database.
 */
export async function upsertBill(input: UpsertBillInput): Promise<ServiceResult<BillRow>> {
  try {
    const { tenant_id, branch_id } = getTenantContext();
    const items = input.status === 'cancelled' ? [] : (input.items ?? []);
    const totals = computeTotalsForBill({ ...input, items });
    const nowIso = new Date().toISOString();

    const { data: existingBill, error: fetchErr } = await supabase
      .from('bills')
      .select('id')
      .eq('open_order_id', input.orderId)
      .eq('tenant_id', tenant_id)
      .eq('branch_id', branch_id)
      .maybeSingle();

    if (fetchErr) {
      logSupabaseError('upsertBill.fetch', fetchErr);
      return { data: null, error: 'Unable to check existing bill.' };
    }

    const billPayload = {
      tenant_id,
      branch_id,
      open_order_id: input.orderId,
      invoice_number: input.invoiceNumber,
      subtotal: fromPaise(totals.subtotalPaise),
      tax_amount: fromPaise(totals.taxPaise),
      discount_amount: fromPaise(totals.discountPaise),
      total_amount: fromPaise(totals.grandTotalPaise),
      subtotal_paise: totals.subtotalPaise,
      tax_paise: totals.taxPaise,
      discount_paise: totals.discountPaise,
      grand_total_paise: totals.grandTotalPaise,
      status: input.status,
      payment_status: input.status === 'paid' ? 'paid' : 'unpaid',
      document_status: input.status === 'cancelled' ? 'cancelled' : 'confirmed',
      discount_type: input.discountType,
      discount_value: input.discountValue,
      settled_at: input.status === 'paid' ? nowIso : null,
      updated_at: nowIso,
    };

    let bill: BillRow | null = null;
    const existing: { id: string } | null = existingBill;

    if (existing) {
      const { data: updatedBill, error: updateErr } = await supabase
        .from('bills')
        .update(billPayload)
        .eq('id', existing.id)
        .eq('tenant_id', tenant_id)
        .eq('branch_id', branch_id)
        .select('*')
        .single();

      if (updateErr || !updatedBill) {
        logSupabaseError('upsertBill.update', updateErr);
        return { data: null, error: 'Unable to update bill.' };
      }
      bill = updatedBill as BillRow;
    } else {
      const { data: newBill, error: insertErr } = await supabase
        .from('bills')
        .insert({ ...billPayload, created_at: nowIso })
        .select('*')
        .single();

      if (insertErr) {
        const isDuplicate =
          insertErr.code === '23505' ||
          insertErr.message?.includes('unique_open_order_id') ||
          insertErr.message?.includes('duplicate key');
        if (!isDuplicate) {
          logSupabaseError('upsertBill.insert', insertErr);
          return { data: null, error: 'Unable to create bill.' };
        }

        // A concurrent writer created the bill first: update that row instead.
        const { data: raced, error: racedErr } = await supabase
          .from('bills')
          .update(billPayload)
          .eq('open_order_id', input.orderId)
          .eq('tenant_id', tenant_id)
          .eq('branch_id', branch_id)
          .select('*')
          .single();

        if (racedErr || !raced) {
          logSupabaseError('upsertBill.insertFallback', racedErr ?? insertErr);
          return { data: null, error: 'Unable to create bill.' };
        }
        bill = raced as BillRow;
      } else {
        bill = newBill as BillRow;
      }
    }

    if (items.length > 0) {
      const { error: deleteErr } = await supabase
        .from('bill_items')
        .delete()
        .eq('bill_id', bill.id);

      if (deleteErr) {
        logSupabaseError('upsertBill.deleteItems', deleteErr);
        return { data: null, error: 'Unable to sync bill items.' };
      }

      const discountByLineId = new Map(totals.lines.map((line) => [line.id, line]));
      const billItemsPayload = items.map((item) => {
        const line = discountByLineId.get(item.id);
        return {
          bill_id: bill.id,
          product_id: item.product_id,
          item_name: item.product_name || item.item_name || 'Item',
          qty: item.qty,
          price: item.price ?? 0,
          price_paise: line?.pricePaise ?? 0,
          tax_rate: input.taxPercentage,
          gst_percentage: input.taxPercentage,
          discount_amount_paise: line?.discountPaise ?? 0,
        };
      });

      const { error: itemsErr } = await supabase.from('bill_items').insert(billItemsPayload);
      if (itemsErr) {
        logSupabaseError('upsertBill.insertItems', itemsErr);
        return { data: null, error: 'Unable to sync bill items.' };
      }
    }

    return { data: bill, error: null };
  } catch {
    return { data: null, error: 'Unable to save bill.' };
  }
}
