# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

One React Native (Expo) codebase ships to iPhone, Android and tablets, and the
same code runs in the browser for the tills. The owner wants the screens
identical on iPhone and Android (confirmed 2026-10-04); native affordances
(safe areas, keyboards, back gestures, share sheets) are respected, the design
language does not change per OS.

## Users

Grovit is a point-of-sale and back-office app built for one client, Le Laban
(NS Traders): a dessert brand in Chennai with two outlets (Kolathur,
Velachery) and a central kitchen that supplies them.

- **Tills (cashiers, managers)** bill customers on the web app at the counter.
- **The owner** runs the business from the app: orders, menu, inventory,
  finance, staff, branches, on a phone or a laptop.
- **The kitchen manager** (the newest user, confirmed 2026-10-04) keeps the
  Central Kitchen's books on their own phone, between batches, with little
  time: what was sent to which branch, what came in, what was bought, what
  was paid. Anyone holding the kitchen login may also keep its lists (items,
  prices, branches, vendors).

## Product Purpose

Run a small multi-outlet dessert business from one app: take payment at the
counter, know what is in stock and what it costs, and keep the money straight
across outlets and the kitchen. Success is that the owner trusts the figures
without a spreadsheet, and staff record things at the moment they happen.

The Central Kitchen module exists because the full inventory and finance
modules were too heavy for the kitchen. Its success is that the kitchen
manager records every send, buy and payment the same day, and the owner can
see at any time what each branch still owes the kitchen and what the kitchen
owes its vendors.

## Positioning

Built for this one business rather than for a market: the screens say
"Kolathur", "Nutella sauce" and "yet to pay", not "entity", "SKU" and
"accounts receivable". The kitchen module in particular is give-and-take
bookkeeping, not accounting: nothing has to be matched to anything for the
figures to be right, and matching is offered only as a convenience.

## Operating Context

- India: rupees, Indian digit grouping (₹1,12,000), UPI alongside cash and
  bank, GST on bills, Asia/Kolkata days.
- The kitchen: a phone in one hand, often mid-task; entries are short and
  frequent; items are weighed in kilograms and litres or counted in pieces.
- Branches ask the kitchen for stock and pay the kitchen irregularly, in
  round sums; vendors are paid in the same way. A send may be acknowledged
  over WhatsApp.
- Two Supabase projects: production and a staging copy for trying changes.
  Web is deployed on Vercel; native builds go through EAS and the stores.
- Owner/admin navigation (approved 2026-10-07): Daily work. Phones use
  Analytics, Kitchen, Inventory and More; desktop web uses a floating bottom
  bar with More opening Business and Administration tools above it. Existing role access and
  the Central Kitchen module remains separate. Its 2026-10-08 refinement adds
  Analytics directly to the kitchen rail. Task 175 (2026-10-10, staging) splits
  Items into Raw materials and Finished goods on desktop/tablet; phones use
  Home, Analytics, Stock, History and More, with both stock panes inside Stock
  and Branches and Vendors in More. Task 176 (2026-10-10, staging) adds Attendance
  directly to desktop/tablet rails and under More on phones.

## Capabilities and Constraints

- Expo SDK 54, React Native 0.81, Expo Router, NativeWind (Tailwind 3.4),
  TypeScript strict; Supabase (Postgres, RLS, SECURITY DEFINER functions);
  Zustand; lucide-react-native icons. Rules in AGENTS.md: Pressable and
  FlatList, no hard-coded colours, 44 px touch targets, service layer in
  `src/lib/pos/*-service.ts`, every query scoped by tenant and branch.
- Roles: owner, admin, manager, cashier, kitchen, accountant. The `kitchen`
  role is the Central Kitchen login: it sees the kitchen module and nothing
  else; the owner and admins may open the module too.
- Standalone Finance, including Day Close, is deferred at the client's request
  (2026-10-07). Its code and records are retained, and its navigation, settings
  and route entry are disabled. Central Kitchen bookkeeping remains available.
- Kitchen module (migration `20261004000100_central_kitchen.sql`): items with a
  stock figure and an optional selling price; branches and vendors as typed
  names; entries of seven kinds (sent, received, bought, paid, spent, made,
  count); optional matching of a payment to the buys or sends it covers;
  stock moves only inside the posting function; nothing is deleted, entries
  are voided. Separate Cash and Bank balances (owner's request, 2026-10-11,
  replacing the earlier single pot): cash entries are Cash, UPI and bank
  entries are Bank; opening cash and bank on an as-of date; *Move money*
  records cash deposited or withdrawn and changes nothing else (migration
  `20261011170100_kitchen_cash_bank.sql`). Expense categories: salaries, gas,
  electricity, rent, transport, packaging, repairs, other.
- Terminology (kitchen): *Send* (items to a branch), *Received* (money from a
  branch), *Bought* (from a vendor, paid now or pay later), *Spent* (pay a
  vendor, or an expense), *Made* (a batch adds stock), *Count* (sets stock),
  *yet to pay* (a branch's figure), *we owe* (a vendor's figure).
