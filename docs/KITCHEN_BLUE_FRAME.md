# Kitchen Blue frame — tasks 172–173

Task 173 (2026-10-10) is the current refinement below. The task 172 treatment
and verification are retained as dated selection history; its text header,
canvas, selected fill and fixed desktop width are superseded.

## Current refinement — task 173, 2026-10-10

The user requested the existing Le Laban sign, the same canvas as POS/other
tabs, desktop sidebar auto-hide/hover like POS, and a quieter selected highlight.
Staging source now reuses `assets/images/le-leban-logo.png`; no new asset was
generated. React Native `Image` has explicit dimensions, following POS, because
NativeWind image sizing failed browser interop.

- `colors.kitchenCanvas` / `kitchen-canvas` is `#f5f8fc`, matching the existing
  POS and Orders workspace canvas. Original `surfaceTint` stays `#e8f2fa`.
- `colors.kitchenSidebarSelected` / `kitchen-sidebar-selected` is the flat
  `rgba(255, 255, 255, 0.14)` fill. The shared POS rail backdrop and stationary
  rings are retained; POS keeps its own selected gradient.
- Desktop web at 1024px+ defaults to a 64px icon strip. Hover or keyboard focus
  expands a 176px overlay without shifting the report; pinning reserves 176px.
  Pointer clicks do not latch keyboard expansion. Desktop-only DOM listeners
  are cleaned up, and the 200ms width transition is disabled for Reduce Motion.
- Tablet/native uses the 88px labelled rail. Phones retain five controls and
  More. The bounded six-section FlatList and safe-area footer remain.

Only `_layout.tsx`, `SidebarSurface.tsx`, `brand.ts` and `tailwind.config.js`
change application source. `DESIGN.md` and its sidecar record the current
tokens, component and existing-asset provenance; Kitchen's gradient exception
now applies only to the rail backdrop.

### Verification — task 173

Typecheck, changed-source quiet lint and 18 native route-loading checks passed.
Mocked Playwright used 1440×900, 1024×390, 800×450, 390×668 and 320×700;
there was no page overflow, undersized visible control or browser error. It
confirmed the loaded logo, flat selection, all six desktop destinations and
hover without report movement or fetch. Each of six mouse tab clicks followed
by moving outside returned rail and shell to 64px. Actual Tab navigation from
Home to Analytics expanded to 176px; outside focus collapsed to 64px.
Pinning opened 176px; mouse unpin followed by pointer exit and report focus
returned to 64px. This does not establish an isolated unpin/leave-only check.
Short desktop Vendors/History, tablet History and phone More were checked.

The final run fulfilled 100 cloud-targeted requests locally and forwarded zero;
WebSockets were blocked and the agent browser was closed. Evidence is
Git-ignored in `.impeccable/review/rail-refinement-results.json`,
`check-kitchen-rail-refinement.cjs` and 12 `rail-refinement` screenshots; the
outdated navigation-failure capture is excluded. Independent finish review
returned **Ship**, with the input-modality finding resolved and prior visual
approval retained. Native hardware, text scaling, dark appearance and gestures
remain unverified. Services, queries, migrations and production deployment
are unchanged; the user's staging server remains on localhost:8081 (API 8083).

## Task 172 history — 2026-10-09

The user selected Blue frame from the task 171 background previews on
2026-10-09 and explicitly requested the existing POS left-sidebar colour scheme
and design. This is implemented in staging source on `codex/kitchen-analytics`.
The original preview captures remain selection history; the final rail uses the
exact POS gradient and translucent selected row rather than the preview's solid
navy and white selection. Neutral workspace and Warm off-white were not adopted.

## Approved treatment and scope

| Token / shared treatment | Exact value | Use |
| --- | --- | --- |
| `colors.kitchenCanvas` / NativeWind `kitchen-canvas` | `#e3ecf5` | Central Kitchen route/scene roots, KScreen, Items and PartyList workspace backgrounds |
| `gradients.posSidebar` | `#0251b8` → `#013b8c` → `#012f70` | Existing POS sidebar and Kitchen desktop/tablet rail |
| `gradients.posSidebarSelected` | `rgba(58, 120, 220, 0.95)` → `rgba(35, 95, 190, 0.95)` | Selected rail row |
| `colors.sidebarTextMuted` / `sidebar-muted` | `rgba(255, 255, 255, 0.8)` | Inactive rail labels/icons and desktop footer |
| `colors.sidebarHover` / `sidebar-hover` | `rgba(255, 255, 255, 0.08)` | Inactive rail hover |
| `colors.sidebarDivider` / `sidebar-divider` | `rgba(255, 255, 255, 0.12)` | Rail identity separators |
| Existing ring detail | Three white circle outlines at `0.08` opacity | Shared stationary POS backdrop detail |

