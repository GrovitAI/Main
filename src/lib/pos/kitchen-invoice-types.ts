import type { KitchenDateRange } from '@/lib/pos/kitchen-analytics-utils';
import type { ReportOption } from '@/lib/pos/kitchen-analytics-types';

export type InvoiceLine = { id: string; item_name: string; unit: string; qty: number; price_paise: number; line_paise: number };
export type InvoiceDelivery = { id: string; entry_date: string; amount_paise: number; lines: InvoiceLine[] };
export type KitchenInvoice = {
  id: string; number: number; party_id: string; party_name: string; kitchen_name: string;
  start_date: string; end_date: string; total_paise: number; covered_paise: number; open_paise: number;
  status: 'paid' | 'to_be_paid' | 'cancelled'; created_at: string; created_by_name: string;
  cancelled_at: string | null; cancel_reason: string | null; deliveries: InvoiceDelivery[];
};
export type InvoiceFilter = KitchenDateRange & { partyId: string | null; page: number; candidates: boolean };
export type InvoiceWorkspace = { rows: KitchenInvoice[]; deliveries: InvoiceDelivery[]; branches: ReportOption[]; total_rows: number };
