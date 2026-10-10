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
