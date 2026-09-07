import type { KotTicket, KotTicketItem, PosOrderItem } from './order-types';
import type { ServiceResult } from './settlement-service';
import { supabase } from './supabase';
import { logSupabaseError } from './supabase-debug';
import { getTenantContext } from './tenant-context';

/**
 * Kitchen Order Ticket service.
 *
 * KOT numbers are owned by the database (`next_kot_number` RPC, one sequence
 * per branch). Callers must obtain the number BEFORE printing and pass the
 * same number to `createKot` so the printed ticket and the stored row agree.
 */

export type KotLineInput = {
  name: string;
  quantity: number;
  notes?: string | null;
};

export type KotCancellationLine = {
  name: string;
  quantity: number;
  notes: string;
};

// ─── Pure helpers ──────────────────────────────────────────────────────────────

/**
 * Sums the quantities already sent to the kitchen, keyed by item name.
 * Cancel tickets carry negative quantities, so they net out automatically.
 */
export function sumSentQuantities(kots: KotTicket[]): Record<string, number> {
  const sent: Record<string, number> = {};
  for (const kot of kots) {
    for (const item of kot.kot_items ?? []) {
      sent[item.item_name] = (sent[item.item_name] ?? 0) + item.qty;
    }
  }
  return sent;
}

/**
 * Diffs what the kitchen has been told against the current cart and returns
 * the lines that must be cancelled (negative quantities).
 */
export function calculateKotCancellations(
  kots: KotTicket[],
  activeOrderItems: PosOrderItem[],
): KotCancellationLine[] {
  const sentQuantities = sumSentQuantities(kots);

  const currentQuantities: Record<string, number> = {};
  for (const item of activeOrderItems) {
    const name = item.product_name || item.item_name;
    currentQuantities[name] = (currentQuantities[name] ?? 0) + item.qty;
  }

  const itemsToCancel: KotCancellationLine[] = [];
  for (const [name, qty] of Object.entries(sentQuantities)) {
    const currQty = currentQuantities[name] ?? 0;
    if (currQty < qty) {
      const diff = qty - currQty;
      const reason = currQty === 0 ? 'Item Removed' : 'Quantity Reduced';
      itemsToCancel.push({ name, quantity: -diff, notes: reason });
    }
  }
  return itemsToCancel;
}

/** Cancellation lines for every item still outstanding in the kitchen. */
export function calculateFullCancellation(kots: KotTicket[]): KotCancellationLine[] {
  const sentQuantities = sumSentQuantities(kots);
  const itemsToCancel: KotCancellationLine[] = [];
  for (const [name, qty] of Object.entries(sentQuantities)) {
    if (qty > 0) {
      itemsToCancel.push({ name, quantity: -qty, notes: 'Order Cancelled' });
    }
  }
  return itemsToCancel;
}

// ─── Database ─────────────────────────────────────────────────────────────────

function parseKotNumber(value: unknown): number | null {
  const num = typeof value === 'string' ? Number(value) : value;
  if (typeof num !== 'number' || !Number.isFinite(num) || num <= 0) {
    return null;
  }
  return Math.trunc(num);
}

/** Reserves the next per-branch KOT number from the database. */
export async function getNextKotNumber(): Promise<ServiceResult<number>> {
  try {
    const { tenant_id, branch_id } = getTenantContext();
    const { data, error } = await supabase.rpc('next_kot_number', {
      p_tenant_id: tenant_id,
      p_branch_id: branch_id,
    });

    if (error) {
      logSupabaseError('getNextKotNumber', error);
      return { data: null, error: 'Unable to reserve a KOT number.' };
    }

    const kotNumber = parseKotNumber(data);
    if (kotNumber === null) {
      logSupabaseError('getNextKotNumber', { message: 'next_kot_number returned an invalid value', code: 'BAD_RPC_RESULT' });
      return { data: null, error: 'Unable to reserve a KOT number.' };
    }

    return { data: kotNumber, error: null };
  } catch {
    return { data: null, error: 'Unable to reserve a KOT number.' };
  }
}