`SidebarSurface` and `SidebarSelection` live together in
`src/components/ui/SidebarSurface.tsx`. POS and Kitchen consume this shared
backdrop and selection; POS preserves its appearance and navigation behavior.
The ordered gradient arrays and colours live in `src/lib/pos/brand.ts`; relevant
canvas/rail state classes are mirrored in `tailwind.config.js`.

Kitchen desktop web retains the 176px rail and compact labelled rows; tablet
retains the 88px rail and stacked icon/label controls. Both show Le Laban at the
top; desktop also shows Central Kitchen at the bottom. Six direct sections are
Home, Analytics, Items, Branches, Vendors and History. Selected text/icons and
keyboard-focus borders are white. A bounded FlatList scrolls in short windows,
so Vendors and History remain reachable without shrinking their controls.

Phone navigation remains Home, Analytics, Items, History and More, with a white
bottom bar and white More list for Branches and Vendors. The lighter Kitchen
canvas applies on phones too. Original `colors.surfaceTint` (`#e8f2fa`) stays
available for other modules and control wells. White working surfaces, action
blue, semantic money colours, Source Sans 3 and compact Analytics density keep
their roles. Proposed preview separator, control-stroke and muted-ink colours
were not adopted.

This is a scoped extension of The Kitchen Ledger. `DESIGN.md` frontmatter owns
the token primitives; `.impeccable/design.json` records gradient ordering,
provenance and the rail example. The user's request supersedes the earlier
Kitchen gradient ban only for the shared rail and selected row. Cards, inputs,
phone navigation and working surfaces remain flat. Unrelated typography and
historical metadata were not rewritten.

## Verification — 2026-10-09

Relevant local checks passed: TypeScript typecheck, quiet lint for changed
source and 18 native route-loading checks. These loading checks do not establish
native visual or hardware approval.

Mocked Playwright checks use the actual Expo web app with local sample
authentication and data responses. Viewports were 1440×900, 1024×768, 800×900,
800×450, 1024×390, 390×668 and 320×700. Measurements found no page overflow or
undersized visible controls; typical Sales rows measured 53px on desktop/tablet
and 62px on phone, with five/four complete phone rows at 390×668/320×700.
These are default-text-size sample browser observations, not record-independent
or native guarantees.

All six desktop rail sections were exercised; hovering did not fetch. Phone
tabs and More retained their behavior. The short 800×450 tablet and 1024×390
desktop checks scroll to Vendors and History, open both, and show History
selected and fully reachable. POS evidence covers its rendered sidebar after
shared-surface extraction while the mocked product state was Loading; it is
not a full POS workflow verification.

The run fulfilled 149 cloud-targeted requests locally and forwarded zero;
WebSockets were blocked. This is a claim about the mocked verification run,
not the entire staging server session or a measured quota saving. No database
or log investigation was required. Task-owned browser test tabs were closed;
the user's staging server remains available at localhost:8081 (API 8083).

Independent first review identified clipped rail tabs in short windows. The
bounded FlatList correction and targeted short-window checks resolved that
finding. Final scoped review returned **Ship** for this browser composition
and source, with no further fixes required. Native iOS/Android appearance,
text scaling and hardware interaction remain unverified.

Detailed sample QA results and screenshots are Git-ignored under
`.impeccable/review/`, including `pos-frame-results.json`. This task adds no
dependencies, services, queries, schema changes or migrations, and makes no
production deployment. Earlier analytics migrations remain staging-only under
their separate release record.

## Task 210: smoother rail selection (2026-10-14)

- **The problem:** after a click, the selected rail tab kept the white
  keyboard-focus border.
- **The fix:** the selection is now a soft fill that fades in over 180 ms,
  with no edge, and hover fades too.
- **Keyboard focus:** the white outline returns only when moving with the
  keyboard (Tab or arrows). A mouse or touch press hides it. The Pin sidebar
  button follows the same rule.
- **Why state, not a style callback:** hover and focus are tracked in
  component state because NativeWind drops a Pressable style callback when a
  class name is present.

## Tasks 214–215: motion (2026-10-14)

Kitchen controls move instead of jumping. Every motion is short (120–220 ms,
ease-out) and is skipped when the device asks for reduced motion. The helpers
live in `src/components/kitchen/ui.tsx`.

