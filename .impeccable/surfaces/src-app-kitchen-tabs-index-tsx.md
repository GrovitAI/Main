---
version: 1
slug: "src-app-kitchen-tabs-index-tsx"
primary_target: "src/app/central-kitchen/(tabs)/home.tsx"
related_targets: ["src/app/central-kitchen/send.tsx","src/app/central-kitchen/received.tsx","src/app/central-kitchen/bought.tsx","src/app/central-kitchen/spent.tsx","src/app/central-kitchen/(tabs)/items.tsx","src/app/central-kitchen/(tabs)/branches.tsx","src/app/central-kitchen/(tabs)/vendors.tsx","src/app/central-kitchen/(tabs)/history.tsx"]
---

# Central Kitchen screens

Scope: the `central-kitchen` route group: Home, Send, Received, Bought, Spent, Items, Branches, Vendors, History, item and name detail pages. Visitor mode: Operate.

Audience and job: the kitchen manager, on their own phone between batches, recording what was sent, received, bought and paid, and checking what each branch still owes. Owner and admins open the same screens from Settings.

Proof/content: real items, branches and vendors the kitchen types in; figures from `kitchen_party_balances`; entries from `kitchen_entries`. Nothing invented on screen; empty states teach the first entry.

Constraints: one app, one build (iPhone, Android, tablet, web for the owner); Le Laban palette and NativeWind tokens; 44 px targets, 12 px text floor; no matching required for a figure to be right; entries voided, never deleted; search on every list and picker.

Memorable moment: a send that ends in a slip the branch can be sent on WhatsApp, and a vendor payment where ticking his open buys fills the amount.

## Direction contract

Blue frame extension (2026-10-09, task 172): the user selected the task 171 direction and explicitly required the existing POS left-sidebar scheme and design. This scoped extension supersedes the earlier canvas/rail descriptions: workspace roots use `colors.kitchenCanvas` (`#e3ecf5`), while control wells keep `surfaceTint`. Desktop 176px and tablet 88px rails share the exact POS backdrop (`#0251b8` → `#013b8c` → `#012f70`), translucent selection (`rgba(58, 120, 220, 0.95)` → `rgba(35, 95, 190, 0.95)`), three 0.08-opacity ring outlines, white/muted-white labels, translucent hover and white focus border. Le Laban heads the rail; Central Kitchen is the desktop footer. A bounded FlatList lets short windows reach all six sections. Phone Home/Analytics/Items/History/More and its white More list remain the navigation contract. White working surfaces, Source Sans 3 (task 170), semantic figures, exact amounts and compact report density persist. This is The Kitchen Ledger with a rail-only gradient exception, not adoption of the neutral/warm worlds or other proposed Blue frame colours. Independent scoped browser/source review returned Ship after short-window clipping was resolved; native appearance, text scaling and hardware remain unverified. See docs/KITCHEN_BLUE_FRAME.md and DESIGN.md for normative tokens.

Blue frame refinement (2026-10-10, task 173): supersedes task 172's text header, canvas, selected gradient and fixed desktop width. Reuse the existing POS logo (`assets/images/le-leban-logo.png`), match Kitchen Canvas to the POS/Orders `#f5f8fc` canvas and use flat `rgba(255, 255, 255, 0.14)` Kitchen selection. Desktop web (1024px+) defaults to 64px icons; hover/keyboard focus opens a 176px overlay without report shift, with optional pinning that reserves 176px. Pointer tab clicks do not latch keyboard expansion; the 200ms width transition respects Reduce Motion. Tablet/native retains the 88px labelled rail; phones retain five controls and More. Exact POS backdrop/rings and bounded six-section FlatList persist. Typecheck/lint/18 route-load checks passed; five mocked browser sizes forwarded zero cloud requests (100 fulfilled locally). Scoped finish review returned Ship after the modality correction; native hardware/text scaling/dark appearance/gestures remain unverified. Current authority: docs/KITCHEN_BLUE_FRAME.md and DESIGN.md.

THESIS: The category standard, played straight: this month's money on top, the four verbs as buttons, today's entries beneath, five tabs. It refuses nothing the kitchen manager expects and adds nothing they must learn; the one idea it owns is that a figure is never wrong for want of matching.