/** Inserts a KOT master row plus its items using a DB-reserved number. */
export async function createKot(
  orderId: string,
  kotNumber: number,
  items: KotLineInput[],
): Promise<ServiceResult<KotTicket>> {
  try {
    const { tenant_id, branch_id } = getTenantContext();

    const { data: kotData, error: kotError } = await supabase
      .from('kots')
      .insert({
        tenant_id,
        branch_id,
        open_order_id: orderId,
        kot_number: kotNumber,
        status: 'pending',
      })
      .select('*')
      .single();

    if (kotError || !kotData) {
      logSupabaseError('createKot.kots', kotError);
      return { data: null, error: 'Unable to save kitchen ticket.' };
    }

    const createdKot = kotData as KotTicket;

    const { data: itemsData, error: itemsError } = await supabase
      .from('kot_items')
      .insert(
        items.map((item) => ({
          kot_id: createdKot.id,
          item_name: item.name,
          qty: item.quantity,
          notes: item.notes ?? null,
        })),
      )
      .select('*');

    if (itemsError) {
      logSupabaseError('createKot.kot_items', itemsError);
      await supabase
        .from('kots')
        .delete()
        .eq('id', createdKot.id)
        .eq('tenant_id', tenant_id)
        .eq('branch_id', branch_id);
      return { data: null, error: 'Unable to save kitchen ticket items.' };
    }

    createdKot.kot_items = (itemsData ?? []) as KotTicketItem[];
    return { data: createdKot, error: null };
  } catch {
    return { data: null, error: 'Unable to save kitchen ticket.' };
  }
}

/** Flags order lines as sent to the kitchen. */
export async function markItemsKotSent(itemIds: string[]): Promise<ServiceResult<null>> {
  try {
    if (itemIds.length === 0) {
      return { data: null, error: null };
    }
    const { error } = await supabase
      .from('open_order_items')
      .update({ kot_sent: true })
      .in('id', itemIds);

    if (error) {
      logSupabaseError('markItemsKotSent', error);
      return { data: null, error: 'Unable to update order items.' };
    }
    return { data: null, error: null };
  } catch {
    return { data: null, error: 'Unable to update order items.' };
  }
}

export type KotBatchInput = {
  orderId: string;
  regular?: {
    kotNumber: number;
    items: KotLineInput[];
    /** open_order_items ids to flag as kot_sent once the ticket is stored. */
    itemIds: string[];
  };
  cancel?: {
    kotNumber: number;
    items: KotCancellationLine[];
  };
};

export type KotBatchResult = {
  regular: KotTicket | null;
  cancel: KotTicket | null;
};

/**
 * Persists a regular ticket and/or a cancel ticket for one order. Each ticket
 * uses the number reserved by the caller. Resolves only after every write
 * has been confirmed by the database.
 */
export async function persistKotBatch(input: KotBatchInput): Promise<ServiceResult<KotBatchResult>> {
  try {
    let regular: KotTicket | null = null;
    let cancel: KotTicket | null = null;

    if (input.regular && input.regular.items.length > 0) {
      const createResult = await createKot(input.orderId, input.regular.kotNumber, input.regular.items);
      if (createResult.error || !createResult.data) {
        return { data: null, error: createResult.error ?? 'Unable to save kitchen ticket.' };
      }
      regular = createResult.data;

      const markResult = await markItemsKotSent(input.regular.itemIds);
      if (markResult.error) {
        return { data: null, error: markResult.error };
      }
    }

    if (input.cancel && input.cancel.items.length > 0) {
      const cancelResult = await createKot(input.orderId, input.cancel.kotNumber, input.cancel.items);
      if (cancelResult.error || !cancelResult.data) {
        return { data: null, error: cancelResult.error ?? 'Unable to save cancel ticket.' };
      }
      cancel = cancelResult.data;
    }

    return { data: { regular, cancel }, error: null };
  } catch {
    return { data: null, error: 'Unable to save kitchen ticket.' };
  }
}
