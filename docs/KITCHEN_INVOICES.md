# Central Kitchen branch invoices

Task 188 · 11 October 2026 · staging only

Open **Analytics → Sales → Invoices** on desktop. On a phone, open **Report
actions → Branch invoices**. The direct route is `/central-kitchen/invoices`.
The Analytics branch and inclusive date range carry into the invoice register.

The register lists saved invoices; deliveries appear after **New invoice** or
the empty-state **Select deliveries** action. Choose a branch and the delivery period. Select individual
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
semibold actions use 8px corners and 44px minimum targets. The 12px status text
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

## Task 189: invoice discovery and compact actions

The staging register had no saved invoices; its selected branch/date range
contained two eligible finished-goods deliveries. Browser inspection confirmed
the read path worked. No business invoice or payment was created during this
diagnosis. The empty state now distinguishes saved invoices from deliveries
and includes Select deliveries. Invoice actions keep intrinsic widths and 44px
minimum tap targets; desktop Refresh remains aligned with the filter controls.

Typecheck and changed-file lint passed. Mocked Playwright checks at 1440×900,
390×844 and 320×700 verified the empty-state action, branch selection, delivery
selection and confirmed creation into detail: nine captures, 27 intercepted
requests, three mock writes, zero cloud forwarding and no page errors. One
affected desktop alignment confirmation used nine intercepted requests and one
mock write, with zero forwarding/errors. A single design detector found nothing.
The real staging delivery view also displayed the compact controls after hot
reload. No service, database, migration, production or protected design change.

## Task 190: invoice review fixes

A code review of the invoice feature found and fixed:

- **Issue dates in UTC.** "Prepared" in the app and "Issued" on the printed
  invoice took the first ten characters of the UTC `created_at`, so an invoice
  created between midnight and 5:30 am India time showed the previous day.
  Both now use the India calendar day. The print footer's "Payment status
  checked" time is India time instead of a raw UTC timestamp.
- **Readable dates.** Delivery dates in the selection list, the invoice lines
  and the print document read "1 Oct 2026" instead of `2026-10-01`.
- **Payments covered deliveries in id order.** `kitchen_invoice_action` walked
  an invoice's deliveries by uuid, so a part payment could mark a later delivery
  paid and leave an earlier one open. The Received screen covers oldest first
  (`allocateAcross`). Migration
  `20261011143000_kitchen_invoice_payment_oldest_first.sql` keeps the id-order
  row locks and allocates by delivery date, recorded time, then id. Only that
  function body changes. Applied on its own to Grovit Staging on 11 October
  through the Supabase connector and listed in `supabase/staging-pending.txt`
  (ten staging-only migrations now). Production is unchanged.
- **Part-paid invoices in the register** show the remaining balance under
  "To be paid", and each row's accessible name includes branch, total, status
  and remaining balance.
- **Payment form** states how much is still open and explains an amount above
  it, instead of only disabling Confirm.
- **Branch choices** reload when New invoice opens after the register failed
  to load, so the branch picker is never left empty.

Verification: typecheck, changed-file lint and 15 invoice tests (one new, for
the India issue date) passed. Mocked Playwright against the local staging web
app at 1440×900, 390×844 and 320×700 covered the register, detail, payment
form over/under the open balance and branch reload after a failed read: 29
intercepted requests, zero forwarded to the cloud, zero writes, no page errors
or horizontal overflow. Native hardware remains unverified.

Staging verification of the migration: before applying, the function still
walked deliveries in id order. Afterwards it is the single overload, still
security definer with an empty search path, executable only by authenticated
and service_role (not anon). One authenticated, rollback-only fixture posted
three deliveries dated 3, 1 and 2 October (₹30 each) and invoiced them. A ₹40
part payment covered 1 Oct ₹30, 2 Oct ₹10 and 3 Oct nothing. A retry with the
same key returned the same receipt, ₹50.01 was refused as an overpayment, ₹50
made the invoice Paid, and cancellation still worked. The fixture ended in a
deliberate exception, and a follow-up read found no fixture parties, items,
invoices or payment keys left. The security advisor lists the same 35
authenticated security-definer functions as the task 188 review (the invoice
RPCs are expected, as documented above), and no new findings appeared. The
11 October usage baseline was reused.

