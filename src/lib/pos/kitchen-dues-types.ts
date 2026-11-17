/**
 * Tasks 316-318: what is still open with each branch and vendor, cleared oldest first, and the
 * month close. Amounts here are rupees; the database keeps paise.
 */
import type { KitchenPartyKind } from './kitchen-types';

/** A bill that money clears: a send, a pay-later buy or expense, Pending from earlier, or the opening balance. */
export type KitchenDueType = 'sent' | 'bought' | 'spent' | 'carried' | 'opening';

/** One bill and what is still open on it once matches by hand, then the oldest-first rule, are applied. */
export type KitchenDue = {
  party_id: string;
  /** Null for the opening balance, which has no entry. */
  entry_id: string | null;
  type: KitchenDueType;
  /** Null for the opening balance (before the app). */
  entry_date: string | null;
  amount: number;
  open: number;
};

/** How old the open amounts are, as of a day: up to 30 days, 31 to 60, and over 60 (the opening balance counts as over 60). */
export type KitchenAgeing = { upTo30: number; upTo60: number; over60: number };
export type KitchenAgeBucket = keyof KitchenAgeing;

/** What an amount paid now would clear, oldest first, and what would be left over as paid ahead. */
export type KitchenFifoClear = {
  cleared: { due: KitchenDue; take: number; left: number }[];
  ahead: number;
};

export type KitchenMonthCloseTotals = {
  sales: number;
  carriedSales: number;
  purchases: number;
  carriedPurchases: number;
  expenses: number;
  expensesLater: number;
  received: number;
  paidVendors: number;
  cashIn: number;
  cashOut: number;
  bankIn: number;
  bankOut: number;
  movedToBank: number;
  movedToCash: number;
  drawingsCash: number;
  drawingsBank: number;
  hasOpening: boolean;
  openingAsOf: string | null;
  /** Null when the kitchen's opening cash and bank are not set on or before that day. */
  startCash: number | null;
  startBank: number | null;
  endCash: number | null;
  endBank: number | null;
};

export type KitchenMonthCloseParty = {
  party_id: string;
  kind: KitchenPartyKind;
  name: string;
  is_active: boolean;
  atStart: number;
  bills: number;
  paid: number;
  atEnd: number;
  open: number;
  oldestDue: string | null;
  /** The opening balance (from before the app) is still partly open. */
  openingDue: boolean;
};

export type KitchenCarriedRow = {
  id: string;
  entry_date: string;
  party_id: string;
  party: string;
  kind: KitchenPartyKind;
  amount: number;
  note: string | null;
  created_by: string;
};

export type KitchenMonthClose = {
  from: string;
  to: string;
  totals: KitchenMonthCloseTotals;
  parties: KitchenMonthCloseParty[];
  carried: KitchenCarriedRow[];
  /** The pending totals worked out two ways; zero difference means they tie up. */
  check: { pending: number; open: number; difference: number };
};
