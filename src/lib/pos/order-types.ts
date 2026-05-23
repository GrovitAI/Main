export type OpenOrder = {
  id: string;
  tenant_id: string;
  branch_id: string;
  order_name: string;
  status: string;
  created_by: string | null;
  created_at: string;
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
