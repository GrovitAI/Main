# PROJECT_MEMORY.md — Living Architectural Knowledge Base

> **System Name**: Grovit AI POS (Le Laban Multi-Tenant Restaurant POS & Supply Chain Platform)  
> **Target Region**: India (GST Compliant)  
> **Last Updated**: 2026-07-23  

---

## 1. Project Overview

**Grovit AI POS** is a production-grade, multi-tenant SaaS Point of Sale (POS), Kitchen Order Ticket (KOT), Financial Settlement, and Inventory Supply Chain platform engineered for restaurant chains, central kitchens, and retail food outlets in India.

### Key Capabilities
- **Multi-Tenant / Multi-Branch Architecture**: Supports isolated tenant accounts with multiple physical restaurant branches, central kitchens, and central warehouses.
- **High-Speed POS & Billing**: Optimized for sub-second ordering, tab management, KOT generation, provisional billing, and multi-mode settlements (Cash, UPI, Card, Complimentary).
- **Security & Approval Governance**: Built-in Approval Engine protecting high-risk cashier operations (Cancel Bill, Reprint Bill, Apply Discount, Complimentary Settlement) using 6-digit manager OTP authorization.
- **Automated Recipe & Supply Chain Engine**: Asynchronous, queue-based inventory deduction triggered by bill settlement, featuring Bill of Materials (BOM) recipe management, stock requisition requests, dispatch tracking, and discrepancy variance auditing.
- **Cross-Platform Distribution**: Unified codebase deployed as a Web Application, native Android APK, and iOS TestFlight build via Expo SDK 56.

---

## 2. Technology Stack

- **Core Framework**: Expo SDK 56 + React Native
- **Routing & Navigation**: Expo Router v3 (File-based routing)
- **Language**: TypeScript (Strict Mode — `noImplicitAny`, no non-null assertions)
- **Styling**: NativeWind v4 (Tailwind CSS v3.4.17 pinned for compatibility)
- **Database**: Supabase PostgreSQL 15+ (Mumbai Region — `ap-south-1`)
- **Backend API**: Vercel Node.js Serverless Functions (`/api/approval/*`)
- **State Management**: Zustand v4 (`use-orders-store.ts`, `use-session-store.ts`)
- **Printing Engine**: Dual-Mode Thermal Printer Driver:
  - *Direct Esc/POS Printing*: Direct raw TCP socket / PrintNode hardware integration via `printService.ts`.
  - *Browser Printing*: Fallback HTML receipt rendering via `window.print()`.
- **Security & Hashing**: Node.js `crypto` (SHA-256 HMAC PIN hashing)
- **Email Delivery**: Google Workspace SMTP / TLS raw socket mailer with anti-enumeration timing protection.

---

## 3. Core Architecture

```text
                        App Root (_layout.tsx)
                                  │
                     ┌────────────┴────────────┐
                     │    ApprovalProvider     │
                     │  (Single Global State)  │
                     └────────────┬────────────┘
                                  │
                     ┌────────────┴────────────┐
                     │ ApprovalDialogContainer │
                     │ (Single Dialog Instance)│
                     └────────────┬────────────┘
                                  │
       ┌──────────────────────────┼──────────────────────────┐
       ▼                          ▼                          ▼
  index.tsx (POS)        orders.tsx (History)       OrderPanel.tsx (Cart)
(Cancel/Reprint Bill)     (Reprint Previous)          (Apply Discount)
       │                          │                          │
       └──────────────────────────┴──────────────────────────┘
                                  │
                        useApprovalFlow() Hook
                                  │
                       POST /api/approval/verify
                                  │
                    Protected Action Callback Executes
                                  │
                       POST /api/approval/complete
```

### Multi-Tenant Data Isolation Pattern
Every table in the Supabase PostgreSQL database contains `tenant_id` and `branch_id`. All database queries executed by the frontend or service layer MUST import tenant context exclusively from `@/lib/pos/tenant-context` and append:
```ts
.eq('tenant_id', TENANT_ID)
.eq('branch_id', BRANCH_ID)
```

---

## 4. Database Principles

1. **One Open Order $\rightarrow$ Exactly One Bill**:
   Enforced at the database layer via PostgreSQL constraint `UNIQUE(open_order_id)` on the `bills` table.
2. **Bills are Immutable Financial Documents**:
   Once created and settled, `bills` and `settlements` records are **never updated**. Tax amounts, discounts, and item breakdowns remain frozen for audit integrity.
