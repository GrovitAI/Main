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
  the Central Kitchen module's five tabs remain in force.

## Capabilities and Constraints

- Expo SDK 54, React Native 0.81, Expo Router, NativeWind (Tailwind 3.4),
  TypeScript strict; Supabase (Postgres, RLS, SECURITY DEFINER functions);
  Zustand; lucide-react-native icons. Rules in AGENTS.md: Pressable and
  FlatList, no hard-coded colours, 44 px touch targets, service layer in
  `src/lib/pos/*-service.ts`, every query scoped by tenant and branch.
- Roles: owner, admin, manager, cashier, kitchen, accountant. The `kitchen`
  role is the Central Kitchen login: it sees the kitchen module and nothing
  else; the owner and admins may open the module too.
- Kitchen module (migration `20261004000100_central_kitchen.sql`): items with a
  stock figure and an optional selling price; branches and vendors as typed
  names; entries of seven kinds (sent, received, bought, paid, spent, made,
  count); optional matching of a payment to the buys or sends it covers;
  stock moves only inside the posting function; nothing is deleted, entries
  are voided. One pot of money with the payment mode recorded (cash, UPI,
  bank), no cash-versus-bank balances. Expense categories: salaries, gas,
  electricity, rent, transport, packaging, repairs, other.
- Terminology (kitchen): *Send* (items to a branch), *Received* (money from a
  branch), *Bought* (from a vendor, paid now or pay later), *Spent* (pay a
  vendor, or an expense), *Made* (a batch adds stock), *Count* (sets stock),
  *yet to pay* (a branch's figure), *we owe* (a vendor's figure).
- Undecided: whether branches and vendors start at zero on day one or with
  what each owes today; whether the send slip stays WhatsApp text or becomes
  a PDF.

## Brand Commitments

- Name: Le Laban (the app title shows "Le Laban"; the legal entity is NS
  Traders). Logo-derived palette in `src/lib/pos/brand.ts` and
  `tailwind.config.js`: primary blue #0066b2, deep #004a8d, navy #002d5a,
  light #3399ff, canvas #e8f2fa, ink #0f2744. Semantic money colours live in
  `brand.ts` (`semantic`).
- The kitchen module keeps the same blue and feel as the rest of the app
  (owner, 2026-10-04): one family of screens, the kitchen a quieter and
  simpler member of it.
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
