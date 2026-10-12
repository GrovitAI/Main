# Kitchen attendance

Task 176 · 2026-10-10 · staging only

Latest refinement: task 187 · 2026-10-11 · staging only

Central Kitchen now has a manually maintained staff roster and daily attendance
register. Attendance is separate from app logins: adding a person does not
create a Supabase Auth account or change their access. Production is unchanged.

## Using Attendance

Desktop/tablet rails expose Attendance directly. Phones keep Home, Analytics,
Stock, History and More; Attendance joins Branches and Vendors under More.
The route is `/central-kitchen/attendance`. Existing Kitchen role access and
owner/admin entry through Settings remain in force.

The screen opens the Daily register for today in Asia/Kolkata. Underline tabs
switch between Daily register, Month overview and Staff; Add staff and Refresh sit beside the
slim title. Previous/next
day controls and the calendar select today or an earlier day; future dates
are disabled and also rejected by the service and database. Today in the
calendar returns to the current India day.

Each person begins Unmarked. Select Present, Absent, Half day or Leave to save
that day's mark. Unmarked is distinct from Absent: no mark does not imply the
person was absent. All, Unmarked, Present, Absent, Half day and Leave are
selectable count filters. Counts and the marked/total completion line cover
the full day's roster; status and name/job-role search narrow only the visible
rows, locally, without another database request. Desktop search is visible;
on phone/tablet the search icon beside the date discloses it. Search stays
visible while it contains a query. Reset filters clears the query and selects
All when there are no matching staff.

Desktop aligns Staff member, Attendance, Last updated and Edit columns. The
four choices stay inline; latest editor/time and Edit have their own columns.
Phone/tablet rows disclose the choices from the current status
button; expanding also shows the recorded latest editor/time and available
editing controls.
Data-derived initials accompany names at wider sizes and are omitted below
360px to leave room for long names.

Open a row's editor to Clear mark or, for Half day/Leave, add and save an
optional note of up to 200 characters. Present/Absent hide note editing;
changing status preserves an existing saved note. Clear mark saves Unmarked
with an empty note rather than deleting the attendance record.
The row's Last updated column or expanded phone editor shows the latest
server-recorded editor and India time. This is the
current daily record, not a revision-history or payroll system.

For a shared daily mark, choose Select staff or press/hold a person's name,
then use the visible checkboxes. Select all in this view selects the current
status-filtered/search-filtered rows; choose All and clear search to include
the full day's roster. Check the date/count, choose Present, Absent, Half day
or Leave, then use Mark; Cancel leaves attendance unchanged. Loading, date,
pane, status-filter and search changes clear selection. Matching marks are
skipped; changed marks save together while retaining each person's note.
Selection clears after confirmation; an unconfirmed failure keeps selection
and asks for Refresh before retrying.

The Staff pane provides Active staff and Archived lists, search and editing.
Add staff opens a flat inline form with a required name and optional job role,
each limited to 80 characters. Archive removes a person from days where they
have no existing record; their recorded days remain visible and correctable.
Restore makes the person available again without deleting historical marks.
Names and roles are the current roster values; they are not historical name
snapshots.

Loading, no staff, no archived staff, no search match and unavailable register
are separate states. Retry attendance and Refresh reload the selected day.
Failed staff writes retain the form input; failed marks retain the previous
confirmed mark. A date change clears the previous day's display before
loading. Save feedback and local row updates happen only after database
confirmation; overlapping writes are blocked.

## Data and rollout boundary

`src/lib/pos/kitchen-attendance-service.ts` owns all database access. It derives
the tenant through the existing tenant context and the Central Kitchen branch
through `kitchenBranch()`. Roster/day reads, updates and attendance upserts
include both scope fields; inserts include them in their payload. Each focused
date load or explicit refresh issues two reads: the scoped roster and that
date's scoped attendance. No polling, realtime subscription or stock worker
change was added. Successful marking updates the confirmed row locally;
staff changes reload the current roster/day. The current service fails safely
at 1,000 rows rather than silently presenting a truncated register.

