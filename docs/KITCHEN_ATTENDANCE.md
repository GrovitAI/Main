# Kitchen attendance

Task 176 · 2026-10-10 · staging only

Central Kitchen now has a manually maintained staff roster and daily attendance
register. Attendance is separate from app logins: adding a person does not
create a Supabase Auth account or change their access. Production is unchanged.

## Using Attendance

Desktop/tablet rails expose Attendance directly. Phones keep Home, Analytics,
Stock, History and More; Attendance joins Branches and Vendors under More.
The route is `/central-kitchen/attendance`. Existing Kitchen role access and
owner/admin entry through Settings remain in force.

The screen opens the Daily register for today in Asia/Kolkata. Previous/next
day controls and the calendar select today or an earlier day; future dates
are disabled and also rejected by the service and database. Today in the
calendar returns to the current India day.

Each person begins Unmarked. Select Present, Absent, Half day or Leave to save
that day's mark. Unmarked is distinct from Absent: no mark does not imply the
person was absent. Counts cover the full day's roster, while search narrows
the visible rows by name or job role. Desktop shows the four choices inline;
smaller layouts disclose them from the person's current status button.

Open a row's editor to add an optional note of up to 200 characters, save the
note, or Clear mark. Clear mark saves Unmarked with an empty note rather than
deleting the attendance record. Choose a status before adding the first note.
The row shows the latest server-recorded editor and India time. This is the
current daily record, not a revision-history or payroll system.

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
