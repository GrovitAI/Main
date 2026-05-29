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
  os_printer_name: string | null; // Resolved Windows/OS spooler name
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
      os_printer_name: input.os_printer_name,
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
