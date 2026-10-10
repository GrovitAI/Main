# Kitchen History

Task 174 · 2026-10-10 · staging source only

Latest refinement: task 179 · 2026-10-10 · staging source only

History now shows who recorded an entry, when the transaction happened, when
it was recorded, and whether it was corrected or voided. The extension keeps
the existing Kitchen Ledger design and posting behavior. It adds no migration
and has not been deployed to production.

## Audit meaning

The default All view includes every state in the loaded window:

| Status | Meaning |
| --- | --- |
| Active · unedited | An entry that has not been replaced or voided. |
| Edited · current version | A corrected entry linked to an earlier version by `replaces_id`. |
| Replaced · earlier version | The earlier entry voided with the existing `Edited` reason when its correction was posted. It no longer contributes to figures. |
| Voided · removed | An entry removed from figures by voiding, including a corrected entry that was subsequently voided. The stored record remains. |

Every row shows Entered by, Transaction date, Entry time in IST and its status.
Replaced and voided rows have muted, struck-through titles and neutral amounts;
their audit line names the stored actor and timestamp. A void also shows its
reason when recorded. Missing legacy actor data is labelled “staff not recorded”
rather than assigned to the creator.

Opening a row retains the existing entry detail and edit/void actions. For a
current correction the detail identifies the editor and time. “Before this
edit” shows the previous entry's headline, amount, subline, transaction date,
creator and recorded time when that entry is in the same cache. Otherwise it
says “The earlier version is outside the loaded history window.” This is a
before-edit summary, not an exhaustive field-by-field comparison or a separate
archive lookup. Removed entries explain that they no longer count anywhere.
Deletion in this workflow means voiding; records are not physically deleted.

## Finding an entry

Search remains visible, while Filters starts collapsed. The selected Sort by
value is always visible, with Transaction date · newest as the default.
Type, status, Entered by, search and date range combine rather than replacing
one another. Spent includes expenses and vendor payments; Stock includes Made
and Count. Entered by matches the row's creator, while text search also finds
void actors and reasons, categories, names, notes, amounts and status text.

The inclusive calendar range can use either Transaction date (the business
date) or Entry date (when it was recorded). Recorded days and displayed times
use Asia/Kolkata, irrespective of the device timezone. Calendar changes remain
draft until Apply dates; Cancel dismisses the draft. Clear dates removes only
the range. Clear filters removes the narrowing conditions and retains the
chosen sort.

Four sorts are available: newest and oldest Transaction date, and newest and
oldest Entry date. Transaction sorting breaks ties by recorded timestamp;
entry sorting compares timestamp instants and then transaction dates. A stable
ID tie-breaker keeps equal records deterministic. There are no date groups
that silently reorder the selected sort.

## Loaded scope and states

This is recent history from the existing shared kitchen store: up to 500 entries
from the last 92 transaction days, including edits and voids. The header states
both the matching and loaded count, the window, and an additional warning when
500 entries are loaded. A chosen date range cannot retrieve records outside
that window, even when filtering on Entry date. The controls filter and sort
only the loaded array; they do not query a full archive or request another page.
Refresh uses the existing store refresh.

One virtualized FlatList owns the scrolling header and rows. Desktop metadata
sits horizontally where space permits; phone metadata wraps without hiding
the creator, business date or recorded time. The inherited content frame,
Source Sans 3, white ledger rows, hairline separators, exact tabular amounts,
POS workspace canvas and blue rail remain in use. Compact labelled selectors
reuse the report controls; this does not establish a new global component rule.

Initial loading uses ActivityIndicator. Empty history, no matching entries and
service failure have distinct messages. No-match states offer Clear filters;
a safe service notice and Refresh history support error recovery. Refresh is
disabled while loading and has a measured 48×48 target across the four checked
browser sizes. Pull-to-refresh uses the same refresh path.

## Implementation boundary

The main route is `src/app/central-kitchen/(tabs)/history.tsx`. Row audit metadata
is in `src/components/kitchen/HistoryEntry.tsx`; the optional previous-entry
summary is in `EntryActions.tsx`. Shared `ReportSelect.tsx` accepts compact and
required choices, and `ReportDateRange.tsx` accepts a History label and unset
range placeholder. Existing report defaults remain compatible.

`src/lib/pos/kitchen-history-utils.ts` owns status interpretation, India date
formatting, local filtering and sorting without mutating store entries.
`kitchen-service.ts` adds the existing `voided_by` column to the entry SELECT
and mapper. `KitchenEntry.voided_by` is optional and nullable for older typed
callers and missing legacy metadata. Entry queries retain both tenant and
branch filters, the existing transaction-date ordering and 500-entry limit.
The store already requests recent entries with `includeVoided: true`; no new
fetch, polling, posting, balance calculation or database schema was introduced
by the filter controls.

