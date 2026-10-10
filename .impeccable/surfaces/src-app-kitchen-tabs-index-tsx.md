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
