export type OrderStatus =
  | 'draft'
  | 'held'
  | 'unpaid'
  | 'in_kitchen'
  | 'payment_pending'
  | 'paid'
  | 'completed'
  | 'cancelled'
  | 'open'; // Retained for backward compatibility

export type OpenOrder = {
  id: string;
  tenant_id: string;
  branch_id: string;
  order_name: string;
  status: OrderStatus;
  created_by: string | null;
  created_at: string;
  
  // Lifecycle fields
  invoice_number?: string | null;
  token_number?: string | null;
  payment_method?: string | null;
  held_at?: string | null;
  paid_at?: string | null;
  cancelled_at?: string | null;
  completed_at?: string | null;
  notes?: string | null;

  // Numbering readiness fields (Phase 1A.5)
  bill_number?: string | null;  // Finalized sequentially only upon successful settlement
  internal_order_number?: string | null;
};

export type KotTicketItem = {
  id: string;
  kot_id: string;
  item_name: string;
  qty: number;
  notes: string | null;
};

export type KotTicket = {
  id: string;
  tenant_id: string;
  branch_id: string;
  open_order_id: string;
  kot_number: number;
  status: string;
  printed_at: string | null;
  created_at: string;
  kot_items?: KotTicketItem[];
};

export type OpenOrderItem = {
  id: string;
  open_order_id: string;
  product_id: string;
  item_name: string;
  price: number;
  qty: number;
  notes: string | null;
  kot_sent: boolean;
};

export type OpenOrderWithItems = OpenOrder & {
  items: OpenOrderItem[];
};

export type PosOrderItem = OpenOrderItem & {
  product_name: string;
};