## Verification and limits

Local typecheck and changed-file ESLint passed. The focused history, kitchen
utility, analytics and native-route-smoke suite passed 63 tests, including 19
route-load checks. History tests cover audit states, composed filters, actor
search, backdated sorting, offset timestamps and ties, inclusive India day
boundaries, missing actors and a corrected entry later voided.

Actual Expo staging browser checks used synthetic local authentication, mocked
Supabase responses and blocked websockets. The final run fulfilled 89
cloud-targeted requests locally and forwarded zero. It checked four sorts,
all statuses, type/staff/search, combined no-match/reset behavior, both date
bases, inclusive ranges, original edit details, loading, empty history,
safe service failure and refresh recovery. Filter changes caused no requests.
There was no live-cloud test or database write.

The retained evidence is `.impeccable/review/history-results.json` and the 19
named `history-*.png` captures at 1440×900, 800×700, 390×844 and 320×700. The
measured frames have no horizontal overflow. Typical desktop rows are 85 px
and rows with a replacement/void audit line are 105 px; phone rows grow with
wrapping and content. These are observed sample dimensions, not fixed heights
to impose on future content.

The independent scoped finish review initially requested one material fix:
Refresh history was too narrow. The corrected minimum width and height were
verified at 48×48 in all four sizes; the reviewer scored that sole fix resolved
and returned Ship for this extension. This is browser/source evidence, not a
fresh review of the entire Kitchen surface. The native detector was skipped;
iOS/Android hardware, text scaling, dark appearance and gestures remain
unverified.

Incumbent comparison: the source and captures preserve the task 170 typography
and task 173 canvas/navigation. Pre-existing DESIGN prose still calls the face
“system sans” although its frontmatter and shipped type use Source Sans 3;
the early surface contract also retains its original canvas, floating-action
exception and pre-Analytics tab description. The global “chips for every
choice” wording predates the existing report selectors. These historical
inconsistencies were reported, not repaired or canonized by this ordinary
History extension. PRODUCT.md, DESIGN.md and the design sidecar remain the
incumbent authority; no new visual world, tokens or raster assets were created.

## Row spacing refinement (task 179)

The user requested a smaller gap between desktop particulars and amounts, and
less clustered phone metadata. `HistoryEntry.tsx` now groups the particular,
transaction date and amount/status within 58% of the desktop row, with a
156px amount/status column inside that group. A separate audit column follows
a hairline vertical divider. Phones pair particulars with amount/status above
a separated footer for creator, transaction date, recorded IST time and any
replacement/void audit line. All existing audit meaning is retained.

Only row composition changed. Filters, four sorts, local search, the disclosed
500-entry/92-transaction-day loaded window, refresh, details and service
behavior remain as documented above. No query, schema, migration, polling or
production deployment changed. Incumbent Source Sans 3, POS blue navigation,
Kitchen Canvas, exact tabular amounts and flat white ledger rows are preserved.

The task 179 rerun retained 19 mocked captures at 1440×900, 800×700, 390×844
and 320×700, checking filters/sorts, audit and earlier-version details,
no-match/reset and loading/empty/error recovery. It fulfilled 89 cloud-targeted
requests locally and forwarded zero, with no reported page errors or
horizontal overflow. Typical sample rows measured 85px on desktop and 122px
on phone; longer names, content or audit lines wrap taller. These are observed
dimensions rather than imposed fixed heights. Evidence is retained in
`.impeccable/review/history-results.json`, `check-kitchen-history.cjs` and
`history-*.png`. A focused read of the existing live staging browser panel
confirmed History loads; `history-live-staging.png` records that read.
No live records were changed by testing and no new log scan was needed.

Final typecheck, changed-source ESLint and the broader 304-test/33-suite run
passed, including 23 native route imports. The fresh independent finish
reviewer returned Ship with no material fixes across all five contract
sections after inspecting source and retained main/state captures. This is
browser/source evidence; native hardware, text scaling, soft keyboards, dark
appearance and gestures remain unverified. The React Native source did not
use the HTML/CSS detector, and no shipping raster assets were added.

Comparison with PRODUCT.md, DESIGN.md, `.impeccable/design.json`, tokens,
Typography, shared Kitchen controls and desktop/phone captures preserves the
incumbent visual authority. Design files and tokens remain untouched. The
pre-existing system-sans/specimen, every-choice chips, older navigation and
early surface-contract drift recorded above is reported without repair.
