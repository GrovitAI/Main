# BUSINESS_RULES.md — Grovit AI POS Core Operating Rules

> **System Name**: Grovit AI POS (Le Laban Multi-Tenant Restaurant POS Platform)  
> **Last Updated**: 2026-07-23  

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
- **Provisional Receipts**: Provisional receipts (`saveAndPrint`) show total bill details and assign an invoice number (`INV-XXXX`) while status remains `unpaid`.
- **Invoice Number Allocation**: `invoice_number` is generated once, saved directly to `open_orders.invoice_number`, and reused deterministically during retries to prevent sequence gaps.

---

## 3. Financial Settlements & Payments

- **DB Confirmation First**: Cart state is cleared **only after database settlement confirmation**. UI never clears optimistically on checkout.
- **Paired Integer-Paise Math**: All receipts store rupee floats alongside exact integer paise (`subtotal_paise`, `tax_paise`, `discount_paise`, `grand_total_paise`) to eliminate rounding drift.
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
- **Security Hashing**: PINs are hashed using SHA-256 (`approval_code_hash`). Plaintext PINs are never stored.

---

## 5. Recipe Consumption & Inventory Supply Chain

- **Asynchronous Deduction**: Settling a bill writes an entry to `inventory_consumption_batches` and returns immediately. Deductions process asynchronously via background workers.
- **BOM Recipe Deduction**: Items linked to a recipe (`recipe_id`) deduct raw ingredients from `inventory_materials.current_stock` according to recipe yield ratios.
- **Inter-Branch Stock Transfers**: Stores submit `inventory_transfer_requests` to supplying warehouses/central kitchens. Shipments (`inventory_dispatches`) record dispatched vs received quantities, generating `inventory_transfer_variances` audit logs for discrepancies.
