# Central Kitchen branch invoices

Task 188 · 11 October 2026 · staging only

Open **Analytics → Sales → Invoices** on desktop. On a phone, open **Report
actions → Branch invoices**. The direct route is `/central-kitchen/invoices`.
The Analytics branch and inclusive date range carry into the invoice register.

Choose **New invoice**, a branch and the delivery period. Select individual
finished-goods deliveries or **Select page**, then **Create invoice**. Selection
persists across the 50-row pages; one invoice can include up to 100 deliveries.
Each selected delivery includes all its lines. Raw-material or mixed deliveries,
voided deliveries and deliveries on an active invoice are excluded. Archived
party/item lists remain available for historical deliveries. The register shows
invoices whose saved periods overlap the chosen range.

## Saved amounts and payments

An invoice snapshots its branch/kitchen names, delivery dates, item names,
units, quantities, recorded rates and exact line amounts. Creating it groups
existing sends; it never posts another sale, reduces stock or changes a branch
balance. Names and rates subsequently changed in item lists do not rewrite
the invoice. Invoice numbers are database-generated `CK-000001` references;
the sequence is global and can have gaps, including rolled-back checks.

**To be paid** means some of those deliveries remain uncovered by matched
branch receipts. Partial invoices show both matched payments and the remaining
balance. **Paid** means the complete invoice amount is covered. Unmatched
branch receipts affect the branch balance but do not arbitrarily pay an invoice.
Existing matched receipts count too. Voiding a matched receipt reopens the
remaining balance after refresh.

**Record payment** records money already received, with amount, date and mode.
It atomically matches that receipt only against the invoice's deliveries. The
database refuses an amount above the current open balance. A request key
retained during the editor session makes repeated submission of the same
payment idempotent. A save failure advises refreshing before retrying; no
payment/status change is inferred from a failed or incomplete response.
This records a receipt; it does not initiate a bank payment or transfer.

**Cancel invoice** requires a reason and an explicit confirmation. It retains
the cancelled invoice and its snapshots while releasing its deliveries for
correction or another invoice. It leaves sales, stock and receipts intact.
Existing edit/void operations reject an actively invoiced delivery; their
transaction rolls back any preceding stock/allocation changes. Cancel first,
then correct the delivery. Cancellation does not undo a received payment.

## Documents

**Print / PDF** on web opens a separate print document and fetches fresh invoice
details/payment status before rendering it. Use the browser's Save as PDF
destination. Blocked pop-ups produce a recoverable message. The print document
contains no remote assets/scripts; every user text field is HTML-escaped.
It includes number, branch, period, dated lines, rates, total, matched payments,
remaining balance, status and cancellation reason where applicable.

Native **Share PDF** uses SDK-compatible `expo-print` and `expo-sharing` loaded
only when requested. The additions require an updated native build. Native
PDF generation/sharing and physical printing have not been tested on hardware.
The document represents recorded branch supplies; no extra tax, discount,
GSTIN, statutory tax-invoice fields or payment terms are invented.

## Database and security

`20261011071731_kitchen_branch_invoices.sql` is applied only to Grovit Staging
and appears in `supabase/staging-pending.txt`. There are now nine pending
staging migrations. Production has not been migrated or deployed.

The three new tables have RLS, scoped authenticated SELECT policies, explicit
service-role grants, and no anonymous or direct authenticated write grants.
The total view and paged workspace RPC use security-invoker reads. Every app
request obtains tenant context from `tenant-context.ts` and the kitchen branch
from the existing resolver; it supplies both scopes to the RPC.

The two write RPCs deliberately use security definer to create immutable
snapshots and post/match a receipt atomically without direct client write
grants. Each explicitly checks `auth.uid()` and `kitchen_can_use`, uses an empty
search path and qualified objects, scopes records by both tenant and branch,
locks deliveries deterministically, and restricts execution to authenticated
users. A partial unique index prevents duplicate active invoice membership;
server-side validation rejects changed/foreign/out-of-range/raw deliveries and
stale expected totals. Client errors never expose raw SQL details.

The staging security advisor flagged these two authenticated definer RPCs as
expected review items. Their intended access was checked against the guards
and authenticated denial fixtures above; the advisor is not an automatic
security certification. Existing unrelated advisor warnings were not changed.
See [the advisor rule](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

## Verification

- TypeScript passed. Changed application/service/test lint passed; the native
  route smoke test retains its existing require-import warning pattern.
- 47 tests across invoice, kitchen report and native route suites passed,
  including 24 native route imports. No cloud credentials are used by tests.
- One focused authenticated staging fixture suite passed and rolled back all
  fixture records: date boundaries, other party/raw exclusions, unchanged
  stock/sales, snapshot rename, duplicate prevention, edit/void guard rollback,
  unmatched/partial/full/voided payments, idempotent receipts, overpayment,
  cross-tenant/branch denial, API privileges, cancellation and reinvoicing.
- Final mocked Playwright matrix: desktop 1440×900, tablet 800×700, phones
  390×844, 320×700 and the user's 370×668. Register, selection and detail were
  captured at each; payment/error/paid/cancelled/empty/load-error and print
  states complete 22 retained captures. Paging preserves selection. The final
  matrix used 60 intercepted cloud requests and forwarded zero; a focused
  error confirmation used 24 intercepted and forwarded zero. Earlier visual
  exploration also used mocks, not staging/production requests.
- The one-page sample PDF was text-checked and rendered through Poppler;
  invoice number, Paid status, amounts and item names were present, with no
  clipping in the rendered page. This verifies browser PDF output only.
- A real staging register opened with the existing sign-in and displayed its
  empty invoice list without an API error. No business invoice/payment was
  created by browser testing. No log query or polling was added.
- One source design detector returned no findings. The fresh independent finish
  review returned **Ship for staging browser/source**, with no material fixes
  across its five sections. Its evidence and limits are recorded in
  `.impeccable/review/invoices-finish-review.md`. Existing design-system files
  and tokens are preserved; the invoice contract is documented separately in
  `.impeccable/surfaces/src-app-central-kitchen-invoices-tsx.md`.

## Visual authority

The workspace extends the incumbent compact Kitchen Ledger: shared Source
Sans 3, POS workspace canvas, white ledger surfaces, token-blue solid actions
and tabular money. Desktop detail has balanced item/date/quantity/rate/amount
columns; phone lines pair item/amount above date/quantity/rate. Compact 14px
semibold actions use 8px corners and 48px minimum targets. The 12px status text
uses existing success/warning/muted tokens, always with an explicit label.
These are scoped invoice roles, not new global tokens or design rules.

`DESIGN.md`, `.impeccable/design.json` and `brand.ts` are byte-identical to the
incumbent authority. Earlier recorded prose drift (legacy system-font, shared
control and navigation descriptions) is preserved, not silently canonized by
this feature. The exported document's portable Arial font belongs only to the
print/PDF artifact; the app keeps Source Sans 3. No new visual world, shipping
raster, decorative motion or remote print asset was introduced.

## Usage and remaining verification

The 11 October All projects baseline for 21 September–21 October is
0.645/1 GB log ingestion, 38.653/100 GB log queries. Meter lag prevents exact
test-byte attribution or a guaranteed monthly total. Native hardware, text
scaling, soft keyboards and native sharing remain unverified.