OWN-WORLD: Le Laban blue (#0066b2) as the only action colour on a pale blue canvas (#e8f2fa) with white cards; money in green, money out red, buys amber, stock neutral, from brand.ts `semantic`. System sans, 28 px screen titles, 22 px figures, 15 px rows, 12 px floor, tabular numerals. Rounded 16–18 px cards, hairline borders, no shadows except the floating action. Chips for every choice; one filled button per screen.

STORY: The manager opens the app and sees, without a tap, what came in and went out this month, what branches still owe and what the kitchen owes. One tap records anything that happened; a send ends in a shareable slip; a payment can tick the buys it covers. Names and items are lists they keep themselves, each searchable.

FIRST VIEWPORT: "Central Kitchen" with today's date; a card "This month" with Money in (green), Money out (red), Sent to branches, Bought as a 2×2; two tiles "Branches yet to pay" and "We owe vendors" that open those lists; a 2×2 of action buttons Send, Received, Bought, Spent with one-line captions; "Today" with the day's entries or a one-line empty state; bottom tabs Home, Items, Branches, Vendors, History. Primary action: the four buttons, Send first.

FORM: Canon, the category standard; the user's standing exit from the surface round (seed 9ef00ed7), chosen over the roll's lead (candidate 7, weigh-scale entry) and the winning challenger (challan book). The roll's printed receipt: "approved pool: c3b204a1eed6; 306/564 human-approved; rerun with --scope surface --mode operate --from 9ef00ed7 --candidate-count 7 to reproduce this roll against this catalog revision". Finish bar: Swipe (getswipe.in). Signature interaction: the slip sheet after a send, and open-buy ticks that fill the payment amount. Motion grammar: 180 ms fades and the sheet rising from the bottom edge on a phone; nothing decorative.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Unresolved

Day-one balances (start at zero or enter what is owed); slip as text or PDF; Tamil labels later.

## History extension (2026-10-10, task 174)

Scope: `src/app/central-kitchen/(tabs)/history.tsx` and its audit row/detail,
shared report selectors and local history utility. This is an ordinary extension
of the incumbent Kitchen Ledger, with no new world or design tokens. Task 170's
Source Sans 3 and task 173's POS workspace canvas, logo and blue rail remain
the current expression.

THESIS: An entry's origin and state are understandable at a glance: who
recorded it, its business date, its recorded India time and whether it is active,
corrected, replaced or voided. All includes every state in the loaded window;
voiding preserves the record while removing its contribution to figures.

OWN-WORLD: The incumbent compact ledger: white rows, hairline separators,
blue controls, semantic/tabular amounts, Source Sans 3 and the shared POS
canvas/rail. Desktop metadata sits horizontally; phone metadata wraps.
Measured sample desktop rows are 85 px, or 105 px with a replacement/void audit
line; these observations do not prescribe fixed heights for future content.

STORY: Scan the ledger, spot a correction or removal, narrow by any combination
of type, status, creator, text and dates, then open its detail. A corrected
entry identifies its editor/time and shows “Before this edit” when the earlier
version is cached; otherwise it explicitly says that version is outside the
loaded history window. Unknown legacy void actors are not invented.

FIRST VIEWPORT: History header and Refresh, search, collapsed Filters beside
an explicit Sort by value, matching/loaded count, the recent-history scope,
then rows. Default sort is Transaction date · newest; newest/oldest Entry date
and Transaction date remain available. The inclusive calendar chooses either
business dates or recorded India days. Clear filters retains the chosen sort.
Loading, empty, no-match and safe service-error states support recovery.

FORM: Category-conventional, virtualized ledger with its header and rows in
one scrolling FlatList. Compact labelled selectors reuse report components.
Filtering/sorting is local to the existing cache of up to 500 entries from the
last 92 transaction days; controls do not fetch a full archive, issue a new query or regroup
the selected sort. No compositional experiment or new imagery was needed.

FINISH: Typecheck, changed-file lint and 63 focused tests (19 route-load checks)
passed. Actual Expo staging browser evidence covers 1440×900, 800×700,
390×844 and 320×700, all sorts/statuses, composed filters/date bases, no-match
recovery, before-edit detail and loading/empty/error/refresh states. The final
mocked run fulfilled 89 cloud-targeted requests locally and forwarded zero,
with websockets blocked and no live-cloud writes. All measured frames have
no horizontal overflow. The scoped independent review's sole material
Refresh-width fix was measured at 48×48 on all four sizes, scored resolved,
and returned Ship. This is browser/source signoff for the extension, not a
new whole-surface review or native hardware signoff; the native detector was
skipped and text scaling, dark appearance and gestures remain unverified.
No migration or production deployment. See `docs/KITCHEN_HISTORY.md` and
`.impeccable/review/history-results.json` for behavior and retained evidence.

Not canonized or repaired: the early base contract's system font, older canvas,
floating-action exception and pre-Analytics first viewport, plus incumbent
DESIGN prose about system sans and chips for every choice, predate the shipped
font/rail/report controls. Existing task 170/173 authority and the scoped
History behavior above take precedence; a global documentation refresh is
outside this task.

## Stock extension (2026-10-10, task 175)

Operate-mode extension of the incumbent Kitchen Ledger. Raw materials and
Finished goods share StockItems and the existing ItemDetail rather than a new
visual world. Source Sans 3, task 173's canvas/logo/blue rail, white surfaces,
brand tokens and existing controls remain authoritative; DESIGN.md and its
sidecar are preserved.

Desktop/tablet rails now expose seven sections: Home, Analytics, Raw materials,
Finished goods, Branches, Vendors and History. Phones keep Home, Analytics,
Stock, History and More; Stock contains the two stock panes. This supersedes
the earlier six-section rail and Items label only. A searchable FlatList and
wider master-detail layout retain the existing stock workflow. Raw materials
offer counts; finished goods offer produced-quantity batches and counts, with
no recipe or ingredient consumption. Item type is independent of price.

Loading, no items, search no-match and unavailable stock are distinct. Failed
posting retains the input; initial load failure explicitly preserves existing
records and offers Retry stock. The scoped reviewer scored this recovery fix
resolved/Ship after its phone capture was updated. Browser evidence covers
1440×900, 800×700, 390×844 and 320×700, with no overflow; 368 requests were
mocked locally with zero forwarded. Typecheck, changed-source lint and 70 tests
(22 route imports) passed. Scoped staging SQL verifies batch/count/void and
branch isolation using rolled-back fixtures. Native hardware, scaling,
keyboards, dark appearance and gestures remain unverified. No production
deployment. See docs/KITCHEN_STOCK.md for the approved migration, preserved
legacy scope, usage budget and rollout boundary.

## Attendance extension (2026-10-10, task 176)

Scope: `src/app/central-kitchen/(tabs)/attendance.tsx`, AttendanceDate,
attendance types/utils/service and the Kitchen navigation entry. Operate-mode
extension of The Kitchen Ledger, preserving the incumbent design files and
tokens. No new comp, concept seed or QUALITY BAR is needed for this precisely
specified local addition.

THESIS: A daily register of manual marks keeps Present, Absent, Half day and
Leave distinct from Unmarked. The roster is maintained for attendance and does
not grant app access or create Auth accounts.

OWN-WORLD: Source Sans 3, shared POS blue navigation and canvas, quiet white
working surfaces, existing blue selections, hairline row dividers and compact
ledger density. No new global colour, type, asset or component system.

STORY: Add the roster, choose an India day through today, mark a status, add an
optional note, correct or clear a mark, and archive or restore staff. Recorded
days survive archive; the server owns the latest editor and time. Feedback
waits for confirmed writes and failed input stays available for recovery.

FIRST VIEWPORT: Attendance title and Add staff, Daily register/Staff switch,
India date with previous/next/calendar, five status counts, name/role search,
Refresh and compact staff rows. Unmarked is shown explicitly. Loading, empty,
search no-match and unavailable register have distinct recovery states.

FORM: One FlatList for the header and rows. Desktop exposes the four status
choices inline; phone/tablet rows disclose choices and notes. A flat inline
name/role form keeps the roster task within the register. Desktop/tablet rails
now have eight direct sections; phones retain Home, Analytics, Stock, History
and More, with Attendance, Branches and Vendors in More. This supersedes the
earlier seven-section task 175 navigation count only.

FINISH: Typecheck, lint with zero errors/existing warnings, 30 local
attendance/route checks, the broader 297-test/32-suite regression run and a
55-route web export passed. Browser evidence covers 1440×900, 800×700, 390×844
and 320×700, with 15 states, no page errors or horizontal overflow. The final
mocked run fulfilled 87 cloud-targeted requests locally, forwarded zero and
recorded five sample writes; websockets were blocked. A focused actual staging
read confirmed the empty register loads without a migration error. Both
attendance migrations were applied and verified one at a time in staging;
rollback-only SQL checks cover scope, grants, actor/identity, person/day,
future-date and archive behavior. Production remains unchanged.

The independent finish reviewer's flat staff-field correction was scored
resolved/ship. That verdict covers the named correction and browser/source
extension, not a whole-platform security audit or native-device signoff.
Native hardware, text scaling, keyboards, dark appearance and gestures remain
unverified. See `docs/KITCHEN_ATTENDANCE.md` and the retained local
`.impeccable/review/attendance-*` evidence.

Comparison checked the finished attendance source, date selector, shared
Kitchen primitives, Typography, brand tokens, DESIGN.md, design.json and
desktop/phone/form/small-phone captures. Both incumbent design files remain
untouched. Their pre-existing system-sans, chips-for-every-choice and older
navigation prose, and the original surface font/canvas/first viewport, were
reported without repair. Impeccable context also reports the optional
`config.json` buildPath choice unset; it was not changed by this extension.

## Attendance HR roster refinement (2026-10-10, task 178)

Scope: `src/app/central-kitchen/(tabs)/attendance.tsx` only for implementation.
This is a narrowed existing-surface refinement in staging, preserving the
incumbent system. The user's request for high-end HR-tool inspiration was
interpreted from Personio and BambooHR's primary attendance product pages as
roster clarity and task focus, without copying or asserting feature parity.
No new visual world, comp, concept seed or QUALITY BAR was needed.

THESIS: A daily HR roster makes unmarked staff easy to find and manually mark.
Present, Absent, Half day and Leave remain distinct from Unmarked. The roster
does not create app logins, payroll or clock-in automation.

OWN-WORLD: Incumbent Source Sans 3 and POS blue navigation, quiet white rows,
hairline dividers and data-derived initials; initials disappear below 360px
to preserve room for names. No new shared tokens, assets or visual identity.

STORY: Choose the India day and local filter, mark attendance, inspect or add
a note and the latest server-recorded actor/time, then maintain the roster.
Service queries, tenant/branch enforcement, confirmed writes and polling are
unchanged.

FIRST VIEWPORT: Slim Attendance title with Add staff/Refresh, underline Daily
register/Staff tabs, date and search, local All/Unmarked/Present/Absent/Half day/
Leave count filters and marked/total completion, then roster rows. Phone/tablet
search discloses beside the date and remains visible while a query is present.
No-match recovery offers Reset filters to clear query and return to All.

FORM: Desktop aligns Staff member, four inline choices (320px), latest
editor/time (168px) and Notes control (48px). Phone/tablet retains status
disclosure; expanded rows contain choices, latest actor/time, note and clear
actions. Typical collapsed phone rows measured 65px; long names or notes may
wrap taller. One main FlatList owns the register/header; count filters scroll
in a horizontal FlatList. Existing staff editor and active/archive panes remain.

FINISH: Final typecheck, changed-source lint and 30 attendance/native-route
checks passed. Sixteen mocked captures cover 1440×900 desktop, 800×700 tablet,
390×844 phone and 320×700 small phone. All have no reported page errors or
horizontal overflow. Unmarked/Absent/All filters returned the correct rows
locally without added requests; staff, note, clear, archive, calendar and
loading/empty/error recovery were exercised. The run fulfilled 87 requests
locally, forwarded zero and recorded five mock writes. The results' 17 facts
are 16 capture facts plus one row-height/local-filter fact, not 17 captures.
A focused read of the existing staging session confirmed the refreshed UI
with a user-entered staff record; no user records were altered by testing.
No service/query/schema/polling changes, new cloud log scan or production
deployment. Evidence: `.impeccable/review/attendance-hr-results.json`,
`attendance-hr-*.png` and `docs/KITCHEN_ATTENDANCE.md`.

The fresh independent reviewer returned Ship in all five sections, with no
material fixes. Verdict scope is this source/browser refinement; native
hardware, text scaling, soft keyboards, dark appearance and gestures remain
unverified.

Comparison checked source, shared Kitchen primitives, Typography, brand tokens,
DESIGN.md, `.impeccable/design.json` and desktop/phone captures. Frontmatter
already records SourceSans3; prose and sidecar specimens still contain system
sans, every-choice chips and older navigation guidance. The early surface
font/canvas/first-viewport contract also predates current authority. These are
pre-existing documentation drift, reported without repairs. Both incumbent
design files and global tokens remain untouched.

## Task 179 direction contract — month overview and History refinement

This is a scoped extension of the incumbent Operate surface, not a replacement
visual world. The user requested monthly manual attendance and less awkward
History spacing on desktop and mobile. No new comp, seed or QUALITY BAR applies.

THESIS: See a month's attendance per staff member and manually mark individual
days without implying that unmarked means absent or scheduled work.
OWN-WORLD: Source Sans 3, incumbent POS blue rail, kitchen canvas, quiet flat
rows, hairline dividers and shared Kitchen controls; no new tokens or assets.
STORY: Choose Month overview, navigate the month, select staff and a calendar
day, choose a status/note and explicitly save. Future days stay unavailable.
FIRST VIEWPORT: Daily register/Month overview/Staff tabs, bounded month controls,
then staff totals. Desktop pairs a 352px staff list with the calendar; phone
opens the selected person's calendar with a Back control. History groups the
particular and amount before separate audit information.
FORM: Responsive master/detail calendar instead of a horizontally scrolling
31-column grid. One local draft is protected until Save day or Cancel edit.
History retains all audit fields, filters, sorts and detail-sheet behavior.
FINISH: unreviewed and undocumented is unfinished; this build ends with the
finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

Task 179 verdict: **Ship**. The fresh independent finish reviewer returned Ship
in all five contract sections with no material fixes after inspecting the
scoped source and retained main/state captures. This covers the existing
browser/source extension; native hardware, text scaling, soft keyboards, dark
appearance and gestures remain unverified. Existing design authority and task
178 history remain.

## Task 179 completion record (2026-10-10, staging only)

Month overview shows per-person Present/Absent/Half day/Leave/Unmarked totals.
Active staff counts include every calendar day through India today, including
days before roster creation; these are not employment, scheduled-workday or
payroll figures. Archived staff count existing records only and can correct
only recorded days. Future dates are disabled. Each individual date uses an
explicit status/note Save day, Cancel edit or Clear attendance day; clear
confirms Unmarked rather than deleting. No bulk month autofill. Dirty drafts
and saves guard local staff/day/month/Back/refresh/pane changes; this is not a
global route guard.

Desktop month controls/staff list occupy 352px beside calendar detail; phones
open the selected calendar with Back. The existing scoped day upsert/table is
reused. Month fetch starts with two scoped reads, adds 1,000-row attendance
pages only when needed, uses exclusive next-month/inclusive India-today bounds
and deterministic date/ID ordering, and fails rather than showing partial
totals. Daily fetch is skipped while monthly; no new polling or schema.

History groups particulars and amount/status within 58% of the desktop row,
then separates audit information. Phone rows use a divided audit footer with
creator, transaction date, recorded IST time and replacement/void information.
Filters, sorts, details, existing service and 500-entry/92-day window remain.
Typical sample rows are 85px desktop/122px phone; wrapped content grows taller.

Final typecheck, changed-source ESLint and 304 tests in 33 suites passed,
including 23 native route imports. Twenty month captures and 19 History
captures cover 1440×900, 800×700, 390×844 and 320×700, main states and recovery,
with no reported page errors or overflow. Month/History runs fulfilled 92/89
requests locally and forwarded zero; the three attendance writes were mocked.
Focused reads of the existing live staging session confirmed both routes in
the user's 319×668 panel; no live records were changed. The existing 10 October
usage baseline was reused, with no new log scan. Evidence is under
`.impeccable/review/attendance-month-*` and `history-*`; see
`docs/KITCHEN_ATTENDANCE.md` and `docs/KITCHEN_HISTORY.md`.

Comparison checked scoped source, shared Kitchen primitives, Typography, brand
tokens, PRODUCT.md, DESIGN.md, `.impeccable/design.json` and desktop/phone
captures. Source Sans 3, POS blue navigation, Kitchen Canvas, quiet white rows
and hairline dividers remain the incumbent system. DESIGN.md, sidecar and
tokens remain untouched. Existing system-sans prose/specimens, every-choice
chips, older navigation and early surface font/canvas/first-viewport drift is
reported without repair. No new shipping raster assets or production
deployment. The HTML/CSS detector does not apply to this React Native source.

## Task 180 direction contract — History controls

Scoped Operate refinement of the incumbent system; no new world, comp or seed.
THESIS: Search, filter disclosure and sorting form one coherent history toolbar.
OWN-WORLD: Existing Source Sans 3, POS blue, kitchen canvas and quiet bordered
48px controls. No token, navigation, ledger-row or data-behavior replacement.
STORY: Search locally, disclose the existing filters, choose one of the same
four date/order sorts; preserve active-filter count and clear/recovery behavior.
FIRST VIEWPORT: Desktop has search then Filters and a single-line sort trigger
on one row. Phones have full-width search followed by matched-height Filters
and sort buttons. Sort shows its date basis and direction icon; its accessible
label and picker retain the full selected source/order wording.
FORM: Responsive toolbar with one-line compact sorting; the shared selector's
existing field presentation remains the default everywhere else.
FINISH: unreviewed and undocumented is unfinished; this build ends with the
finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

Task 180 verdict: **Ship** for the sole correction. The first review found
narrow-phone sort wrapping and active-count layout. Shortening the mobile
label to Transaction resolved it; the retained harness now asserts matched
48px controls with active counts. The reviewer scored the fix resolved and
found no fix-induced regressions. This does not claim fresh whole-surface
approval. Desktop keeps a 220px sort trigger; full accessible/picker wording
and all four choices remain. The optional `ReportSelect` toolbar presentation
leaves default report fields intact; rows, data, filters, queries, store and
polling are unchanged.

Final typecheck, changed-file ESLint and 35 tests/two suites (23 native route
imports) passed. Nineteen mocked captures at 1440×900, 800×700, 390×844 and
320×700 cover filters/sorts, audit/details, no-match reset and loading/empty/
error recovery; 89 requests were fulfilled locally, zero forwarded, and local
filters made no queries. Evidence: `history-toolbar-results.json` and
`history-toolbar-*.png` under `.impeccable/review/`. The existing user staging
History read at 319×668 confirms both buttons at 48px in
`history-toolbar-live-staging.png`, without Refresh or writes.

Source Sans 3, POS blue navigation, Kitchen Canvas, DESIGN.md, design.json and
tokens remain unchanged; the pre-existing documentation drift above is
reported without repair. No new assets, schema, migration or production
deployment; eight migrations remain staging-only. The HTML/CSS detector was
not used for this native source. Native hardware, text scaling, soft keyboards,
dark appearance and gestures remain unverified. See `docs/KITCHEN_HISTORY.md`.

## Task 181 direction contract — expanded History filters and placeholders

Scoped incumbent Operate refinement; no new visual world, comp or concept seed.
THESIS: Expanded filters read as an organized form, with entry details separate
from dates and enough width for each choice.
OWN-WORLD: Source Sans 3, existing POS blue/Canvas and quiet outlined 48px
controls; the approved toolbar and History rows are preserved.
STORY: Disclose Filters, combine Type/Status/Entered by with date basis/range,
then collapse or clear using existing controls. All filtering stays local.
FIRST VIEWPORT: Desktop uses an Entry details group with three fields beside
a bounded Dates group with two aligned fields. Tablet groups stack with fields
in rows; phones stack both groups and full-width fields.
Field labels sit above their controls instead of inside tinted tiles.
FORM: Grouped inline panel preserves current immediate filtering and picker
behavior. Concise status display retains full picker/accessibility wording.
Textual web placeholders become 14px regular; entered text and numeric inputs
retain their sizes, including the existing mobile 16px input rule.
FINISH: unreviewed and undocumented is unfinished; this build ends with the
finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

Task 181 verdict: **Ship** from the fresh independent finish review, with no
material fixes or recaptures across all five contract sections. The reviewer
opened all 25 required images and inspected the four changed sources. Labels
above white outlined 48px controls organize Entry details and Dates; desktop
groups sit side by side, tablet groups stack with field rows from 640px, and
phones stack full-width fields. Concise status triggers preserve full picker/
accessibility wording. Shared outlined presentations default false. Textual
web hints are 14px/400; entered search retains 15px desktop/16px phone, numeric
input modes and number inputs are excluded, and native placeholders remain.

Final typecheck, changed-file ESLint and 44 tests/three suites (23 native route
imports) passed. Twenty-three mocked captures at 1440×900, 800×700, 390×844 and
320×700 cover main/filters/dates/earlier-version details/no-match plus phone
loading/empty/error recovery. The run fulfilled 89 requests locally with zero
forwarded, no writes/errors/overflow or measured sub-44px targets, and no
filter requests. Main and picker computed hints were 14px/400. Two read-only
captures of the existing 319×668 staging session confirm the form, reachable
Dates and 16px entered text/14px hint, without Refresh, writes or log scans.
The same-day usage baseline was reused; the mocked request claim does not
cover all live staging session activity. Evidence: `history-filter-groups-*`
and `check-kitchen-history-filter-groups.cjs` under `.impeccable/review/`;
see `history-filter-groups-finish-review.md` and `docs/KITCHEN_HISTORY.md`.

The toolbar, audit rows, local filter/sort/reset/details, 500-entry/92-day
scope, services, queries, store and polling remain. Source Sans 3, POS blue,
Kitchen Canvas, DESIGN.md, sidecar and tokens retain incumbent authority;
existing system-sans/specimen, choice-chip, navigation and early-contract
drift is reported without repair. No new shipping raster, schema, migration
or production deployment; eight migrations remain staging-only. The HTML/CSS
detector was not applied to React Native source. Native hardware, text
scaling, soft keyboards, dark appearance and gestures remain unverified.

## Task 182 direction contract — hover and calendar boundaries

Scoped incumbent Operate refinement; preserve Source Sans 3, POS blue/Canvas,
filter groups and ledger density. No new world, comp, seed or assets.
THESIS: Neighbouring options and dates remain visually distinct under hover.
FIRST VIEWPORT: Report picker rows have quiet rounded, padded surfaces and
4px separators; selected and hovered choices retain separate boundaries.
Calendar cells preserve their full tap area with a 2px inset highlight on each
side, 48px height, stable inside focus border and distinct range/hover tones.
STORY: Select filters or draft inclusive start/end dates; Cancel discards the
draft and Apply commits locally as before. Future days stay disabled. No cloud
query, service, schema or polling changes; staging only.
FINISH: unreviewed and undocumented is unfinished; this build ends with the
finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
Task 182 verdict: **Ship** from the fresh independent finish review, with no
material fixes or recaptures across all five sections and all 21 inspected
images. Padded rounded picker rows retain 48px targets and 4px separators;
selected Surface Tint/check and Accent Soft hover remain distinct. Calendar
full-cell targets retain 48px height, with non-interactive highlights inset
2px on each side, 4px visual gaps and stable inside focus borders. The old
date bounds were already separate; touching backgrounds caused the apparent
overlap. Outlined/toolbar hover uses existing Accent Soft. Only shared
ReportSelect and ReportDateRange changed; other callers inherit the visual
refinement with their existing callbacks, including Analytics fetching.

Final typecheck, changed-file ESLint and 44 tests/three suites (23 native route
imports) passed. `history-hitboxes-results.json` and
`check-kitchen-history-hitboxes.cjs` retain 20 mocked captures across 1440×900,
800×700, 390×844, 320×700 and 370×668, checking hover/focus geometry, disjoint
date targets (0.1px tolerance; at least 44px wide and 48px high), disabled
future/invalid ranges, Cancel reset, Apply/Clear, status and sorting. The
History harness fulfilled 61 cloud-targeted requests locally, forwarded zero
and reported no errors/unexpected hosts or filter requests. The existing live
calendar was opened and Cancelled without Apply, Refresh or writes;
`history-hitboxes-live-calendar.png` is 369×668 although the DOM reported
370×668. The user's tab and server were preserved. One batched implementation
visual round plus the fresh review sufficed; see `history-hitboxes-finish-review.md`.

Comparison with PRODUCT, DESIGN, sidecar, brand tokens, Typography/ui and
desktop/phone captures preserves the incumbent Source Sans 3, POS blue/Canvas,
filter groups and ledger density. Design files/tokens remain untouched; the
existing system-sans/specimen, choice-chip, navigation and early-contract drift
is reported without repair. History date semantics, grouping, rows, queries,
store and polling remain; no service/schema/migration or production change,
and eight migrations remain staging-only. No shipping raster was added.
The HTML/CSS detector was not applied to React Native source. Native hardware,
text scaling, soft keyboards, dark appearance and gestures remain unverified.
See `docs/KITCHEN_HISTORY.md`.

## Task 183 direction contract — compact phone History filters

Scoped incumbent Operate refinement, driven by the user's expanded-panel height
feedback. Preserve the desktop/tablet groups, Source Sans 3, POS blue/Canvas,
hover/calendar boundaries, full picker wording and local History behavior.
FIRST VIEWPORT: Below 640px, five full-width rows use labels beside values,
44px minimum targets, 6px gaps and 8px panel padding. Group titles are redundant
with those inline labels on phones; a divider still separates date controls.
Date basis retains the full accessible/picker name; Any dates truthfully means
no date filter within the disclosed loaded window. Longer choices may wrap.
STORY: Open Filters, combine choices/dates, clear or collapse. Calendar draft,
Cancel/Apply, sorting, audit rows and the bounded loaded scope are preserved.
Optional inline-label presentation keeps other shared callers unchanged.
No services, queries, schema, polling or production changes; staging only.
FINISH: unreviewed and undocumented is unfinished; this build ends with the
finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
Task 183 verdict: **Ship** from fresh independent review of all five contract
sections and 33 mocked captures plus live, without material fixes, recapture
or rebuild. Long choices wrap without crowding after the inline wrapper
correction. Desktop/tablet grouped 48px controls, shared defaults, full names,
local filtering/sorting, date drafts/Cancel/Apply, rows, details and scope remain.

Final typecheck, changed-source ESLint and 44 tests/three suites (23 native
route imports) passed. `history-mobile-filters-results.json` and
`check-kitchen-history-mobile-filters.cjs` retain six states at 1440×900,
800×700, 390×844, 320×700 and 370×668, plus phone loading/empty/error. The run
fulfilled 100 cloud-targeted requests locally with zero forwarded/errors/
unexpected hosts/writes/History filter requests. Date application was checked;
`-dates` images show scrolled triggers, not a calendar. The existing staging
default panel is 46.1% shorter (546.4→294.4px). `history-mobile-filters-live.png`
is 369×668 (DOM 370×668); only part of the first row is visible. No live
Refresh, Apply or write occurred. The default capture preceded the wrapper
correction; final mocked long-staff captures verify it. Two build inspection
batches included that correction before this fresh review; see
`history-mobile-filters-finish-review.md` and `docs/KITCHEN_HISTORY.md`.

Comparison with PRODUCT, DESIGN, design.json, brand, Typography, shared controls
and representative captures preserves incumbent Source Sans 3, POS blue/Canvas
and ledger density. Design files/tokens and previously disclosed drift remain
untouched. No service/query/store/polling/schema/migration or production change;
eight migrations remain staging-only. Ignored local QA adds no shipping asset.
No HTML/CSS detector was used for React Native. Native hardware, text scaling,
soft keyboards, dark appearance and gestures remain unverified; browser
44px/6px checks do not establish Android 48dp/8dp conformance.

## Task 184 preview comparison (2026-10-11)

Local conversation exploration only: Balanced grid is the recommended 2×2
Type/Status/Staff/Date basis arrangement with a full-width date range; Paired
rows favours long staff names; Filter sheet adds Done/Close disclosure. All
retain Source Sans 3, POS blue/Canvas and five filter meanings. Sample entries
and October dates are fixtures; dark mock-host appearance approves no product
theme. Selection was pending at presentation, with task 183 then implemented;
the subsequent Filter sheet selection is implemented in task 185 below.

Evidence: `history-filter-design-results.json` and
`history-filter-design-previews-finish-review.md` under `.impeccable/review/`;
artifact path is recorded in `docs/KITCHEN_HISTORY.md`. Twelve local captures
report zero Supabase requests/errors/blocked requests/overflow/sub-44px targets;
the initial HTML/CSS detector is empty. **Ship** permits presenting the local
previews after the sole cross-month/year date-label fix was scored resolved
with no fix-induced visual regression; it does not certify the whole surface
or approve implementation/deployment. Mock heights/row counts are not real-app
measurements. Incumbent design authority, tokens, source and recorded drift
remain untouched; ignored screenshots add no shipping assets.

## Task 185 direction — selected phone History filter sheet

The user selected Filter sheet. On phones below 640px, Filters opens above
History instead of inserting controls into the list. Four existing choices
form a compact 2×2 grid; date range remains full width. Done, close, backdrop
and platform Back dismiss the sheet while retaining local choices. Reset
clears the existing filter/search fields while retaining sort. Date-picker drafts still
require their own Apply. Bound and scroll the form on short screens while
keeping 48px close/Reset/Done targets and a safe-area footer visible.
Preserve desktop/tablet controls, all five filter meanings, audit rows,
Source Sans 3, POS blue/Canvas and existing picker hover/calendar behavior.
No service/query/store/polling/schema or production changes.
Task 185 verdict: **Ship**, from fresh independent review of the staging browser
composition and inspected React Native source, with no material fixes,
recapture or rebuild. The selected preview is a composition reference, not a
pixel comp. Desktop/tablet inline groups, History toolbar/audit rows, local
bounded filters/sorts and shared picker/calendar meanings remain.

The static four-choice/date form uses ScrollView with no mapped list, avoiding
nested virtualized-list context that blocked web picker/calendar scrolling;
record, picker and calendar lists remain FlatList. At 390×420, the form scrolls
and Done stays at y=360 with a 48px height in open/long-staff/dates captures.
The checked 640px transition preserves disclosure; the existing tablet-shell
remount resets local screen state outside this task's persistence guarantee.

Typecheck, changed-file lint and 44 tests/three suites (23 native route imports)
passed. Forty-five final-source captures cover seven states at 1440×900,
800×700, 390×844, 320×700, user 370×668 and short 390×420, plus phone
loading/empty/error. Five viewport batches passed before a server interruption
at sixth navigation; resumed short-phone/breakpoint/state checks passed with
61 mocked cloud-targeted requests and zero forwarded/errors/unexpected hosts.
That persisted count is for the resumed batch only; the earlier aggregate was
not retained. All captures use identical final source. Evidence and finish
review are under `.impeccable/review/history-filter-sheet-*`; see
`docs/KITCHEN_HISTORY.md` for checked flows and evidence limits.

Source comparison preserves Source Sans 3, POS blue/Canvas and quiet outlines.
DESIGN.md, design.json and brand.ts hashes match the handoff baselines; existing
system-sans/specimen, choice-chip, navigation and early-contract drift remains
reported without repair. No shipping raster, service/store/polling/schema,
migration or production change; eight migrations remain staging-only. Staging
restarted on 8081 (API 8083). Live QA was omitted because the usage baseline
was old; the mock
zero-forwarded claim excludes the existing staging/HMR session. No HTML/CSS
detector ran for native source. Native hardware/simulator/emulator appearance,
soft keyboard, scaling, dark appearance, Reduce Motion and physical/predictive
Back gestures remain unverified; source safe-area/Back handling and browser
targets do not certify native insets or Android-wide 48dp conformance.

## Task 186 direction — compact attendance note actions

Polish the expanded attendance row's Save note, Clear mark and Close controls:
14px semibold labels, intrinsic widths, quieter 8px corners and matching 44px
minimum targets instead of large shared form buttons and a squeezed Save note.
Keep full labels, wrapping at larger text sizes, disabled/busy states, confirmed
save/clear behavior and existing status choices. Slightly tighten the expansion
gap; preserve Source Sans 3, tokens, roster/month screens and services. Incumbent
Operate refinement only; no new visual world, token or shipping asset.

Task 186 verdict: **Ship**, from fresh review of all five sections, eleven
captures and the scoped React Native source, with no material fixes. Compared
with `attendance-hr-small-phone-mark.png`, Save note now fits one line at
320px; all three actions retain full 14px semibold labels, intrinsic widths,
44px minimum targets and 8px gaps/corners. Primary blue and quiet outlines
preserve Source Sans 3/POS-blue authority. Confirmed-save/clear dismissal,
failure draft retention and existing busy guards remain.

Typecheck, changed-file lint and 37 tests/three suites passed. Five mocked
viewports plus failed save fulfilled 47 requests locally with zero forwarded,
two successful mock writes and no page errors; existing user/HMR sessions are
outside that claim. Evidence: `.impeccable/review/attendance-actions-*` and
`docs/KITCHEN_ATTENDANCE.md`. Product/design files, tokens and previously
recorded drift are preserved. No live database test, migration, production
change or shipping raster; no native HTML/CSS detector. Native hardware,
scaling, keyboards, dark appearance and gestures remain unverified; the
browser 44px floor does not certify Android 48dp targets.
