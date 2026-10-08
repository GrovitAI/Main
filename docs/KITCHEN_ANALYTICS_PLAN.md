# Central Kitchen analytics — staging design review

Status: interactive design previews, 2026-10-08. No application or database
changes have been applied for this requirement. Work is isolated on
`codex/kitchen-analytics`; production remains the October 7 release.

## Client requirement

Give vendors categories and show a monthly categorical breakdown of purchases,
plus the quantity and total sale value of each kitchen item supplied to each
branch. Keep this inside Central Kitchen. The standalone restaurant Finance
and Day Close modules remain deferred.

## Proposed behavior

- Call the page **Analytics**. Enter from a Home shortcut, retaining the five
  existing kitchen tabs. Desktop can offer the same shortcut without changing
  the main app's approved floating bottom navigation.
- Give a vendor a default purchase category; allow an override for a purchase.
  This is an assumption for the previews pending client confirmation. If an
  invoice needs several categories, use line-level categorization instead;
  confirm that before defining the migration.
- Store the purchase category ID and name snapshot on the purchase. Renaming,
  archiving, or changing a vendor default must not recategorize old entries.
  Corrections should keep the existing void-and-replace audit trail. Historical
  buys start as **Uncategorized**, with explicit correction rather than guesses.
- Keep purchase categories distinct from the existing Spent category picker
  unless the client wants one shared list. Both can appear in an All spending
  view with their source clearly identified.
- Default to the current calendar month in Asia/Kolkata, with a month picker.
  Partial months are labelled month to date, never compared to a full prior
  month without equivalent-day handling. Empty months have a clear empty state.
- Show purchases by category, then vendor, then purchase entries; item sales by
  branch, item, quantity and value. Retain `kg`, `L`, and `pcs` per item rather
  than summing different units. Keep missing categories visible in the total.
- Offer CSV export on demand, respecting the filters. Include a totals row and
  purchase categories, units, dates, parties, paid-on-entry status, and source.

## Definitions that protect correctness

| Figure | Existing source | Meaning |
| --- | --- | --- |
| Sales to branches | Non-voided `sent` entry lines, `line_paise` | Value of goods sent/invoiced to branches; not branch customer POS sales or collections |
| Purchases | Non-voided `bought` entries | Full invoice amounts, whether paid on entry or bought on credit |
| Other expenses | Non-voided `spent` entries | Direct expenses, outside vendor purchase totals |
| Cash paid | Paid-on-entry buys + `paid` + `spent`, by entry date | Money out in the period; later payments are not added again to purchase totals |
| Cash received | Non-voided `received` entries | Collections in the period, potentially for an earlier month's goods |

Opening balances are not current-month sales or purchases. Voided originals
are excluded; active replacements are counted once. A buy marked pay later is
not necessarily still unpaid: the current balances/allocation records are the
appropriate source for outstanding amounts. Do not label `paid=false` as
current unpaid debt. Do not call sales minus purchases profit: inventory and
recipe cost allocation are not yet modeled.

## Architecture findings and staged implementation

`kitchen_parties` has no vendor category. `kitchen_categories` currently serves
Spent expenses. `kitchen_entries.category` currently stores Spent category text;
`kitchen_post_entry` clears it for buys. Entry lines already store per-item
quantity and price, sufficient for branch item-sales reporting.

After design and category scope are confirmed:

1. Add a scoped purchase category list, vendor default reference, and purchase
   snapshot fields in one idempotent migration with RLS and explicit grants.
   Preserve existing post/edit RPC atomicity, auth checks, and signatures.
2. Update vendor and Bought forms, types, and `kitchen-service.ts`, using the
   existing tenant context and kitchen scope. Load category lists through the
   existing store; do not create extra per-vendor queries.
3. Add typed, server-aggregated reports scoped by tenant and kitchen branch,
   plus filters for destination party/item and purchase category/vendor.
   Derive authorization from existing staff/branch access, never supplied IDs
   alone. Prefer security-invoker aggregation under current kitchen RLS.
4. Add the selected Analytics layout as an Expo/RN route outside the five-tab
   layout, entered from Home. Use NativeWind, brand tokens, Pressable/FlatList,
   and loading/error/empty states. No HTML is shipped in the Expo app.
