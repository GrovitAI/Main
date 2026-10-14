/**
 * Cash is cash only; Bank is UPI and bank (task 208), matching the kitchen's two balances.
 * Profit is sales less the cost of goods sent, per finished good (task 209).
 */
export type KitchenReportKind = 'sales' | 'purchases' | 'cash' | 'bank' | 'profit';
export type ReportOption = { id: string; label: string };
export type KitchenReportFilter = {
  month: string;
  startDate?: string;
  endDate?: string;
  report: KitchenReportKind;
  partyId?: string | null;
  itemId?: string | null;
  category?: string | null;
  includeExpenses?: boolean;
  detail?: boolean;
  page?: number;
};
export type KitchenReportRow = {
  key: string;
  kind: 'sale' | 'category' | 'entry' | 'cash' | 'profit';
  entry_id: string | null;
  date: string | null;
  party_id: string | null;
  party: string;
  item_id: string | null;
  item: string | null;
  unit: string | null;
  quantity: number | null;
  price_paise: number | null;
  amount_paise: number;
  documents: number;
  category: string | null;
  source: string;
  payment: string | null;
  mode: string | null;
  money_in_paise: number;
  money_out_paise: number;
  /** Profit rows: what the quantity sent cost to make; null when the item has no cost set. */
  cost_paise: number | null;
};
export type KitchenReport = {
  summary: {
    sales_paise: number; purchases_paise: number; expenses_paise: number; cash_in_paise: number; cash_out_paise: number;
    /** Cost of the goods sent in the period, for items with a cost. */
    cost_paise: number;
    /** Finished goods sent in the period that have no cost yet, and what branches paid for them. */
    cost_missing_items: number;
    cost_missing_sales_paise: number;
  };
  total_rows: number;
  filtered_paise: number;
  filtered_in_paise: number;
  filtered_out_paise: number;
  rows: KitchenReportRow[];
  options: { branches: ReportOption[]; items: ReportOption[]; vendors: ReportOption[]; categories: ReportOption[] };
};