| Helper | What it does | Where |
|---|---|---|
| `useSlidingRect` | One highlight slides to the chosen option (and to another row when chips wrap). | Payment mode, Segmented bars, Chips, Analytics report tabs, attendance pane underline and status filters |
| `Reveal` | A panel grows open and shrinks closed, with a fade. | Analytics filters and notes, History filters (tablet and desktop), Team member cards, attendance row edit, phone attendance search |
| `usePresence` | Keeps something drawn while it fades out. | Saved message (`Toast`), phone More menu |
| `useEnterOnChange` | New content fades up 6 px; with `'x'` a month slides 16 px in from the side moved to. | Report rows and totals, attendance panes and loaded day, Month overview, both calendar pickers |
| `Tick` | The blue fills and the tick pops. | Team permissions, attendance selection, invoice selection |

- Animated views ignore NativeWind class names, so each one wraps a plain
  `View` that carries the classes.
- The attendance status filters scroll sideways in a FlatList, so each cell
  reports its own place through `CellRendererComponent`.
- Not animated on purpose: money totals counting up, and whole-screen
  transitions between sidebar sections.

## Task 216: calmer loading and saving (2026-10-14)

- **Analytics keeps the last report while a new one loads.** It stays dimmed
  (45%) and can't be tapped, under a thin moving line. Its rows, column names
  and totals keep the shape of the report they came from (`shownFor`), so a
  Sales table never renders as Cash. Only the first load shows placeholder
  rows. A failed load clears the old report, so stale numbers never sit next
  to an error.
- **Placeholder rows instead of spinners**: `SkeletonRows` (the shared
  `Skeleton` now pulses slowly) on first loads in Analytics, Attendance, the
  Month overview and History.
- **The Save button confirms itself.** On Received, Bought, Spent and the item
  and branch/vendor forms, `useSavedThen()` turns the button green with a tick
  and "Saved" as soon as the database confirms. The form leaves 650 ms later.
  The button can't be pressed again in between. Send keeps its slip sheet as
  the confirmation.
- **Disabled buttons say what's missing.** For example "Choose a branch",
  "Add an item quantity", "Enter the amount", "Choose what it was for",
  "Check the date" or "Enter a name".
- **"Often sent to <branch>"** chips on Send come from the loaded entries
  (`oftenSent`). A tap adds the item at quantity zero, and the row shows
  "last time N". Quantities are never filled in for you.
- **History day headings**: "Today", "Yesterday", "Mon, 12 Oct", each with its
  count (`historySections`). Once the toolbar scrolls away, a bar above the
  list names the day of the topmost entry. FlatList `stickyHeaderIndices` was
  tried and dropped: on the web it pinned part of the list header over the
  rows.
- **Opened screens slide in on the web.** In the kitchen stack's
  `screenLayout`, `ScreenEnter` slides each opened screen in (not the tabs). The
  phone app's own navigation already slides.
- **Phone buzz**: `buzz()` in `src/lib/pos/kitchen-haptics.ts` uses
  `expo-haptics`. Success on a confirmed save, a light tick when a tick box
  changes, a warning on a save error. Silent in browsers, and calls within 60
  ms collapse into one.
- **The TEST DATA tag** (staging only) now hangs flush from the top edge, so
  it no longer crosses page titles.
- **Considered and declined by the owner**:
  - undo instead of a confirm before voiding (it may be missed);
  - keyboard shortcuts (they can be pressed by accident);
  - remembering the last branch and mode (a send could go to the remembered
    branch without anyone noticing).

## Task 217: phone fixes for the stock switch and report tabs (2026-10-15)

