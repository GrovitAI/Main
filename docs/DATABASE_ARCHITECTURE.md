# DATABASE_ARCHITECTURE.md — Grovit AI POS Schema & Relational Blueprint

> **System Name**: Grovit AI POS (Le Laban Multi-Tenant POS Platform)  
> **Database**: Supabase PostgreSQL 15+ (Mumbai Region — `ap-south-1`)  
> **Last Updated**: 2026-09-07  

---

## 1. High-Level Database Overview

The Grovit AI POS database is an enterprise-grade multi-tenant relational system engineered for high-concurrency restaurant billing, kitchen ticket dispatching, inventory consumption queues, and multi-channel approval governance.

### Architectural Invariants
1. **Multi-Tenant Isolation**: Every operational table is partitioned by `tenant_id` and `branch_id`.
2. **One Open Order $\rightarrow$ One Bill**: Enforced at DB level by constraint `UNIQUE(open_order_id)` on `bills`.
3. **Immutable Receipts**: `bills` and `settlements` are immutable once created.
4. **Historical Line Item Snapshots**: `bill_items` snapshots item names, unit prices, paise calculations, GST percentages, HSN codes, and modifiers at bill creation time.
5. **Decoupled Asynchronous Inventory Deductions**: Bill settlements write consumption batch queues without blocking cashier checkout responses.

---

## 2. Table Classification Matrix

### A. Master & Configuration Tables
- `tenants`: Primary organization entity.
- `branches`: Physical store locations (`RESTAURANT`, `CENTRAL_KITCHEN`, `WAREHOUSE`).
- `staff`: Role-based user profiles (`owner`, `manager`, `cashier`, `kitchen`).
- `categories`: Menu category taxonomy.
- `products`: Sellable menu items.
- `inventory_materials`: Raw ingredients, packaging items, and stock units.
- `inventory_categories`: Material classification hierarchy.
- `inventory_units`: Units of Measure (e.g., KG, LTR, Gram, Portion).
- `inventory_recipes`: Bill of Materials (BOM) recipe definitions.
- `pos_settings`: Branch-level terminal settings (tax rate, receipt footer, manager PIN hash).
- `printers`: Thermal receipt and KOT hardware profiles.

### B. Transactional Operational Tables
- `open_orders`: Active dining tabs / shopping carts (`draft`, `in_kitchen`, `unpaid`, `paid`, `cancelled`).
- `open_order_items`: Line items inside active carts.
- `kots`: Kitchen Order Tickets sent to prep stations.
- `kot_items`: Specific line items per KOT.
- `bills`: Immutable customer invoices.
- `bill_items`: Static snapshot line items on generated bills.
- `settlements`: Financial payment records (Cash, UPI, Card, Complimentary).

### C. Supply Chain & Requisition Tables
- `inventory_transfer_requests`: Inter-branch stock requisition orders.
- `inventory_transfer_request_items`: Requisition material items.
- `inventory_dispatches`: Inter-branch shipments.
- `inventory_dispatch_items`: Dispatched shipment line items.
- `inventory_transfer_variances`: Stock discrepancy audit records.
- `inventory_transfer_events`: Transfer audit log trail.

### D. Queue & Governance Tables
- `inventory_consumption_batches`: Recipe deduction batches linked to settled bills.
- `inventory_consumption_jobs`: Individual material deduction queue items.
- `branch_approval_settings`: Per-branch manager approval config.
- `branch_approval_settings_history`: Audit trail for manager email updates.
- `approval_requests`: Authorization OTP log (`REPRINT_BILL`, `CANCEL_BILL`, `APPLY_DISCOUNT`, `COMPLIMENTARY_BILL`).

---

## 3. Entity Relationship Diagram (ERD)

```text
                        [tenants]
                           │
       ┌───────────────────┼───────────────────┐
       ▼                   ▼                   ▼
  [subscriptions]  [tenant_features]       [branches]
                                               │
       ┌───────────────────┬───────────────────┼───────────────────┐
       ▼                   ▼                   ▼                   ▼
    [staff]            [products]      [inventory_materials] [pos_settings]
       │                   │                   │
       ▼                   │                   │
 [open_orders] ────────────┼───────────────────┤
       │                   │                   │
       ├──────────────┐    ▼                   │
       ▼              ▼ [inventory_recipes] ───┘
[open_order_items]  [kots]      │
       │              │         │
       ▼              ▼         │
    [bills] ───────> [kot_items]│
       │                        │
       ├────────────────────────┼────────────────────────┐
       ▼                        ▼                        ▼
 [bill_items]             [settlements]     [inventory_consumption_batches]
                                                         │
                                                         ▼
                                            [inventory_consumption_jobs]
```

---

## 4. Key Performance Indexes

