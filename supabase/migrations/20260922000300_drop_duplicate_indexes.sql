-- ============================================================================
-- Migration: drop two indexes that exactly duplicate a unique index
-- Report performance pass 2026-09-21.  NOT YET APPLIED.
--
-- Every settlement writes one row to `bills` and one to `settlements`, and
-- every index on those tables is maintained on every write. Two of them do no
-- work that another index does not already do:
--
--   idx_settlements_bill_id   btree (bill_id)        on settlements
--     duplicates uniq_settlements_bill_id  UNIQUE btree (bill_id)
--     scans since 2026-05-07: 1   (the unique twin: 547,607)
--
--   idx_bills_order_id        btree (open_order_id)  on bills
--     duplicates unique_open_order_id      UNIQUE btree (open_order_id)
--     scans: 58,369 — the planner picks either twin at random; every one of
--     those lookups is served identically by the unique index.
--
-- Neither has a WHERE clause or extra columns, so nothing can be answered by
-- the plain index that the unique one cannot answer. Foreign keys do not
-- depend on an index on the referencing side. Saving: two index insertions per
-- bill, ~620 kB today.
--
-- IMPORTANT — DROP INDEX CONCURRENTLY cannot run inside a transaction block.
-- The Supabase migration runner and `apply_migration` both wrap a file in one,
-- so run these two statements one at a time in the SQL editor instead, then
-- record the migration as applied. CONCURRENTLY means neither table is locked
-- against billing while the index goes. Each statement takes well under a
-- second at the current size. Rollback:
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_settlements_bill_id ON public.settlements (bill_id);
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bills_order_id ON public.bills (open_order_id);
-- Re-runnable.
-- ============================================================================

DROP INDEX CONCURRENTLY IF EXISTS public.idx_settlements_bill_id;

DROP INDEX CONCURRENTLY IF EXISTS public.idx_bills_order_id;
