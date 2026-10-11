---
version: 1
slug: "src-app-central-kitchen-invoices-tsx"
primary_target: "src/app/central-kitchen/invoices.tsx"
related_targets: ["src/components/kitchen/InvoiceWorkspace.tsx", "src/components/kitchen/AnalyticsWorkspace.tsx", "src/lib/pos/kitchen-invoice-service.ts", "src/lib/pos/kitchen-invoice-export.ts", "src/lib/pos/kitchen-invoice-utils.ts"]
---

# Kitchen branch invoices

Task 188 · 2026-10-11 · staging only · Mode: Operate.

Audience: the kitchen manager or owner groups finished goods supplied to one
branch during an inclusive date range, checks payment coverage and gives the
branch a readable document. This ordinary extension inherits PRODUCT.md,
DESIGN.md and the approved compact Kitchen Analytics surface; no new visual
world or concept round applies.

THESIS: An invoice groups recorded deliveries once and makes their payment
coverage explicit, without repeating a sale, stock movement or branch balance.

OWN-WORLD: The Kitchen Ledger, shared Source Sans 3, existing POS workspace
canvas, flat white rows, token-blue solid actions, hairline separators and
tabular amounts. No new palette, token, decorative motion or shipping raster.
The route is a kitchen stack workspace with Back rather than another rail tab.

STORY: Open Analytics Sales → Invoices on desktop or Report actions → Branch
invoices on phone. The selected branch/dates carry over. Choose New invoice,
one branch and its delivery range; select whole deliveries individually or
Select page, retain selection across pages, and create a numbered snapshot.
Read exact dated lines, total, matched payments and remaining balance. Print
or save PDF with fresh status; Record payment explicitly records money already
received. Cancel with a reason preserves records and releases deliveries for
correction or reinvoicing.

FIRST VIEWPORT: Invoices header with Back and New invoice, labelled Branch and
range controls, Refresh and the register. Each row places reference/branch and
saved range opposite exact total and To be paid/Paid/Cancelled text. Loading,
empty and safe-error recovery occupy the same bounded list. The creation view
replaces invoice rows with checkboxes and dated delivery lines; a separate
footer shows selected count/total and Create invoice. Detail shows branch,
period, status, three totals and compact actions above its ledger.

SURFACE DIMENSIONS: The centred frame caps at 1120px with 16px horizontal
gutters. From 700px, detail uses item (34%), date, quantity, rate and amount
columns with matching headings; phones pair item/amount over supporting date,
quantity and rate. Register/selection rows have a 64px minimum height with
natural wrapping; detail uses 14px main type and 12px supporting text.
Actions use 14px semibold labels, 8px corners and 48px minimum targets.
The bounded FlatList retains scrolling, keyboard tap handling and safe-area
bottom padding; the existing KeyboardAvoider surrounds the workspace.

FORM: Category-conventional invoice register, selection and detail in one
route. Branch/date changes reset selection; paging preserves it. Pages contain
50 rows and one invoice accepts at most 100 deliveries, including every line
of each selected delivery. Raw/mixed, voided and actively invoiced deliveries
are excluded. No selected payment status is invented: matched, non-voided
receipts determine coverage, partial invoices stay To be paid, and voiding a
receipt can reopen the balance. Writes wait for confirmation; busy guards,
safe errors and retained drafts protect recovery. The payment editor places
its error before inputs. Paid/cancelled states remove inappropriate actions.

DOCUMENT: Print / PDF opens a fresh-status, escaped, asset-free document for
the browser print dialog/Save as PDF. Native Share PDF uses expo-print and
expo-sharing and requires an updated build. Portable Arial is restricted to
the exported document; app typography remains Source Sans 3. No tax, GSTIN or
statutory fields are manufactured.

FINISH: Fresh independent review returned **Ship for staging browser/source**
with no material fixes across all five sections. Forty-seven tests in three
suites, typecheck and changed-source lint passed. Authenticated staging SQL
fixtures covered dates, immutable snapshots, duplicate guards, stock/sale
preservation, partial/full/unmatched/voided payments, retry/overpayment,
cancel/reinvoice and tenant/branch/API-grant denial, then rolled back. The one
migration was applied only to staging; nine staging migrations remain pending.

Final mocked browser matrix covers 1440×900, 800×700, 390×844, 320×700 and the
actual 370×668 panel: 22 retained captures, 60 intercepted requests and zero
forwarded. A separate affected-error confirmation used 24 intercepted/zero
forwarded requests, ten captures and four mock writes; counts are not combined.
The final full-size error image supersedes its stale contact-sheet thumbnail.
The actual staging empty register and a one-page sample A4 PDF were inspected.
One design detector returned no findings. Evidence and limits live in
docs/KITCHEN_INVOICES.md and .impeccable/review/invoices-finish-review.md.

AUTHORITY CHECK: DESIGN.md, .impeccable/design.json and brand.ts match protected
hashes and are unchanged. Invoice-local compact controls and textual semantic
status roles are recorded here rather than promoted to global rules. Earlier
recorded legacy font/control/navigation prose drift remains preserved. No new
identity, asset or system overwrite is implied by this extension.

UNVERIFIED: Native hardware, font scaling, soft keyboards, native PDF sharing,
dark appearance, gestures, physical printers, production rollout and operator
acceptance. Browser/source Ship is not native or tax-compliance certification.
