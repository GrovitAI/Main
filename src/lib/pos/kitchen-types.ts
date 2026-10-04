/**
 * The Central Kitchen's books: items it makes and buys, the branches it sends
 * to and the vendors it buys from, and one entry per thing that happened.
 * Amounts here are rupees; the database keeps paise.
 */
import type { ServiceResult } from './finance-types';

export type { ServiceResult };

export type KitchenUnit = 'kg' | 'L' | 'pcs';
export const KITCHEN_UNITS: readonly KitchenUnit[] = ['kg', 'L', 'pcs'];

export type KitchenPartyKind = 'branch' | 'vendor';
export type KitchenMode = 'cash' | 'upi' | 'bank';
export type KitchenEntryType = 'sent' | 'received' | 'bought' | 'paid' | 'spent' | 'made' | 'count';

export type KitchenItem = {
  id: string;
  name: string;
  unit: KitchenUnit;
  /** What a branch pays per unit; null for a raw material the kitchen only buys. */
  sell_price: number | null;
  stock: number;
  is_active: boolean;
  updated_at: string;
};

export type KitchenItemInput = {
  name: string;
  unit: KitchenUnit;
  sell_price: number | null;
  /** Only read when the item is created. */
  opening_stock?: number;
};

export type KitchenParty = {
  id: string;
  kind: KitchenPartyKind;
  name: string;
  phone: string | null;
  is_active: boolean;
};

export type KitchenPartyInput = {
  kind: KitchenPartyKind;
  name: string;
  phone?: string | null;
};

export type KitchenEntryLine = {
  id: string;
  item_id: string;
  qty: number;
  price: number;
  line_total: number;
};

export type KitchenEntry = {
  id: string;
  type: KitchenEntryType;
  entry_date: string;
  party_id: string | null;
  item_id: string | null;
  qty: number | null;
  from_qty: number | null;
  amount: number;
  /** A buy paid on the spot. Always true for every other type. */
  paid: boolean;
  mode: KitchenMode | null;
  category: string | null;
  note: string | null;
  created_by: string;
  created_at: string;
  voided_at: string | null;
  void_reason: string | null;
  lines: KitchenEntryLine[];
};

export type KitchenPartyBalance = {
  party_id: string;
  kind: KitchenPartyKind;
  name: string;
  phone: string | null;
  is_active: boolean;
  /** Positive: a branch still owes the kitchen, or the kitchen still owes a vendor. */
  balance: number;
  last_entry_date: string | null;
};

/** A pay-later buy or a send that money can still be matched against. */
export type KitchenOpenDocument = {
  entry_id: string;
  party_id: string;
  type: 'bought' | 'sent';
  entry_date: string;
  amount: number;
  covered: number;
  open: number;
};

export type PostLineInput = { item_id: string; qty: number; price: number };
export type CoverInput = { entry_id: string; amount: number };

export type PostEntryInput =
  | { type: 'sent'; party_id: string; entry_date?: string; lines: PostLineInput[]; note?: string | null }
  | { type: 'bought'; party_id: string; entry_date?: string; lines: PostLineInput[]; paid: boolean; mode?: KitchenMode | null; note?: string | null }
  | { type: 'received' | 'paid'; party_id: string; entry_date?: string; amount: number; mode: KitchenMode; note?: string | null; covers?: CoverInput[] }
  | { type: 'spent'; entry_date?: string; amount: number; mode: KitchenMode; category: string; note?: string | null }
  | { type: 'made' | 'count'; item_id: string; entry_date?: string; qty: number; note?: string | null };

export type KitchenEntryFilter = {
  /** Inclusive, 'YYYY-MM-DD'. */
  from?: string;
  to?: string;
  party_id?: string;
  item_id?: string;
  types?: KitchenEntryType[];
  includeVoided?: boolean;
  limit?: number;
};
