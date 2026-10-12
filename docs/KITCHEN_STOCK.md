# Kitchen stock

Task 175 · 2026-10-10 · staging only

Raw materials and Finished goods now have separate stock panes. The user
selected recording produced quantity for batches; recipes and ingredient
consumption are outside this change. Production has not been changed.

## Using the panes

Desktop and tablet rails expose Raw materials and Finished goods directly.
The existing `/central-kitchen/items` URL opens Raw materials; the new
`/central-kitchen/finished-goods` URL opens Finished goods. Phones retain five
bottom controls: Home, Analytics, Stock, History and More. Stock contains a
two-option switch; Branches and Vendors remain under More.

Each pane has search, Add and a virtualized stock list. Wider screens show
the selected item's detail alongside the list; phones open its detail screen.
Selection resets correctly when switching items or panes. Loading, empty,
no-search-match and load failure are distinct states. A failed initial load
says Stock unavailable, explains that existing items have not been removed,
and offers Retry stock rather than inviting creation into a falsely empty list.

Raw materials show Count stock, with no batch action. Finished goods show
Create batch and Count stock. A batch needs a finite quantity greater than
zero and adds only that amount to the finished item's stock. Raw-material
stock is unchanged. Counts accept an explicit zero but reject a blank input.
The existing posting RPC must succeed before the editor closes or clears its
quantity; errors retain the entered value and display a safe message.

The item form has an explicit editable type. Finished goods can have an
optional default selling price, including no price; price does not determine
the stored type. Raw materials do not have that price input. Opening quantity
and price must be finite and nonnegative. Editing an item still loading waits
for its record; a missing requested item cannot become an accidental new item.

New Send forms offer finished goods; new Bought forms offer raw materials.
Selected positive-quantity lines on a historical entry remain visible while
editing even if an item was subsequently reclassified. Changing item type
does not rewrite stock or previous transactions. A batch remains a Made
ledger entry, not a separate lot with expiry or recipe management.

## Schema and rollout

`supabase/migrations/20261010055214_kitchen_item_kinds.sql` adds `item_kind`
with allowed values `raw_material` and `finished_good`. New rows default to
raw materials; the updated client explicitly writes the selected kind.
The approved backfill is restricted to Le Laban's Central Kitchen, resolving
its tenant and branch together and including both IDs in the update. Existing
items with a price or past Made/Sent activity become finished goods; others
become raw materials. Quantities and history are not rewritten.

Other tenants' legacy rows remain nullable and untouched. Reads preserve the
old price-based fallback for those rows; the batch trigger allows their legacy
null kind until their own rollout. New explicitly typed raw materials cannot
receive a Made entry. `kitchen_batch_item_check()` uses SECURITY INVOKER and
an empty fixed search path, validates an active item in the entry's tenant and
branch, and grants no anonymous execution. Existing atomic posting/voiding,
table grants and RLS remain in place; no new tables are created.

The user approved the staging scope lookup and this corrected scoped migration.
The connector's migration requests expired without execution. The signed-in
Grovit Staging SQL editor applied the reviewed SQL and migration-history record
together in one transaction; subsequent read-only checks confirmed the schema,
history record, trigger permissions and preserved stock. The existing Nutella
sauce item became finished goods with quantity 2 and its existing price intact.
The migration is listed once in `supabase/staging-pending.txt`, bringing the
staging-only list to six. Any future production promotion must coordinate this
migration with the client that writes explicit kinds; it is not authorized by
this staging task.

## Verification

- Typecheck and changed-source lint passed. The route-smoke test file has its
  existing require-style warnings, with no lint errors. Diff whitespace check
  passed.
- 70 tests across stock service, kitchen utilities, native route loading,
  History and Analytics passed, including 22 route imports. Stock tests cover
  tenant/branch scope, explicit kind independent of price, unpriced finished
  inserts, compatibility edits and safe batch errors.
- Actual Expo browser components were checked with local sample authentication
  and mocked services at 1440×900, 800×700, 390×844 and 320×700. The main batch
  and focused recovery checks fulfilled 368 cloud-targeted requests locally and
  forwarded zero. Lists, selection, batch/count validation, picker restrictions,
  search, loading, errors/retry and write-error input retention were verified,
  without horizontal overflow or page errors.
- Authenticated rollback-only SQL in `supabase/tests/kitchen_item_kinds.sql`
  confirmed raw batches rejected without changing stock, finished production
  adds quantity without ingredient consumption, void restores stock, explicit
  zero counts work, invalid kind/zero batch are rejected and cross-branch writes
  are denied. Temporary fixtures were rolled back and absence verified.
- Supabase security/performance advisors were checked once. No finding targeted
  the new trigger function. Existing unrelated search-path/definer permissions,
  policyless RLS, extension, password-protection, foreign-key and index findings
  remain outside this task; the database is not described as advisor-clean.

The independent finish reviewer requested one material correction: initial
load failure must not look like empty stock. The correction and corresponding
phone capture were reviewed and scored resolved/Ship for the browser/source
extension. Screenshots and mocked results are retained locally under
`.impeccable/review/stock-*`; they use sample data and are not production captures.
Native hardware, text scaling, soft keyboards, dark appearance and gestures
remain unverified.

Testing followed `docs/TESTING_USAGE_BUDGET.md`. The 10 October All projects
baseline for the 21 September–21 October cycle was 0.618/1 GB log ingestion and
38.653/100 GB log query. There were no log scans or new polling; essential scoped
migration checks were the live verification. Agent-created Usage/SQL tabs were
closed and the user's staging server remains available. Dashboard lag prevents
claiming exact per-test byte costs or a guaranteed monthly total.

Source Sans 3, the existing POS canvas and blue rail, quiet selected states,
shared component styles and brand tokens are preserved. No new global design
rules, assets, font packages or runtime configuration were introduced.