Noted, not changed: invoice numbers use `CK-000001`, and the Central Kitchen
branch's POS bill prefix may also be `CK`. POS bills use four digits and
invoices six, but a different invoice prefix would remove any ambiguity.

## Task 191: Invoices tab, in-app preview and print without pop-ups

- **Navigation.** Invoices is now a kitchen tab: desktop and tablet rails list
  it after Branches, and phones open it from More (Attendance, Branches,
  Invoices, Vendors). The route moved to `src/app/central-kitchen/(tabs)/invoices.tsx`,
  so the URL `/central-kitchen/invoices` and the Analytics links are unchanged.
  Because a tab stays mounted, a later Analytics link replaces its branch and
  dates. The register has no Back button; New invoice, detail and preview keep it.
- **Preview.** "Print / PDF" became **Preview invoice**. It fetches fresh
  payment status and shows the bill in the app as one A4-width paper column:
  kitchen, number, status and India issue date, Bill to, period, dated lines,
  totals and the prepared/status-checked footer. Its rows are rows of the
  existing FlatList, not a nested list or a modal.
- **Printing.** **Print / Save PDF** prints the same HTML document from a hidden
  frame inside the page. No window is opened, so browser pop-up blockers no
  longer stop it. The previewed invoice is printed immediately on tap.
  Phones keep **Share PDF** (expo-print and expo-sharing, still needing an
  updated native build).
- **Refresh.** The Refresh invoices and Refresh invoice buttons were removed.
  The tab reloads whenever it is shown again, after every create/payment/cancel
  and on pull-to-refresh on phones; the preview always reads fresh status;
  Retry loading remains on errors.

Verification: typecheck, changed-file lint, the invoice and native route
suites, then the full 35-suite/331-test run passed. Mocked Playwright at
1440×900, 390×844 and 320×700 opened Invoices from the rail or More, confirmed
the URL, no Refresh buttons and no register Back, opened detail and preview,
and printed: each print reached the hidden frame with the invoice number, and
no pop-up window opened. An Analytics-style link replaced the range on the open
tab. 59 intercepted requests, zero forwarded, no page errors or overflow. One
seam between the preview header and its first line was fixed and re-checked.
The design detector found nothing in the invoice screen; its one finding is the
existing approved rail width transition from task 173. Native hardware remains
unverified.

## Task 193: five-digit invoice numbers

The owner asked for simpler numbers. Invoices are now numbered **01000, 01001,
01002…** for each Central Kitchen, with no gaps, shown as five plain digits
(no prefix). This also removes the earlier `CK-` overlap with the Central
Kitchen branch's till bill prefix.

Migration `20261011170000_kitchen_invoice_numbers.sql` adds `invoice_no` and a
per-kitchen counter table (row security on, no anon or authenticated access;
only the security-definer `kitchen_create_invoice` writes it). The counter row
lock serialises creation, and a failed or rolled-back attempt also rolls back
the counter. Existing invoices were numbered in creation order. The old global
identity `number` column stays for history but is not shown.
`kitchen_invoice_totals` gains `invoice_no` as its last column.

Staging verification: the five existing invoices (old CK-000004 to CK-000008;
1–3 had been used up by rolled-back tests) became 01000–01004, and the counter
is 1004. A rollback-only authenticated fixture created 01005, then a
deliberately failed attempt, then 01006, so no number was skipped. Afterwards
the counter was still 1004 and no fixture rows remained. The app shows
`invoice_no` everywhere: register, detail, preview and print. Typecheck passed,
and 16 invoice tests passed.
