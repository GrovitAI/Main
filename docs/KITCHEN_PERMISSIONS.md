# Central Kitchen: permissions and day lock

Task 202 · 12 October 2026 · staging source

The owner decides what each kitchen login may do and when days lock. The
database enforces every rule; the app only shows and hides buttons to match.

## Who has what

- **Owner:** everything, always. Only the owner manages permissions and the
  day lock, and only the owner may change a locked day (with a reason, which
  is logged).
- **Branch admin:** counts as a kitchen manager. That means every permission,
  but no managing permissions or locks.
- **Kitchen login (one per person):** the permissions the owner set. A login
  the owner has not set up keeps every permission, so the kitchen works as
  before until someone is restricted.

Starting roles (the owner can switch any permission on or off afterwards):

| Role | Permissions |
|---|---|
| Kitchen manager | All 25 |
| Entry clerk | Send, buy, batches, counts; fix own entries the same day; attendance; see amounts |
| Store keeper | Send, batches, counts; fix own entries the same day; attendance; **no amounts** |
| Accounts | Receive, pay, expenses, earlier dates; fix own; invoices; money; reports and export; amounts; change log |

The 25 permissions, grouped as on the owner's screen:
- **Entries:** send, receive, buy, pay vendors, other expenses, batches,
  stock counts, enter earlier dates.
- **Corrections:** own entries on the day they were made; anyone's entries.
- **Invoices:** create, record payments, cancel.
- **Money:** see Cash and Bank, move money, set opening balances.
- **Lists:** items and prices, branches and vendors, categories, attendance
  staff.
- **Attendance and reports:** mark attendance, see reports, export reports,
  see amounts and prices, see the change log.

## Day lock

- **Automatic:** with the automatic lock on, each day locks at the owner's
  chosen hour the next day (11 am by default).
- **Lock up to a date:** separately, the owner can lock everything up to a
  date, for example after month-end accounts.
- **What is blocked:** on a locked day nothing can be added, edited or voided:
  entries, invoice payments and cancellations, money moves and attendance.
- **Owner corrections:** the owner can still make the change. For entries,
  payments, money moves and invoice cancellation the app asks for a reason;
  attendance corrections are allowed without one. Every change is written to
  the change log.
- **No future dates:** entries can never be dated in the future. Without
  "enter earlier dates", a login records today only.

## Change log

Recorded with who, when and why:
- edits and voids;
- locked-day changes;
- permission changes, with before and after;
- lock changes;
- invoice cancellations, money moves and voids, opening balances.

"Entered by" on an entry now comes from the signed-in staff record, not from
the app.

## Where it is enforced

- **Migrations:**
  - `20261012140000_kitchen_access.sql`: tables, helpers and the owner's
    functions;
  - `20261012140100_kitchen_access_enforce.sql`: guards on entries,
    permission checks in every saving and reporting function, and policies on
    the tables the app writes directly;
  - `20261012140200_kitchen_access_flags.sql`: the invoice and edit markers
    cover exactly one entry.
- **App:**
  - `useKitchenAccess()` in `use-kitchen-store.ts`;
  - the date field asks for the owner's reason;
  - the owner's **Team and day lock** screen at `/central-kitchen/team`
    (shield button on the kitchen home).

## Checks

- **Staging database, using test transactions that undo themselves:**
  - clerk limits;
  - no back-dating and no future dates;
  - others' entries cannot be changed;
  - no items, money, reports or invoices without permission;
  - locked days stop a manager;
  - the owner passes only with a reason, which is logged;
  - invoice payments need only invoices.receive;
  - attendance on a locked day is owner-only;
  - every function body on staging matched the files exactly.
- **Browser check with sample data** (no cloud requests): clerk, store keeper
  on a phone, and owner, including saving permissions, the lock, and the
  locked-day reason field.
- **Unit tests:** 346 passed.

## Known limits

- **Amounts are hidden by the app, not the database.** "See amounts" hides
  money on screen, but a login that can read entries could still read their
  amounts with database skills. Reports, money balances, invoices and exports
  are blocked in the database.
- **The store keeper's send slip shows prices.** The delivery slip shared
  after a send still shows prices, because the branch needs them.
