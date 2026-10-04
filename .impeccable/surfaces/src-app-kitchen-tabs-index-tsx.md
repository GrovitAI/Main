---
version: 1
slug: "src-app-kitchen-tabs-index-tsx"
primary_target: "src/app/central-kitchen/(tabs)/index.tsx"
related_targets: ["src/app/central-kitchen/send.tsx","src/app/central-kitchen/received.tsx","src/app/central-kitchen/bought.tsx","src/app/central-kitchen/spent.tsx","src/app/central-kitchen/(tabs)/items.tsx","src/app/central-kitchen/(tabs)/branches.tsx","src/app/central-kitchen/(tabs)/vendors.tsx","src/app/central-kitchen/(tabs)/history.tsx"]
---

# Central Kitchen screens

Scope: the `central-kitchen` route group: Home, Send, Received, Bought, Spent, Items, Branches, Vendors, History, item and name detail pages. Visitor mode: Operate.

Audience and job: the kitchen manager, on their own phone between batches, recording what was sent, received, bought and paid, and checking what each branch still owes. Owner and admins open the same screens from Settings.

Proof/content: real items, branches and vendors the kitchen types in; figures from `kitchen_party_balances`; entries from `kitchen_entries`. Nothing invented on screen; empty states teach the first entry.

Constraints: one app, one build (iPhone, Android, tablet, web for the owner); Le Laban palette and NativeWind tokens; 44 px targets, 12 px text floor; no matching required for a figure to be right; entries voided, never deleted; search on every list and picker.

Memorable moment: a send that ends in a slip the branch can be sent on WhatsApp, and a vendor payment where ticking his open buys fills the amount.

## Direction contract

THESIS: The category standard, played straight: this month's money on top, the four verbs as buttons, today's entries beneath, five tabs. It refuses nothing the kitchen manager expects and adds nothing they must learn; the one idea it owns is that a figure is never wrong for want of matching.

OWN-WORLD: Le Laban blue (#0066b2) as the only action colour on a pale blue canvas (#e8f2fa) with white cards; money in green, money out red, buys amber, stock neutral, from brand.ts `semantic`. System sans, 28 px screen titles, 22 px figures, 15 px rows, 12 px floor, tabular numerals. Rounded 16–18 px cards, hairline borders, no shadows except the floating action. Chips for every choice; one filled button per screen.

STORY: The manager opens the app and sees, without a tap, what came in and went out this month, what branches still owe and what the kitchen owes. One tap records anything that happened; a send ends in a shareable slip; a payment can tick the buys it covers. Names and items are lists they keep themselves, each searchable.

FIRST VIEWPORT: "Central Kitchen" with today's date; a card "This month" with Money in (green), Money out (red), Sent to branches, Bought as a 2×2; two tiles "Branches yet to pay" and "We owe vendors" that open those lists; a 2×2 of action buttons Send, Received, Bought, Spent with one-line captions; "Today" with the day's entries or a one-line empty state; bottom tabs Home, Items, Branches, Vendors, History. Primary action: the four buttons, Send first.

FORM: Canon, the category standard; the user's standing exit from the surface round (seed 9ef00ed7), chosen over the roll's lead (candidate 7, weigh-scale entry) and the winning challenger (challan book). Finish bar: Swipe (getswipe.in). Signature interaction: the slip sheet after a send, and open-buy ticks that fill the payment amount. Motion grammar: 180 ms fades and the sheet rising; nothing decorative.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Unresolved

Day-one balances (start at zero or enter what is owed); slip as text or PDF; Tamil labels later.