5. Fetch aggregates on filter changes/explicit refresh, cancel stale requests,
   paginate drilldowns, and fetch full export details only on Export. No new
   polling or Realtime subscription is needed for monthly reports.
6. Apply the migration to staging only and verify before further migrations.
   Test scope isolation, buy/pay double counting, void/edit replacement,
   historical snapshots, mixed units, archived parties/categories, month
   boundaries, empty data, paginated detail and filtered export reconciliation.
   Run typecheck/lint and meaningful service/database tests.
7. Review with the client in staging. Production promotion is a separate
   release after approval, with a reviewed migration and rollback plan.

## Preview alternatives

- **Monthly overview**: paired purchase breakdown and compact item-sales report;
  a glanceable monthly page with local detail panels.
- **Report workspace**: tabs for Sales, Purchases, and Cash; a single larger
  working report and its relevant filters.

Both include desktop/phone sizing, a vendor category flow, purchase override,
month filters, category drilldown, and a local mock CSV view. All figures and
vendors are illustrative. The preview never connects to Supabase.

Preview source is stored in the durable chat visualization directory:
`C:/Users/Might/.codex/visualizations/2026/10/05/01a10c91-a0ad-7b12-9c39-3f9dc9598875/kitchen-analytics.html`.
It can be inspected locally at `http://127.0.0.1:8092/` while the preview server
is running. The application staging server remains separate on port 8081.
An identical source copy is tracked in `docs/previews/kitchen-analytics.html`
so the preview remains reviewable with the staging branch.

Browser verification covered branch/item totals, category detail, vendor default
and purchase override (without rewriting old categories), filtered CSV totals,
an empty month and recovery, direct expenses in All spending, and separate cash
totals. Script syntax passed and the static design detector returned `[]`.
Width checks at 320 and 1024px found no overflowing report controls. Browser
captures cover 1440/1024px desktop and 390px phone viewports; native behavior,
database permissions and production readiness are outside this preview review.

The independent preview review requested three targeted corrections: stack
phone filters so selected values remain legible, identify Purchase versus Other
expense in combined rows/exports, and use the incumbent flat tinted input wells
inside panels. These corrections are part of the final preview, not a proposal
to change the application-wide design system.
The subsequent targeted review returned **ship** for those three corrections
only; it is not an approval of the future application or database changes.

## Direction contract

THESIS: Extend the Kitchen Ledger with figures the owner can trace to entries.
Separate invoiced goods, purchases and cash; do not imply profitability.

OWN-WORLD: Inherit DESIGN.md: Le Laban blue, pale blue canvas, white flat
surfaces with hairlines, system sans, tabular money, compact desktop density,
44px controls and phone-first reflow. No gradients or shadows.

STORY: Choose a month, see purchase categories and goods supplied, narrow a
branch/item or category, then inspect its entries or export that report.

FIRST VIEWPORT: Kitchen subpage header and month selector above a compact
three-figure strip. Overview pairs purchase breakdown with branch item rows;
Workspace uses a report tab row and one full-width table. Vendor setup is a
separate preview flow. Phone mode stacks content without shrinking desktop.

FORM: Two requested, code-led preview structures inside the existing identity;
the client chooses the report composition before app implementation. This is
a scoped extension, not a replacement visual-world selection.

FINISH: unreviewed and undocumented is unfinished; this build ends with the
finish review, the verdict, DESIGN.md, and every shipping raster carrying its
provenance. Preview review does not approve the future application or schema.

## Primary-source inspiration

- [Restaurant365 Vendor Activity](https://docs.restaurant365.com/doc/docs/vendor-activity):
  date-scoped grouping by vendor or expense account, separate invoice/payment
  figures, and transaction detail opened from a report row.
- [Square vendor sales reports](https://squareup.com/help/us/en/article/8266-track-vendor-sales-with-square-for-retail):
  item detail with date/location filters and visible handling of missing
  vendor information. We borrow reporting patterns, not their accounting or
  retail-consignment semantics.

Existing Impeccable sidecar/config drift was reported by its context launcher;
this task preserves DESIGN.md and does not repair those files unasked.