Two migrations were applied one at a time and verified in Grovit Staging
(`inbxezmtuytpalqvlcsm`):

1. `20261010070428_kitchen_attendance.sql` creates `kitchen_staff_roster` and
   `kitchen_attendance`, scoped indexes, RLS policies, explicit grants and
   server-owned actor/time triggers. Attendance has one record per
   tenant/branch/person/day and a composite foreign key to the matching roster
   person. Identity/scope fields cannot move; future days and new days for
   archived people are rejected. Authenticated app access is SELECT/INSERT/UPDATE,
   with no physical DELETE or anon access; service_role retains CRUD grants.
2. `20261010072231_kitchen_attendance_branch_indexes.sql` covers each table's
   standalone branch foreign key without replacing the scoped read indexes.

The connector session expired before execution. The reviewed SQL was applied
through the signed-in Supabase Studio using a transaction and migration-history
record, then verified there. `supabase/staging-pending.txt` records both files;
there are now eight staging-only migrations awaiting any future production
promotion. No production migration or deployment was performed. Production
promotion must include the pending migrations in order, with the required
verification, before exposing this screen there.

## Verification and finish record

- Local attendance/service/date tests and native route-load coverage passed:
  30 checks. The broader regression run passed 297 tests in 32 suites; it also
  includes separate task 177 work and is not an attendance-only security audit.
- Final typecheck and lint passed; lint reported zero errors and 166 existing
  warnings. Web export passed with 55 routes.
- Authenticated rollback-only SQL in `supabase/tests/kitchen_attendance.sql`
  passed in staging: one person/day upsert, server actor ownership, future-day
  rejection, immutable date identity, invalid status, cross-branch denial,
  archive preservation/correction, archived new-day rejection, distinct
  unmarked staff, physical-delete denial and anon denial. Fixtures were rolled
  back. This verifies the attendance boundary; it does not certify the whole
  database security audit.
- The actual Expo browser component was exercised using local synthetic
  authentication and mocked Supabase responses at 1440×900, 800×700, 390×844
  and 320×700. The retained run covers navigation, inline/disclosed marking,
  staff creation, note saving, clear mark, archive, calendar, search recovery,
  loading, empty and load/write error states. It fulfilled 87 cloud-targeted
  requests locally, forwarded zero cloud requests and recorded five mock
  writes. All 15 captured states have no reported page errors or horizontal
  overflow. Websockets were blocked. These are sample captures, not live
  production records.
- The actual staging Attendance route loaded with its empty roster and no
  migration error after the SQL changes. Mocked writes remain separate from
  this focused live read confirmation.

Evidence is retained locally in `.impeccable/review/attendance-results.json`,
`check-kitchen-attendance.cjs` and `attendance-*.png`. The independent finish
reviewer requested flat staff text fields inside the editor. The correction
was applied and scored resolved/ship on the verdict pass. That verdict covers
the named correction and browser/source extension; native hardware, text
scaling, soft keyboards, dark appearance and gestures remain unverified.

Testing follows `docs/TESTING_USAGE_BUDGET.md`. The existing 10 October All
projects baseline for the 21 September–21 October cycle is 0.618/1 GB log
ingestion and 38.653/100 GB log queries. Essential scoped staging migration/SQL
checks were the live verification; repeated browser iteration used mocks.
No log scan or polling was added. Dashboard lag prevents exact per-test byte
claims or a guaranteed monthly total.

## Design-system comparison

This is an Operate-mode extension of The Kitchen Ledger. The documented
direction is a daily register with manual marks and a distinct Unmarked state,
using Source Sans 3, existing POS blue navigation, quiet white working surfaces
and compact rows. The first viewport presents title, Daily register/Staff
switch, India date, status counts, search and the register. One FlatList owns
the header and rows; desktop inline choices and phone disclosure retain the
same task. The flat staff name/role form reuses existing primitives.

