# DATABASE_ARCHITECTURE.md — Grovit AI POS Schema & Relational Blueprint

> **System Name**: Grovit AI POS (Le Laban Multi-Tenant POS Platform)  
> **Database**: Supabase PostgreSQL 15+ (Mumbai Region — `ap-south-1`)  
> **Last Updated**: 2026-07-23  

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
