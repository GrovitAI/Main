export type OpenOrder = {
  id: string;
  tenant_id: string;
  branch_id: string;
  table_label: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type OpenOrderItem = {
  id: string;
  tenant_id: string;
  branch_id: string;
  open_order_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  notes: string | null;
  created_at: string;
};

export type OpenOrderWithItems = OpenOrder & {
  items: OpenOrderItem[];
};

export type PosOrderItem = OpenOrderItem & {
  product_name: string;
};
