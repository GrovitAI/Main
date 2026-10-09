# Kitchen Blue frame — task 172

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