```sql
-- High-frequency order queries by status
CREATE INDEX IF NOT EXISTS idx_open_orders_tenant_branch_status 
  ON open_orders(tenant_id, branch_id, status);

-- Fast billing history & analytics lookup
CREATE INDEX IF NOT EXISTS idx_bills_tenant_branch_created 
  ON bills(tenant_id, branch_id, created_at DESC);

-- Bill line item lookups
CREATE INDEX IF NOT EXISTS idx_bill_items_bill_id 
  ON bill_items(bill_id);

-- Enforce 1 Bill per Open Order
CREATE UNIQUE INDEX IF NOT EXISTS unique_open_order_id 
  ON bills(open_order_id);

-- Asynchronous inventory deduction worker queue index
CREATE INDEX IF NOT EXISTS idx_consumption_jobs_status_retry 
  ON inventory_consumption_jobs(status, retry_after) 
  WHERE status = 'Pending';
```

---

## 5. Security & Integrity Layer (added 2026-09-07, tasks 20–24)

### Row Level Security
Every table has RLS enabled (`supabase/migrations/20260907000100_rls_policies.sql`).

| Helper (SECURITY DEFINER) | Returns |
| :--- | :--- |
| `auth_staff_row()` | tenant_id, branch_id, role of the active staff row for `auth.uid()` |
| `auth_tenant_id()`, `auth_branch_id()`, `auth_role()` | scalar accessors |
| `auth_is_tenant_wide()` | true for owner / admin |
| `auth_is_manager()` | true for owner / admin / manager |
| `auth_can_access_branch(tenant, branch)` | tenant match AND (tenant-wide OR own branch) |

Policy shapes: tenant+branch tables use `auth_can_access_branch(tenant_id, branch_id)`; tenant-only tables use `tenant_id = auth_tenant_id()`; child tables without tenant columns (`open_order_items`, `kot_items`, `bill_items`, `inventory_transfer_request_items`, `inventory_dispatches`, `inventory_dispatch_items`, `inventory_recipe_items`) inherit access through their parent row. Transfers are visible to both the requesting and the supplying branch. `anon` has no table or RPC privileges.

### Document numbering
`branch_counters(tenant_id, branch_id, bill_seq, order_seq, kot_seq)` — seeded from the highest existing numbers on first use, incremented under a row lock by `next_branch_sequence()`. `next_invoice_number()` formats `<branches.invoice_prefix or INV>-<4+ digits>`. Partial unique index `uniq_bills_invoice_number_per_branch_v2` guarantees uniqueness for bills created from 2026-09-07.

### Transactional RPCs

| Function | Purpose |
| :--- | :--- |
| `settle_order(tenant, branch, order, payment_type)` | Atomic settlement: lock order → bill upsert → bill_items snapshot with per-line discount → single settlement → consumption batch → order paid. Idempotent on replay. |
| `assign_order_numbers(tenant, branch, order, invoice?, order_name?)` | Assigns missing invoice number / "Order #N" before a provisional print. |
| `next_kot_number(tenant, branch)` | Per-branch KOT sequence. |
| `get_bills_ledger_kpis(tenant, branch, start, end, status, search)` | Server-side gross / discounts / complimentary / net totals for the ledger. |
| `get_analytics_*` | Existing analytics aggregations (now authenticated-only). |
| `create_dispatch(tenant, request, items, remarks, by)` | Ships stock atomically; raises `INSUFFICIENT_STOCK:<material>`. |
| `receive_dispatch(tenant, dispatch, items, remarks, by)` | Books stock in atomically; idempotent (`already_received`). |
| `process_consumption_batches(limit)` | Worker (pg_cron every minute): expands bills → recipe jobs → stock deductions + ledger, 5 retries with back-off. |
| `run_consumption_worker()` | Manager-triggered run of the worker. |
| `check_rate_limit(key, limit, window_seconds)` | Fixed-window rate limiting used by the Vercel API. |

### New columns
`approval_requests.resend_count`, `pos_settings.inventory_tracking_enabled`, `inventory_dispatch_items.received_quantity`.

### Additional indexes (task 22)
`bills(tenant_id, branch_id, settled_at)`, `bills(tenant_id, branch_id, status, created_at)`, `bills(tenant_id, branch_id, invoice_number)`, `settlements(bill_id)` (unique), `settlements(tenant_id, branch_id, created_at)`, `open_order_items(open_order_id)`, `kots(open_order_id)`, `kot_items(kot_id)`, `staff(auth_user_id)`, `inventory_material_stock_levels(tenant_id, branch_id, material_id)`, `inventory_stock_ledger(tenant_id, branch_id, material_id, transaction_date)`, `inventory_consumption_batches(status, created_at) WHERE Pending`, `inventory_consumption_jobs(batch_id)`, `approval_requests(tenant_id, branch_id, created_at)`.
