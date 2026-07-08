import { supabase } from './supabase';
import { getTenantContext } from './tenant-context';
import type { ServiceResult } from './settlement-service';

export type Printer = {
  id: string;
  tenant_id: string;
  branch_id: string;
  name: string;
  type: string;             // e.g. 'epson_thermal'
  connection: string;       // 'network' | 'usb'
  ip_address: string | null;
  port: number;             // default 9100
  paper_width: string;      // '80mm' | '58mm'
  printer_role: string;     // 'bill' | 'kitchen'
  is_default: boolean;
  is_active: boolean;
  created_at?: string;
};

/**
 * Fetches all active or configured printers for the current tenant and branch.
 */
export async function fetchPrinters(): Promise<ServiceResult<Printer[]>> {
  try {
    const { tenant_id, branch_id } = getTenantContext();

    const { data, error } = await supabase
      .from('printers')
      .select('*')
      .eq('tenant_id', tenant_id)
      .eq('branch_id', branch_id)
      .order('name', { ascending: true });

    if (error) {
      return { data: null, error: 'Unable to load printers from database.' };
    }

    return { data: (data ?? []) as Printer[], error: null };
  } catch {
    return { data: null, error: 'Unable to load printers from database.' };
  }
}

/**
 * Saves a new printer configuration or updates an existing one.
 */
export async function savePrinter(
  input: Omit<Printer, 'tenant_id' | 'branch_id' | 'id'> & { id?: string }
): Promise<ServiceResult<Printer>> {
  try {
    const { tenant_id, branch_id } = getTenantContext();

    const payload = {
      tenant_id,
      branch_id,
      name: input.name,
      type: input.type,
      connection: input.connection,
      ip_address: input.ip_address,
      port: input.port,
      paper_width: input.paper_width,
      printer_role: input.printer_role,
      is_default: input.is_default,
      is_active: input.is_active,
    };

    if (input.id) {
      // If setting this one as default, unset other default printers with the same role first
      if (input.is_default) {
        await supabase
          .from('printers')
          .update({ is_default: false })
          .eq('tenant_id', tenant_id)
          .eq('branch_id', branch_id)
          .eq('printer_role', input.printer_role);
      }

      const { data, error } = await supabase
        .from('printers')
        .update(payload)
        .eq('id', input.id)
        .eq('tenant_id', tenant_id)
        .eq('branch_id', branch_id)
        .select('*')
        .single();

      if (error) {
        return { data: null, error: 'Unable to update printer configuration.' };
      }

      return { data: data as Printer, error: null };
    } else {
      // If setting this one as default, unset other default printers with the same role first
      if (input.is_default) {
        await supabase
          .from('printers')
          .update({ is_default: false })
          .eq('tenant_id', tenant_id)
          .eq('branch_id', branch_id)
          .eq('printer_role', input.printer_role);
      }

      const { data, error } = await supabase
        .from('printers')
        .insert(payload)
        .select('*')
        .single();

      if (error) {
        return { data: null, error: 'Unable to save printer configuration.' };
      }

      return { data: data as Printer, error: null };
    }
  } catch {
    return { data: null, error: 'Unable to save printer configuration.' };
  }
}

/**
 * Deletes a printer configuration.
 */
export async function deletePrinter(id: string): Promise<ServiceResult<void>> {
  try {
    const { tenant_id, branch_id } = getTenantContext();

    const { error } = await supabase
      .from('printers')
      .delete()
      .eq('id', id)
      .eq('tenant_id', tenant_id)
      .eq('branch_id', branch_id);

    if (error) {
      return { data: null, error: 'Unable to delete printer.' };
    }

    return { data: undefined, error: null };
  } catch {
    return { data: null, error: 'Unable to delete printer.' };
  }
}

/**
 * Synchronizes discovered PrintNode printers with the database.
 * Inserts new ones as disabled and updates names/hostnames of existing ones.
 */
export async function syncPrintNodePrinters(
  pnPrinters: { id: number; name: string; computer?: { name: string } }[]
): Promise<ServiceResult<void>> {
  try {
    const { tenant_id, branch_id } = getTenantContext();

    // 1. Fetch existing configured printers from DB
    const { data: existing, error } = await supabase
      .from('printers')
      .select('*')
      .eq('tenant_id', tenant_id)
      .eq('branch_id', branch_id);

    if (error) {
      return { data: null, error: 'Failed to fetch existing printers for sync.' };
    }

    const existingPrinters = (existing ?? []) as Printer[];

    // 2. Loop and sync
    for (const p of pnPrinters) {
      const pIdStr = String(p.id);
      const matched = existingPrinters.find(x => x.ip_address === pIdStr);

      if (matched) {
        // Update name and OS printer hostname if changed
        const { error: updateErr } = await supabase
          .from('printers')
          .update({
            name: p.name,
          })
          .eq('id', matched.id)
          .eq('tenant_id', tenant_id)
          .eq('branch_id', branch_id);

        if (updateErr) {
          console.warn('[Printer DB] Sync update failed for printer ID:', p.id, updateErr);
        }
      } else {
        // Insert new printer configuration (disabled by default)
        const { error: insertErr } = await supabase
          .from('printers')
          .insert({
            tenant_id,
            branch_id,
            name: p.name,
            type: 'epson_thermal',
            connection: 'printnode',
            ip_address: pIdStr,
            port: 9100,
            paper_width: '80mm',
            printer_role: 'bill',
            is_default: false,
            is_active: false,
          });

        if (insertErr) {
          console.warn('[Printer DB] Sync insert failed for printer ID:', p.id, insertErr);
        }
      }
    }

    return { data: undefined, error: null };
  } catch (err: any) {
    return { data: null, error: err.message || 'Sync failed.' };
  }
}