Comparison checked attendance source, AttendanceDate, shared kitchen controls,
Typography, brand tokens, DESIGN.md, `.impeccable/design.json` and retained
desktop/phone/form/small-phone captures. No new global token, font, image,
identity or component system is needed. DESIGN.md and its sidecar are preserved.

Pre-existing drift is reported without repair: their prose still describes
system sans, chips for every choice and older six-section/Items navigation,
while current authority is task 170's Source Sans 3 and tasks 173/175/176's
navigation extensions. The earlier surface contract also contains its original
font, canvas and first-viewport descriptions. Impeccable context reports an
unset `buildPath` in `.impeccable/config.json`; that optional workflow choice
was not changed by this precisely scoped extension.

## HR roster refinement (task 178)

The user requested inspiration from a high-end HR resource tool. The reviewed
primary product references were [Personio Attendance Tracking](https://www.personio.com/product/attendance-tracking/)
and [BambooHR Time Tracking](https://www.bamboohr.com/ca/platform/time-and-attendance/time-tracking).
The interpretation is roster clarity and task focus: choose the day, find
Unmarked staff, mark attendance, then inspect notes or the latest actor. It
does not claim a copied design or feature parity. The manual attendance scope
and existing Source Sans 3, POS blue and Kitchen Ledger remain authoritative.

The narrower refinement replaces the previous pane switch with underline
tabs, introduces local count filters and the completion line, and aligns the
desktop roster columns. The four-choice column is 320px, latest editor/time
168px and Notes 48px. A typical collapsed phone row measured 65px in the
mocked browser run; wrapping names or saved notes can increase its height.
Phone search disclosure and omission of initials below 360px preserve room
for the work. One main FlatList owns the roster and header; the count-filter
strip uses a horizontal FlatList on narrow layouts. Service, query, schema,
scope enforcement and polling behavior were not changed.

Task 178 verification retained 16 browser captures at desktop 1440×900,
tablet 800×700, phone 390×844 and small phone 320×700. All have no reported
page errors or horizontal overflow. Unmarked, Absent and All filters returned
the expected local rows without added requests. Existing staff, note, clear,
archive, calendar, search-empty, loading, empty and error/retry flows were
exercised with mocks. The run fulfilled 87 cloud-targeted requests locally,
forwarded zero and recorded five mock writes. Its JSON contains 17 facts:
16 capture facts and one 65px row/local-filter fact; the console's label of
17 captures is inaccurate. Evidence is in
`.impeccable/review/attendance-hr-results.json`,
`check-kitchen-attendance-hr.cjs` and `attendance-hr-*.png`.

Typecheck, changed-source lint and the 30 attendance/native-route checks
passed. A focused read of the existing staging session confirmed the refreshed
screen displays a user-entered staff record; no user records were altered by
testing. No new cloud log scan was required, and production is unchanged.

The fresh independent finish review returned Ship across all five review
sections, with no material fixes. This verdict covers the scoped browser
composition and source; native hardware, text scaling, soft keyboards, dark
appearance and gestures remain unverified.

The documentation comparison checked source, shared Kitchen controls,
Typography, brand tokens, DESIGN.md, `.impeccable/design.json` and desktop/
phone captures. DESIGN.md's frontmatter already records SourceSans3; its
system-sans prose and sidecar component specimens, chips-for-every-choice
guidance and older navigation descriptions predate the current implementation.
The original surface contract also retains earlier font/canvas/first-viewport
descriptions. These are reported as pre-existing drift without repair; both
incumbent design files and global tokens are preserved. This is an existing
surface refinement, so no new visual world, comp, concept seed or QUALITY BAR
was needed.

## Month overview (task 179)

The user requested a monthly manual attendance overview. Each staff row now
shows Present, Absent, Half day, Leave and Unmarked totals for the chosen month.
Active staff totals count every calendar day in that month through today in
Asia/Kolkata, including days before the person's roster record was created.
These are calendar counts, not employment dates, scheduled working days or
payroll calculations. Missing marks remain Unmarked rather than Absent.
Archived staff appear only when that month contains their attendance records;
their totals count recorded days only, including explicitly cleared Unmarked
records. Only those recorded days can be corrected for archived staff.

Previous/next month and Refresh month attendance load the selected month on
demand. Future months and future calendar days are unavailable. Staff search
and selection, calendar selection and draft changes operate locally. Desktop
pairs the 352px staff list and month controls with a calendar detail pane;
phones and narrower layouts show the staff list first, then the selected
person's calendar with Back to month staff. The calendar uses a seven-column
FlatList rather than a wide 31-day table.

Choose an individual day, select Present, Absent, Half day or Leave, optionally
enter a note for Half day/Leave, then use Save day. Present/Absent hide the
note field while retaining any existing note. Cancel edit discards the local
draft. Clear attendance day confirms an Unmarked record with an empty note through the
existing upsert; it does not delete a row. There is no bulk month autofill.
Dirty drafts and in-flight saves block local staff/day/month changes, refresh,
Back and Attendance pane changes until Save or Cancel. This is protection
within the attendance workflow, not a global route-navigation guard. Failed
writes retain the draft, status and note; confirmed writes update the displayed
record and totals. Latest server editor/time remains visible for saved days.

`MonthlyAttendance.tsx` owns the month interface, with the existing route
providing the three-pane header. `fetchKitchenAttendanceMonth` in the existing
attendance service starts with two tenant/branch-scoped reads: roster and the
first attendance page. Attendance uses an inclusive month start, exclusive
next-month start and inclusive India-today bound, ordered by date then ID.
Further 1,000-row pages are read only after a full page; every page retains
both scope filters. A failed later page or oversized roster fails the complete
load instead of displaying partial totals. The daily fetch is skipped while
Month overview is active. Existing tables and scoped day upserts are reused;
no new polling, subscription, schema, migration or production deployment.

Task 179 verification passed final typecheck, changed-source ESLint and 304
tests in 33 suites, including 23 native route-load checks. Seven new month
tests cover leap day/year boundaries, tenant/branch filters on each page,
deterministic pagination, incomplete-load failure, invalid/future months,
calendar totals and archive semantics. Route imports are not native visual
verification.

The mocked Expo browser run retained 20 captures at 1440×900, 800×700,
390×844 and 320×700. It checked totals/statuses, day editing, local draft
protection, failed-save input retention, save/clear, earlier months, archived
correction, calendar, search and loading/empty/error recovery. All captured
states have no reported page errors or horizontal overflow. It fulfilled 92
cloud-targeted requests locally, forwarded zero and recorded three mock writes;
no live records were changed. Evidence is in
`.impeccable/review/attendance-month-results.json`,
`check-kitchen-attendance-month.cjs` and `attendance-month-*.png`.

A focused read of the existing live staging session confirmed the current
month, existing staff and existing attendance mark in the user's 319×668
browser panel. `attendance-month-live-staging.png` is read-only evidence;
testing made no live write. The 10 October All projects baseline of 0.618/1 GB
ingestion and 38.653/100 GB log queries was reused. No fresh log scan was needed.

The fresh independent finish reviewer returned Ship in all five contract
sections, with no material fixes, after inspecting the scoped source and
retained main/state captures. The verdict covers this browser/source extension;
native hardware, text scaling, soft keyboards, dark appearance and gestures
remain unverified. The HTML/CSS detector does not apply to this React Native
source. There are no new shipping raster assets.

The documentation comparison checked the month source, History refinement,
shared Kitchen controls, Typography, brand tokens, incumbent DESIGN.md and
`.impeccable/design.json`, product context and desktop/phone captures. It
preserves The Kitchen Ledger, Source Sans 3, POS blue navigation, Kitchen
Canvas, quiet white rows and hairline dividers. DESIGN.md, its sidecar and
global tokens remain untouched. Existing system-sans prose/specimens,
every-choice chips guidance, older navigation descriptions and early surface
font/canvas/first-viewport wording remain reported drift without repair.

## Compact note actions (task 186)

The expanded Daily register row now uses local intrinsic-width Save note,
Clear mark and Close controls: 14px semibold Source Sans 3, 20px line height,
44px minimum height/width, and 8px gaps/corners. Save note retains primary
blue; Clear mark and Close use quiet outlines. The expansion's top gap changes
from 12px to 8px. Full labels fit one row at normal 320px text size; the layout
can wrap at larger sizes. Busy/disabled predicates, confirmed-write dismissal
and failed-save draft retention are unchanged, as are status choices, roster,
Month overview and services.

Typecheck, changed-file lint and 37 tests/three suites passed. Eleven mocked
captures cover marked/unmarked rows at 1440×900, 800×700, 390×844, 320×700 and
370×668 plus failed save. The run fulfilled 47 cloud-targeted requests locally,
forwarded zero, recorded two successful mock writes and reported no page
errors. That request claim excludes existing user/HMR sessions. There was no
live database testing, migration or production change.

The fresh independent review returned **Ship** in all five sections without
material fixes for the captured browser composition and inspected native
source. Comparison with the incumbent small-phone capture confirms the former
two-line Save note label is now compact and single-line; Source Sans 3, POS
blue/Canvas and existing design authority remain. PRODUCT.md, DESIGN.md,
design.json and brand tokens are untouched; pre-existing drift remains recorded
above. Evidence: `.impeccable/review/attendance-actions-results.json`,
`attendance-actions-*.png`, verification logs and
`attendance-actions-finish-review.md`. No shipping raster was added and no
HTML/CSS detector applies to native source. Native hardware, text scaling,
keyboard, dark appearance and gestures remain unverified; browser 44px targets
do not certify Android's 48dp floor.

## Solid actions and daily group marking (task 187)

This refinement follows the user's rejection of task 186's transparent actions.
Attendance actions now have solid token fills in enabled/disabled states,
48px minimum targets and intrinsic 14px semibold labels, without fading the
whole control. Optional Half day/Leave notes apply in both views. The daily
selection workflow above adds one tenant/branch-scoped array upsert for changed
marks, preserving individual notes and server-owned editor/time. The service
validates the complete returned ID/date/status set before the UI updates;
already-matching selections issue no write. Existing tables, reads and polling
remain; there is no schema, migration, live database test or production change.

Final typecheck, changed-source lint and 45 tests across three suites passed,
including eight new group cases. Twenty visual cases cover 1440×900, 800×700,
390×844, 320×700 and user-size 370×668. Their geometry, solid-fill and local
selection assertions passed before a checked-state assertion interrupted the
matrix; no aggregate request count was saved. Explicit aria-checked/aria-pressed
fixed that nonvisual issue. The resumed behavior/state run passed with 17
mocked requests, zero forwarded, two successful mock writes, three state
captures and no page errors. These counts exclude existing user/HMR sessions;
this does not claim an uninterrupted aggregate browser-suite pass.

The fresh independent finish review opened all 23 retained images and returned
**Ship** across five contract sections with no material fixes. The earlier
visual captures remain valid after the nonvisual accessibility correction;
monthly note visibility is supported by source/behavior assertions, not a new
monthly image matrix. Evidence: `.impeccable/review/attendance-group-*`,
`check-attendance-group.cjs` and `attendance-group-finish-review.md`.
Source/product/design comparison preserves The Kitchen Ledger, Source Sans 3,
POS blue/Canvas and existing tokens. DESIGN.md, design.json and brand.ts remain
byte-identical; previously recorded drift above, including pressed-dim
specimens, is reported without repair. No shipping raster or native HTML/CSS
detector applies. Local mocks verify service query behavior, not fresh live
database certification. Native hardware, scaling, keyboard, dark appearance
and gestures remain unverified.
