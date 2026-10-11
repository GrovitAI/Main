---
version: 1
slug: "src-app-central-kitchen-money-tsx"
primary_target: "src/app/central-kitchen/money.tsx"
related_targets: ["src/components/kitchen/MoneyWorkspace.tsx", "src/app/central-kitchen/(tabs)/home.tsx", "src/lib/pos/kitchen-money-service.ts"]
---

# Kitchen cash and bank

Task 194 · 2026-10-11 · staging only · Mode: Operate.

Audience: the kitchen manager or owner checks how much is in the cash box and
in the bank, records a deposit or withdrawal, and sets opening figures. This
is an ordinary extension of the Kitchen Ledger; no new visual world applies.

OWN-WORLD: existing kitchen Card, StatTile, Segmented, Field/TextField,
DateField, PrimaryButton and GhostButton; Source Sans 3; tabular amounts; red
(out tone) only for a negative balance. No new token or asset.

FORM: a stack screen with Back, not a modal. The balance card holds two cells
(Cash in hand, Bank · UPI) with a hairline divider. The opening line sits under
it, then Move money (primary) and Set/Change opening balances (secondary). The
editors open inline below as one card, with labelled fields and the error
before the inputs. A two-column "since opening" flow line is followed by the
transfer list (FlatList rows, 64px minimum, Void with confirmation). Home gains
two tappable StatTiles under the dues row.

FINISH: mocked checks at 1440, 390 and 320px passed with zero forwarded
requests; the missing visible field labels were fixed. The design detector
found nothing. Native hardware is unverified.