- Kitchen stock split (task 175, staging): raw materials are purchased and
  counted without batch creation. Finished goods have optional default selling
  prices and Create batch records the quantity produced, without recipes or
  raw-material deductions (the user's selected scope). New sends offer finished
  goods and new purchases offer raw materials. Item types are editable; selected
  lines from historical entries remain available when editing. Existing stock,
  entry history and atomic posting/voiding are preserved. See docs/KITCHEN_STOCK.md.
- Kitchen attendance (task 176, staging): a manually maintained roster, separate
  from Auth accounts, and one daily mark per person in the kitchen's scope.
  Present, Absent, Half day and Leave are explicit choices; Unmarked stays
  distinct. India dates stop at today, notes allow 200 characters, and the
  database owns the latest editor/time. Staff can be added, edited, archived
  and restored; recorded days survive archive and remain correctable. Save
  feedback waits for database confirmation. This is a daily register, without
  payroll or clock-in automation. See docs/KITCHEN_ATTENDANCE.md.
  Task 178 refines the staging roster with underline panes, local status/count
  filters and completion, aligned desktop rows and compact phone disclosure,
  using HR-tool roster clarity within the existing manual attendance scope.
  Task 179 adds Month overview with per-person Present/Absent/Half day/Leave/
  Unmarked totals and an individual-day calendar editor. Active staff totals
  count calendar days through today in India time, not employment dates,
  scheduled work or payroll; archived staff count and correct recorded days
  only. Save day/Cancel edit protect local drafts; clear saves Unmarked rather
  than deleting. Desktop uses staff/calendar panes and phone opens the calendar
  with Back. There is no bulk month autofill or global route-navigation guard.
  Task 187 adds daily checkbox selection through Select staff or a name press/
  hold, current-view Select all, and an explicit date/count/status/Mark step.
  Changed marks save together with individual notes after full confirmation;
  failures retain selection. Half day/Leave alone offer optional note editing
  in both views; changing status preserves saved notes. Solid compact actions
  retain the incumbent brand. This capability is staging only.
- Kitchen History spacing (task 179, staging): desktop groups particulars with
  amount/status before the separate audit column; phone audit information sits
  in a divided footer. Creator, transaction date, recorded IST time and audit
  meaning remain visible, with unchanged filters, sorts, details and the loaded
  500-entry/92-transaction-day window. See docs/KITCHEN_HISTORY.md.
- Kitchen History controls (task 180, staging): desktop places Search, Filters
  and a 220px sort control on one row; phones place Search above matched 48px
  Filters/sort buttons, including active counts. Compact date-basis labels and
  direction icons keep all four sorts and full accessible/picker wording.
  Shared report fields retain their default presentation. Existing local
  filtering, loaded scope, audit rows, details and design authority are
  preserved; pre-existing documentation drift remains recorded in
  docs/KITCHEN_HISTORY.md. No new tokens, assets or production deployment.
- Kitchen History expanded filters (task 181, staging): Entry details groups
  Type, Status and Entered by separately from Dates (basis and range). Desktop
  groups sit side by side, tablets stack groups with field rows, and phones
  stack full-width fields. Labels sit above white outlined 48px controls;
  concise status triggers preserve full picker/accessibility meaning. Textual
  web placeholders use smaller regular hints; entered values and numeric input
  sizes are retained. Shared outlined presentations remain opt-in. Existing
  toolbar, audit rows, local filtering/sorting and loaded scope are preserved
  within the incumbent design. See docs/KITCHEN_HISTORY.md.
- Kitchen History hover boundaries (task 182, staging): shared report choices
  use rounded 48px rows with 4px separators and distinct selected/hover fills.
  Calendar highlights sit 2px inside full 48px date targets, leaving a visible
  4px gap and stable focus borders. Existing date drafts, Cancel/Apply and
  filtering remain; other shared-control callers inherit the visual refinement
  with their existing callbacks. Incumbent design authority is preserved.
  See docs/KITCHEN_HISTORY.md.
- Kitchen History phone filters (task 183, staging, superseded on phones by task 185): the expanded
  panel uses five full-width inline label/value rows, 44px minimum targets,
  6px gaps and 8px padding. Redundant group headings are omitted; the date
  divider, full picker/accessibility names and natural long-choice wrapping
  remain. Any dates means no date filter within the disclosed loaded window
  of 500 entries/92 transaction days. Desktop/tablet grouped 48px controls,
  local behavior, shared defaults and incumbent design authority are retained.
  No new tokens, assets or production deployment. See docs/KITCHEN_HISTORY.md.
- Kitchen History Filter sheet (task 185, staging): the user selected the task
  184 sheet preview. Below 640px, Type/Status/Entered by/Date basis use a
  wrapping 2×2 grid above the list, with full-width dates and a persistent
  Reset/Done footer. Done, Close, backdrop and platform Back retain local
  choices; Reset clears filter/search fields and keeps sort. Date drafts keep
  their own Cancel/Apply and Clear dates behavior. A bounded static form scrolls
  on short windows with 48px close/footer targets and safe-area padding.
  Desktop/tablet inline groups, audit meaning, local filtering and the loaded
  500-entry/92-transaction-day window remain. Source Sans 3, POS blue/Canvas
  and incumbent design authority are preserved; native hardware remains
  unverified. No service/store/polling/schema or production change.
  See docs/KITCHEN_HISTORY.md for verification and limits.
- Kitchen branch invoices (task 188, staging): Analytics Sales opens an invoice
  register carrying the selected branch and inclusive dates. New invoice groups
  up to 100 selected whole finished-goods deliveries, with selection retained
  across pages; raw/mixed, voided and already actively invoiced deliveries are
  excluded. Saved names, quantities, rates and amounts are snapshots; creation
  does not post another sale or stock movement. To be paid/Paid follows matched
  non-voided receipts for those deliveries, with partial payment and remaining
  balance visible. Record payment confirms money already received and matches
  it atomically; retry keys prevent duplicate receipts. Cancel retains the
  invoice and sales/payments, releasing deliveries for correction or reinvoicing.
  An active invoice protects its deliveries from edit/void. Browser Print / PDF
  refreshes status and supports Save as PDF; native Share PDF needs an updated
  build and hardware verification. No statutory tax-invoice fields are invented.
  The migration is staging only; nine migrations remain pending for production.
  See docs/KITCHEN_INVOICES.md.
- Undecided: whether branches and vendors start at zero on day one or with
  what each owes today; whether the individual send slip stays WhatsApp text
  or becomes a PDF. Task 188's grouped branch invoice has a separate print/PDF
  document and does not settle that individual-slip decision.

## Brand Commitments

- Name: Le Laban (the app title shows "Le Laban"; the legal entity is NS
  Traders). Logo-derived palette in `src/lib/pos/brand.ts` and
  `tailwind.config.js`: primary blue #0066b2, deep #004a8d, navy #002d5a,
  light #3399ff, canvas #e8f2fa, ink #0f2744. Semantic money colours live in
  `brand.ts` (`semantic`).
- The kitchen module keeps the same blue and feel as the rest of the app
  (owner, 2026-10-04): one family of screens, the kitchen a quieter and
  simpler member of it.
- Kitchen Blue frame (owner, 2026-10-09, task 172): the user selected the task
  171 direction and explicitly required the existing POS left-sidebar colour
  scheme and design. Kitchen desktop/tablet navigation shares that POS blue
  gradient and quiet ring detail, with Le Laban and Central Kitchen identity.
  Task 173 (2026-10-10) refines this commitment: reuse the existing Le Laban
  logo, match the POS workspace canvas, use a quiet flat Kitchen selection,
  and let desktop navigation auto-hide with hover/keyboard disclosure and an
  optional pin. These supersede task 172's text header, canvas, selected-row
  gradient and fixed desktop width. Its workspace keeps a separate token; white
  working surfaces, action blue and semantic money colours retain their roles.
  This scoped commitment does not adopt the neutral or warm preview palettes.
- Voice: plain, from the user's side of the counter; no accounting jargon.
- Kitchen module structure (owner, 2026-10-04, after a round of seven
  alternatives): the category standard, played straight: totals on top, the
  four actions as buttons, today's list, five tabs. The finish bar the owner
  named is Swipe (getswipe.in), the billing app the client already uses:
  friendly, uncluttered cards on a light ground, one blue for every action,
  large type for money, WhatsApp as the share path, "done in ten seconds"
  entry. No irony, no smuggled novelty; the craft goes into the states,
  spacing, type and copy.

## Evidence on Hand

- Real menu, branches and recipes exist in the database (the recipe workbook
  is private and must never be committed or published).
- A clickable demo of the kitchen module's flows (approved by the owner on
  2026-10-04) is the agreed workflow reference; its source is outside the
  repository.
- No testimonials, benchmarks or marketing claims exist; none may be
  invented.

## Product Principles

1. Record it in the moment: every everyday entry is one screen, large
   targets, numbers you can type with one thumb.
2. Figures the owner can trust without matching: balances fall out of the
   entries; matching is optional and never changes a total.
3. Say it the way the kitchen says it: branch names, item names, "yet to
   pay", never system vocabulary.
4. Nothing is lost: entries are voided, not deleted; stock moves only
   through recorded entries.
5. One app, one build: the kitchen is a login inside Le Laban's app, not a
   second product.

## Accessibility & Inclusion

Phone use in a working kitchen: minimum 44 px targets, 12 px text floor, high
contrast on the blue canvas, labels on every input and icon button, and
nothing that depends on hover. English UI today; Tamil labels are a possible
later need and copy should not assume English word order in layout.
