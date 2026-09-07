# BUSINESS_RULES.md — Grovit AI POS Core Operating Rules

> **System Name**: Grovit AI POS (Le Laban Multi-Tenant Restaurant POS Platform)  
> **Last Updated**: 2026-09-07  

---

## 1. POS Ordering & Cart Operations

- **Order Tab Creation**: An order cart starts in state `draft` or `open`.
- **Incremental KOT Tickets**: Only line items added since the last KOT release (`kot_sent: false`) generate a new Kitchen Order Ticket. Previously printed items remain untouched.
- **Order Cancellation**:
  - Unsaved draft carts can be reset immediately by the cashier.
  - Saved kitchen/unpaid orders require **`CANCEL_BILL` Manager Approval** before transitioning to status `cancelled`.

---

## 2. Customer Invoicing & Provisional Bills

- **Single Bill Rule**: An `open_order` can produce **exactly one `bill`**.
- **Provisional Receipts**: Provisional receipts (`saveAndPrint`) show total bill details and assign an invoice number while status remains `unpaid`.
- **Invoice Number Allocation (DB-owned since task 21)**: numbers are issued by PostgreSQL from a per-(tenant, branch) counter (`branch_counters`) via `assign_order_numbers()` / `settle_order()`. Format: `<branches.invoice_prefix or INV>-<4+ digits>`. A number is assigned once, persisted on `open_orders.invoice_number`, and never regenerated. A partial UNIQUE index guarantees no duplicates for bills created from 2026-09-07. Terminals never keep local counters. "Order #N" names and KOT numbers use the same mechanism.

---

## 3. Financial Settlements & Payments

- **Atomic Settlement**: `settle_order()` (PostgreSQL) locks the order row and performs bill upsert, bill_items snapshot, settlement insert, consumption-batch insert and order status update in ONE transaction. A second settle attempt on a paid order returns the existing bill (no duplicate settlements). One settlement per bill is enforced by a unique index.
- **DB Confirmation First**: Cart state is cleared **only after database settlement confirmation**. UI never clears optimistically on checkout or cancellation.
- **Integer-Paise Math**: All money is computed in integer paise (half-up rounding) and stored alongside rupee views (`subtotal_paise`, `tax_paise`, `discount_paise`, `grand_total_paise`). The discount is allocated per line with the largest-remainder method so line discounts always sum to the bill discount. The client mirrors the same arithmetic in `src/lib/pos/money-utils.ts`; tax comes from `pos_settings.tax_percentage` for both provisional and settled bills.
- **Business Day**: a business day runs from 02:30 IST to 02:30 IST the next day (`reporting-utils.ts`), evaluated in Asia/Kolkata regardless of the device timezone, so every transaction belongs to exactly one day.
- **Complimentary Settlement**: Settle total to zero, record payment type `complimentary`, and require **`COMPLIMENTARY_BILL` Manager Approval**.

---

## 4. Manager Approval Governance Engine

- **Protected POS Actions**:
  1. `REPRINT_BILL`: Reprinting past customer bills.
  2. `CANCEL_BILL`: Cancelling active kitchen/unpaid orders.
  3. `APPLY_DISCOUNT`: Applying manual bill discounts.
  4. `COMPLIMENTARY_BILL`: Settling bills as complimentary.
- **Single Global Context**: Frontends consume `useApprovalFlow()` which routes through a single `<ApprovalProvider>` at `src/app/_layout.tsx`.
- **Single-Use Policy**: Verified approvals transition to `COMPLETED` immediately to prevent code reuse.
- **Security Hashing**: approval codes are hashed using SHA-256 (`approval_code_hash`). Plaintext codes are never stored.
- **Authenticated API**: every `/api/approval/*` call carries the Supabase JWT; the server derives tenant, branch and role from the caller's staff row and ignores tenant/branch values in the body. Codes expire after 5 minutes, allow 5 attempts, and at most 3 resends per request (resends never reset the attempt counter). Only owners/admins/managers may change policies or verify approval emails.

---

## 5. Recipe Consumption & Inventory Supply Chain

- **Asynchronous Deduction**: `settle_order()` inserts the `inventory_consumption_batches` row in the settlement transaction. The PostgreSQL worker `process_consumption_batches()` (scheduled every minute by pg_cron, or triggered by a manager via `run_consumption_worker()`) expands bill lines into per-material jobs, deducts stock under row locks, writes the stock ledger and retries failures up to 5 times. Stock is never silently clamped: a shortfall leaves stock negative and is recorded in the ledger remark. Tracking can be disabled per branch with `pos_settings.inventory_tracking_enabled`.
- **BOM Recipe Deduction**: Items linked to a recipe (`recipe_id`) deduct raw ingredients from `inventory_materials.current_stock` according to recipe yield ratios.
- **Inter-Branch Stock Transfers**: Stores submit `inventory_transfer_requests` to supplying warehouses/central kitchens. `create_dispatch()` ships goods atomically and refuses when the supplying branch lacks stock; `receive_dispatch()` books goods in atomically and is idempotent (a repeated submit changes nothing). Dispatched vs received quantities generate `inventory_transfer_variances` audit rows.
