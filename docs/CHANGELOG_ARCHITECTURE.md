# CHANGELOG_ARCHITECTURE.md — Grovit AI POS Architecture Evolution

> **System Name**: Grovit AI POS (Le Laban Multi-Tenant POS Platform)  
> **Last Updated**: 2026-09-07  

---

## Tasks 18-27 - Security, Integrity & Hygiene Remediation (audit of 2026-09-06)
- **C1 Row Level Security** (task 20): RLS on every table; SECURITY DEFINER helpers map auth.uid() to the staff row; anon revoked from tables and RPCs.
- **C2 Secrets** (tasks 26/27): `.env` and `scratch/` untracked and git-ignored; `.env.example` added; CI guard fails if they are ever re-added. Credentials must still be rotated (see docs/DEPLOYMENT_RUNBOOK_2026-09-07.md).
- **C3 API authentication** (task 25): `src/lib/server/api-auth.ts` verifies the Supabase JWT, builds an RLS-scoped client, derives tenant/branch/role from the staff row, applies a strict CORS allowlist and durable rate limiting (`check_rate_limit` RPC). All /api handlers rewritten; staff creation moved server-side (`/api/staff/create`).
- **C4 PrintNode key logging** (task 18): removed.
- **C5/H1 Atomic settlement** (tasks 19, 21): `settle_order()` v2 - one transaction, row lock, idempotent replay, unique settlement per bill.
- **C6 Numbering** (task 21): `branch_counters` + `next_branch_sequence` / `next_invoice_number` / `assign_order_numbers` / `next_kot_number`; localStorage sequences removed from the client.
- **H3 Consumption worker** (task 23): `process_consumption_batches()` + pg_cron every minute, retries with back-off, shortfalls recorded instead of clamped.
- **H4 Transfers** (task 24): `create_dispatch` / `receive_dispatch` RPCs, idempotent receiving.
- **H5 Ledger KPIs** (task 22): `get_bills_ledger_kpis()` replaces client-side sums over PostgREST-capped result sets.
- **H6 Business day** (task 27): 24-hour window from 02:30 IST, evaluated in Asia/Kolkata, no blind spot.
- **M8/H7 Money math** (tasks 21, 27): integer paise everywhere; `money-utils.ts` mirrors the SQL; one tax source for provisional and settled bills.
- **M9 Indexes** (task 22): settled_at, status+created_at, settlements(bill_id), stock levels/ledger, consumption queue.
- **M14-M17 Tooling** (task 27): ESLint (no-any, no-non-null, restricted imports), Jest with the first unit tests, GitHub Actions CI, docs corrected to SDK 54, `pg` dependency removed.

---

## Task 37 — Duplicate Bill Prevention & Zero Fire-and-Forget Writes
- **Problem**: Cashiers rapidly clicking "Save & Print" followed by "Settle" within 600ms generated two duplicate bills (`INV-0116` & `INV-0117`) for the exact same `open_order_id`.
- **Root Causes**:
  1. `saveAndPrint()` launched un-awaited background IIFEs (`void (async () => { ... })()`), clearing mutation locks before DB persistence completed.
  2. Non-atomic check-then-insert pattern in `createOrUpdateBill()`.
  3. Lack of database unique constraint on `open_order_id`.
- **Architectural Solution**:
  1. **Phase 0**: Eliminated fire-and-forget writes. All financial persistence calls are explicitly `await`ed before UI reports success.
  2. **Phase 1**: Frontend mutation locking (`isMutating = true`) held locked across the entire network request. `SettlementModal.tsx` locks `localMutating = true` synchronously.
  3. **Phase 2 & 2.5**: Data migration cleanup script `scratch/clean-duplicate-bills.sql` applied `UNIQUE(open_order_id)` constraint on `bills`.
  4. **Phase 3**: `createOrUpdateBill()` uses the **Insert-or-Return-Existing** pattern. On PostgreSQL error `23505`, it logs an operational metric and returns the existing immutable bill without overwriting.
  5. **Phase 4**: `invoice_number` is allocated once and immediately persisted to `open_orders` prior to bill creation.

---

## Task 36 — Approval Engine React Hook Integrity Fix
- **Problem**: Opening the Approval Reason Dialog threw React Error #310.
- **Root Cause**: `useState` hook declared after conditional early return `if (!state || !state.visible) return null;` in `ApprovalDialogContainer.tsx`.
- **Solution**: Moved all `useState` hook declarations to the very top of `ApprovalDialogContainer` before any early returns.

---

## Task 35 — Multi-Owner Approval Email & Smooth Cancel Transition
- **Feature**: Supported multiple manager recipient emails (`email1, email2`) in `branch_approval_settings`.
- **Enhancement**: `sendApprovalEmail` sends `RCPT TO` commands to all listed recipient emails simultaneously. Single-step cancellation transition directly triggers Approval Reason Dialog.

---

## Task 33 & 34 — Global Approval Engine Integration & Mutex Protection
- **Architecture**: Refactored Approval Engine from local screen containers to a **Single Global `ApprovalProvider`** mounted at `src/app/_layout.tsx`.
- **Integrations**: Standardized `requestApproval()` hook across 4 protected POS actions (`REPRINT_BILL`, `CANCEL_BILL`, `APPLY_DISCOUNT`, `COMPLIMENTARY_BILL`).
- **Mutex Protection**: Added `isVerifying` mutex in `ApprovalDialogContainer.tsx` to block rapid double-click or Enter key code verification calls.

---

## Task 32 — Production Hardening & Vercel Serverless Isolation
- **Feature**: SHA-256 HMAC code hashing (`approval_code_hash`), 5-attempt brute-force protection, 5-minute server-side code expiry, and `branch_approval_settings_history` audit table.
- **Fix**: Created pure Node `approval-supabase.ts` client for `/api/approval/*` serverless routes, isolating Vercel API functions from React Native/Expo dependencies.