- **Stock switch on the phone.** Raw materials and Finished goods share the
  phone's Stock tab. The switch used to move to the other route, which rebuilt
  the screen, so its highlight never slid. It now changes the list in place
  (`StockItems` keeps the phone's kind itself). The highlight slides and the
  rows come in from the side chosen (`useEnterOnChange`). The rail still opens
  each kind as its own section.
- **Analytics report tabs on the phone.** Each tab used to get an equal fifth
  of the row, so "Purchases" touched its neighbours, and at 360 px it was wider
  than its tab. Each tab is now as wide as its name plus an even share of the
  spare room. On a very narrow screen the row scrolls and keeps the chosen tab
  in view. Desktop is unchanged.
- **Rule (AGENTS.md):** every UI change is designed and checked on both phone
  and desktop, for every component it touches.

## Task 218: equal report tabs (2026-10-16)

- **Every Analytics report tab is the same width**, so the blue highlight
  keeps one size as it moves (owner's choice, option A). The width is the
  widest name plus padding and the focus border. The names are measured in a
  hidden copy that the tab width can't squeeze. Every tab always has a
  transparent 1 px border, so focusing a tab never narrows its label.
- **Phones:** the row scrolls sideways and fades at the edge that is cut off.
  Choosing a tab scrolls it into view. "Purchases" keeps its name; the owner
  declined renaming it to "Bought".
- **Desktop:** the same equal tabs sit in one row, with no scrolling.

## Task 219: fewer buttons (2026-10-16)

The owner's rule, now in AGENTS.md: use a button only where no lighter
control works.

- **New shared controls** in `ui.tsx`:
  - `SettingsGroup`: one card of rows separated by hairlines.
  - `Toggle`: a whole-row on/off switch. The thumb glides, the track fills
    blue, the phone ticks, and Reduce Motion is respected.
  - `SelectRow`: a row naming a setting and its current value, which opens
    the choices in the existing `Sheet`.
  - `MoreMenu`: one "⋯" button whose small menu opens under it.
- **Team and day lock:**
  - "Lock each day automatically" is a switch. Before, it was On/Off buttons.
  - "Yesterday stays open until" is a value row. Before, it was 8 hour pills.
  - "Lock everything up to" is a value row offering No date, Yesterday, End
    of last month and Another date. Another date opens the shared calendar,
    which replaces the typed date field.
  - Save and Undo appear only once something has changed.
  - A login's starting role is a value row, and its Save and Undo also appear
    only after a change.
  - "Show older changes" is a text link.
- **Branch, vendor and item pages:** Edit and Remove share one "⋯" menu
  instead of two icon buttons.
- **Cash and bank:** the opening-balance line carries a "Change" link instead
  of a second button beside Move money.
- **Attendance:** the selection bar appears only while selecting. A "Select
  several" link on the count line starts it. Pressing or holding a name still
  works.
- **Considered for later:** the attendance group-mark bar (four status buttons
  plus Mark), the Analytics desktop toolbar icons, and the attendance Refresh
  icon (phones can pull to refresh).

## Task 220: kitchen login permissions without the long scroll (2026-10-16)

The owner chose option C, and may return to A after trying it on staging.

- **Desktop:** the logins sit in a 280 px list beside the chosen person's
  permissions. All 25 ticks show at once in three balanced columns
  (`GRID_COLUMNS`), under the starting-role row.
- **Phone:** each login card opens to the starting role and six folded
  groups, each with a count ("Entries · 4 of 8"). One group opens at a time.
- **Unsaved changes** are kept per login until saved or undone. Switching
  people on desktop, or closing a card on the phone, loses nothing, and the
  login's row says "Unsaved changes". Save and Undo appear only after a change.
- **Switching to option A** is one line: set `DESKTOP_LAYOUT` in
  `TeamWorkspace.tsx` to `'fold'`. The desktop then uses the phone's folded
  cards.

## Task 221: guideline fixes from the design audit (2026-10-16)

An audit against NN/g, Baymard, WCAG 2.2 and Material guidance measured all 16
kitchen pages on phone and desktop. The owner chose these six fixes:

- **Keyboard focus ring** (WCAG 2.4.7): a blue ring drawn inside the control,
  with a white gap, for keyboard focus only. It never shows after a click or
  tap, and a text field rings its whole box. The app's global reset
  (`:focus { outline: none !important }`) is outranked with a `:root` rule in
  `src/lib/pos/kitchen-web.ts`, injected only while the kitchen is open.
- **Browser tab titles**, such as "Send · Le Laban Kitchen". An item or branch
  page uses its own name. Titles are read from the already-loaded lists, so
  they never start a load.
- **Amount read-back**: every rupee field shows "₹1,12,000 · 1.12 lakh" under
  the box from ₹1,000 up (`amountReadBack`). The small in-row price fields
  skip it.
- **Ask before leaving a form with typing** (Send, Received, Bought, Spent,
  item, branch and vendor):
  - The kitchen's own Back asks first (`backToKitchen` with `setLeaveCheck`).
  - Phones also ask on the back gesture and Android's back button.
  - Browsers ask when the tab is closed or reloaded.
  - It never asks after a save, or on an untouched form.
  - The browser's own Back button can't be held, so it isn't covered.
- **Offline bar**: "No internet. Entries can't save until it's back." It
  appears across the top and slides away when the connection returns.
  Browsers use navigator.onLine. Phones use NetInfo
  (`@react-native-community/netinfo`, added with `npx expo install`), loaded
  safely so an older app build without it simply never shows the bar. It needs
  the next app build to work on phones.
- **Browser details**: a blue caret, a light-blue text selection, and a
  `theme-color` meta in the kitchen canvas colour.