3. **Bill Line Items are Static Snapshots**:
   `bill_items` snapshots product names, prices, paise calculations, GST percentages, HSN codes, and modifiers at the moment of bill generation. Future price changes in `products` never alter past receipts.
4. **Asynchronous Queue-Based Inventory Deduction**:
   Settled bills create an entry in `inventory_consumption_batches` and return immediately to the cashier. Deduction jobs in `inventory_consumption_jobs` execute asynchronously to prevent database locks during peak checkout hours.
5. **Single-Use Approval OTP Lifecycle**:
   Approval requests transition from `PENDING` $\rightarrow$ `APPROVED` $\rightarrow$ `COMPLETED`. Completed approvals cannot be reused.
6. **Deterministic Single-Allocation Invoice Numbering**:
   Invoice numbers (`INV-XXXX`) are allocated once, immediately saved to `open_orders.invoice_number`, and reused deterministically during retries to prevent sequence gaps.
7. **Zero Fire-and-Forget Financial Writes**:
   No operation creating or finalizing financial records may run in an un-awaited background task. All financial database persistence must complete before the UI reports success.

---

## 5. Business Rules

- **KOT Generation**: Only new items added since the last ticket generate a new KOT (`kot_sent: false`).
- **Discount Application**: Discounts are computed as either fixed amounts or percentages. Manual discount application requires manager approval.
- **Complimentary Settlement**: Complimentary bills settle total amounts to zero, record payment mode as `complimentary`, and require `COMPLIMENTARY_BILL` manager approval.
- **Bill Cancellation**: Cancelling an active order updates status to `cancelled`, records `cancelled_by` and `cancellation_reason`, and requires `CANCEL_BILL` approval.
- **Paired Integer-Paise Precision**: All monetary totals store floating-point rupees (`total_amount`) alongside integer paise (`grand_total_paise`) to guarantee exact math without rounding drift.

---

## 6. Folder Structure

```text
c:\Users\Might\Grovit\
├── api/                     --> Pure Node.js Vercel Serverless Functions (isolated from React Native)
│   └── approval/            --> Approval API endpoints (request, verify, complete, resend)
├── docs/                    --> System documentation & PROJECT_MEMORY.md
├── scratch/                 --> Database migration scripts & test utilities
├── src/
│   ├── app/                 --> Expo Router screen pages
│   │   ├── _layout.tsx      --> App root layout (wraps ApprovalProvider)
│   │   └── (app)/
│   │       ├── index.tsx    --> Main POS Billing Terminal
│   │       ├── orders.tsx   --> Order History & Reprint
│   │       └── inventory/   --> Material Stock & Transfer Requisitions
│   ├── components/
│   │   ├── approval/        --> ReasonDialog & ApprovalCodeDialog components
│   │   └── pos/             --> OrderPanel, ProductCard, SettlementModal, Sidebar
│   └── lib/
│       ├── approval/        --> ApprovalContext, approval.service, approval-supabase
│       └── pos/             --> open-orders-service, settlement-service, use-orders-store, tenant-context
```

---

## 7. Major Services

- **`open-orders-service.ts`**: Manages cart line items, KOT ticket creation, order status transitions (`draft` $\rightarrow$ `unpaid` $\rightarrow$ `paid`), and idempotent `createOrUpdateBill()` insertions.
- **`settlement-service.ts`**: Handles DB writes for payment settlements (Cash, Card, UPI, Complimentary), ensuring DB confirmation before clearing cart UI state.
- **`approval.service.ts`**: Client service communicating with `/api/approval/*` serverless functions for manager approval workflows.
- **`inventory-service.ts`**: Manages raw materials, unit conversions, Bill of Materials (BOM) recipes, transfer requests, dispatches, and recipe consumption batches.
- **`printService.ts`**: Controls thermal printing of KOT tickets and bills via PrintNode agent or browser fallback.

---

## 8. API Overview

All serverless API routes live in `/api/*` and use a pure Node.js `@supabase/supabase-js` client (`approval-supabase.ts`) to avoid React Native / Expo bundler crashes:

- **`POST /api/approval/request`**: Accepts `action`, `resourceType`, `resourceId`, `reason`. Hashes a 6-digit OTP, saves `approval_requests`, and emails manager.
- **`POST /api/approval/verify`**: Validates 6-digit OTP against SHA-256 hash. Enforces 5-attempt limit and 5-minute expiry.
- **`POST /api/approval/complete`**: Transitions verified request status to `COMPLETED` (consumed).
- **`POST /api/approval/resend`**: Generates fresh 6-digit OTP for existing active request.

---

## 9. State Management

- **Zustand (`use-orders-store.ts`)**: Central POS cart and order state. Holds active cart items, held carts, KOT status, and global mutation lock (`isMutating`).
- **Approval Context (`ApprovalContext.tsx`)**: Single global context wrapping `<ApprovalDialogContainer />` at the root layout level (`_layout.tsx`).
- **Session Store (`use-session-store.ts`)**: Manages staff role permissions, accessible branches, and active branch context.

---

## 10. Database Design Decisions

1. **Insert-or-Return-Existing Pattern**:
   `createOrUpdateBill()` uses atomic `INSERT INTO bills`. If PostgreSQL raises error `23505` (unique constraint violation on `open_order_id`), it catches the error, logs an operational metric, and fetches the existing immutable bill without overwriting.
2. **SHA-256 Code Hashing**:
   Manager approval OTPs are hashed using SHA-256 before database insertion. Plaintext PINs are never stored in database logs.
3. **Decoupled Serverless Supabase Client**:
   Vercel serverless functions in `/api/*` use `approval-supabase.ts` (pure Node `@supabase/supabase-js`), keeping backend API routes completely isolated from React Native dependencies.

---

## 11. Security Model

- **Multi-Tenant Query Enforcement**: Mandatory `tenant_id` and `branch_id` filtering on every query.
- **Email Anti-Enumeration**: `/api/approval/request` enforces equalized timing delays to prevent timing attacks.
- **Audit History Logging**: `branch_approval_settings_history` tracks all manager email updates, capturing `changed_by`, previous email, and timestamp.

---

## 12. Performance Considerations

- **UI Concurrency Locks**: `isMutating = true` in store and `localMutating = true` in `SettlementModal.tsx` prevent double-clicks or rapid `Enter` key re-triggers.
- **Database Indexes**: High-frequency indexes on `open_orders(tenant_id, branch_id, status)`, `bills(tenant_id, branch_id, created_at DESC)`, and `approval_requests(request_uuid)`.
- **Asynchronous Recipe Deduction**: Recipe deduction queue jobs process in the background, keeping checkout responses sub-100ms.

---

## 13. Coding Conventions

- **Strict TypeScript**: No `any`, no non-null assertions (`!`).
- **UI Components**: `Pressable` for touch targets (minimum 44px height), `FlatList` for lists (never `ScrollView + map`).
- **Error Handling**: All service functions must use `try/catch` and return standard `ServiceResult<T>` (`{ data, error }`). Raw DB errors are never exposed to the UI.

---

## 14. Things Future Developers Should Know

> [!CAUTION]
> **Never use `UPSERT` on `bills`**: Bills are immutable financial documents. Overwriting a bill with `UPSERT` can destroy audit history. Always use `INSERT` with `23505` exception handling.

> [!IMPORTANT]
> **Never mount multiple `<ApprovalDialogContainer />` components**: Always use `useApprovalFlow()` which communicates with the single global `<ApprovalProvider>` at `src/app/_layout.tsx`.

> [!NOTE]
> **Do NOT import React Native components inside `/api/*` serverless routes**: Vercel API routes run in a pure Node.js environment and will crash if React Native / Expo packages are imported.

---

## 15. Current Production Status

- ✅ **POS Billing & Cart Engine**: Completed & Hardened.
- ✅ **KOT & Kitchen Printing Engine**: Completed.
- ✅ **Financial Settlement System**: Completed.
- ✅ **Approval Engine (OTP Authorization)**: Completed & Hardened.
- ✅ **Supply Chain & Inventory Management**: Completed.
- ✅ **Multi-Tenant DB Security**: Completed & Hardened (`UNIQUE(open_order_id)` constraint added).

---

## 16. Architectural Invariants (System Laws)

1. **One Open Order produces exactly one Bill.**
2. **Bills are immutable financial records and must never be updated after settlement.**
3. **Bill Items are static snapshots created at bill generation time.**
4. **All financial database writes must be awaited before UI mutation locks are released.**
5. **Approval OTP codes are single-use (`COMPLETED`) and expire after 5 minutes.**
6. **Every database query must filter by `tenant_id` AND `branch_id`.**
7. **Never bypass the Approval Engine for protected POS actions.**
8. **Plaintext approval PINs must never be stored in the database.**
