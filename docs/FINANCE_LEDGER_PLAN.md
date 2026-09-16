# Finance Ledger — Plan

> **Status**: steps 1 and 2 of §10 are built and live (2026-09-15 and 2026-09-16).
> Steps 3 to 5 (catalog screen, partners, month-end Excel) are still to do.
> **Written**: 2026-09-15, from the owner's requirements of the same day.
> **Scope for now**: the central kitchen's books, with branches and the
> partnership able to use the same ledger later.

This extends the Finance tab that went live on 2026-09-13. The existing
Overview (revenue from POS bills), Cash Book and Day Close stay as the owner's
view of the tills. What is added underneath is a **ledger**: hand-recorded
income, expenses, payables, receivables and transfers, with strict roles, an
edit trail, a filterable transactions page, partner accounts and a month-end
Excel. POS sales are **not** counted as ledger income (decision of 2026-09-15;
can be switched on later as an automatic feed).

---

## 1. Who does what

| | Entry clerk (new staff role `accountant`) | Owner / admin |
| :--- | :--- | :--- |
| Record entries | Yes, into the account(s) assigned to them | Yes, any account |
| See entries | **Entries recorded by clerks** (their own and other clerks'), never the partners' entries | All entries, all accounts |
| See balances (cash, bank, profit) | **No** | Yes |
| Edit an entry | Only their own, and only **until midnight IST** of the day it was entered | Any entry, any time; every edit is logged |
| Void an entry | No | Yes, with a reason; the row stays, marked void |
| Settle a payable / receivable | Yes (records the payment) | Yes |
| Transfers cash ↔ bank | No | Yes |
| Manage categories, sub-categories, particulars | No | Yes |
| Manage partners, opening balances, rules | No | Yes |

Each line marked "No" for the clerk is a **rule the owner can switch on** in
Settings → Finance rules (see §6). The defaults above are the client's ask.

The cut-off is enforced in the database, not only in the app: a row can be
updated by its author only while `now()` in Asia/Kolkata is still the calendar
day of `entered_at`. The app greys the button out; the database refuses anyway.

## 2. Accounts: "assign to a branch or to the owner"

An **account** is whose books an entry belongs to. There is one per branch
(Kolathur, Velachery, Central Kitchen) and **one per partner**, because the
partners take turns running the finances and each needs their own books.
Every entry belongs to exactly one account, the one whose books carry it
(**For**). When another account's cash or bank actually moved, the entry also
names it (**Paid from**; decision of 2026-09-15, built 2026-09-16): Velachery
pays the gas vendor for the kitchen as one entry, *paid from Velachery, for
Central Kitchen*. Balances follow the paying account; categories, profit and
the transactions page follow the account the entry is for. Everything one
account paid for another nets into a **Between accounts** position ("Central
Kitchen owes Velachery ₹12,000"), which a transfer between the two clears.
The everyday case, the same account on both sides, needs no second picker.
Each account keeps two running balances, **cash** and **bank**, computed as
opening balance + money in − money out. Every partner signs in with their own **owner** login (each partner
is added in Staff with the owner role before the build), so the ledger always
records which partner entered or changed a row, whoever is on duty. The
account picker on every entry lists the branches and the partners side by
side: that is the "is this for a branch or for an owner" choice.

Opening balances are entered once by the owner as an entry of kind income in
the built-in category **Opening Balance**. That category is excluded from
profit, so it seeds the balance without inflating income (which is what a
plain income entry would do).

## 3. Entry kinds and what they do to the balance

| Kind | Balance effect | Notes |
| :--- | :--- | :--- |
| **Income** | + cash or + bank | |
| **Expense** | − cash or − bank | |
| **Payable** (we owe) | none until settled | Sits in *Outstanding*; status `open` |
| **Receivable** (owed to us) | none until settled | Sits in *Outstanding*; status `open` |
| **Transfer** | − one side, + the other | cash → bank (deposit) or bank → cash (withdrawal) within an account, or from one account to another (which also clears a Between-accounts position); not income or expense |

**Settling** a payable or receivable creates a new expense (or income) entry
for the amount paid, in the same category, linked to the original. The
original flips to `settled` with the date, the person and the payment entry
it was settled by. The transactions page shows both rows, and the payment row
reads "Settles payable of 3 Sep · Gas supplier". Partial settlement is
allowed: the original stays `open` with the remaining amount shown. This is
the "flow into income or expense when fulfilled, but keep the trail" ask.

Mode of payment is **cash** or **bank** on every income, expense and
settlement. UPI and card payments are bank.

## 4. Categories, sub-categories, particulars

Three levels, owner-managed, in one screen (Finance → Catalog):

```
Utilities (expense)
  Electricity
    EB bill — Kolathur
    EB bill — Central kitchen
  Water
    Metro water
Raw materials (expense)
  Dairy
    Milk
    Cream
Sales (income)
  ...
```

- A **category** carries the default kind (income / expense / payable /
  receivable). Sub-categories and particulars inherit it. When recording, the
  kind is preselected from the category and can be changed: the same
  particular "Gas cylinder" serves a payable today and the expense that
  settles it next week.
- The entry form has one search box: type two letters, matching particulars
  appear, one tap fills category, sub-category, particular and kind. Typing
  something not in the list is allowed and is saved as free text; the owner
  can promote it to a particular later from the Catalog screen. Allowed from
  day one on purpose, to learn what items actually come up.
- Deactivating a category, sub-category or particular hides it from the
  picker; existing entries keep it. Nothing is ever deleted.
- The 18 expense categories seeded on 2026-09-07 become the first categories
  so the list is not empty on day one.

*Alternative considered:* two levels (category → particular) with
sub-category as an optional tag. Rejected: the client asked for three and the
three-level filter and Excel split follow directly from it.

## 5. Partners

Each **partner** has their own account (§2), a name and a profit share
(percentages that total 100). Money that is the partner's rather than a
branch's goes into their account, using three built-in categories under
**Partners** so nothing new has to be learned:

- **Drawing** — a partner takes money out. Expense-like, reduces cash/bank,
  excluded from profit, deducted from that partner's statement.
- **Contribution** — a partner puts money in. Income-like, excluded from
  profit, added to their statement.
- **Paid personally** — a partner paid a business expense from their pocket.
  Recorded as an expense for the account (counts in profit) and as a
  receivable owed to that partner.

The **Partner statement** (owners only) for a period reads: profit for the
period × share % − drawings + contributions + amounts paid personally =
what each partner is due, taken from that partner's own account. Profit is
ledger income − ledger expenses of the **Central Kitchen** account, opening
balances and partner categories excluded (decision of 2026-09-15: the ledger
is the kitchen's books first). Which accounts count towards partner profit is
a flag on the account, so a branch can be brought in later with one switch.
Until POS sales feed the ledger this is the kitchen's *ledger* profit, not
the restaurant's; the Overview tab still shows bill revenue.

## 6. Finance rules (owner switches)

A single settings card, Settings → Finance rules, with these toggles, defaults
as the client asked:

- Clerks can see balances — **off**
- Clerks can see the partners' entries too — **off**
- Clerks can edit their own entries after the day ends — **off**
- Clerks can void their own entries — **off**
- Clerks can record transfers — **off**
- Day ends at — **00:00 IST** (the tills use 02:30; this is deliberately separate)

The rules live in one row per tenant and are read by both the app and the
database policies, so a switch takes effect everywhere at once.

## 7. Screens

**Finance tab, new sub-tabs**

- **Ledger** — the transactions page. Every entry, newest first, with filters
  for account, kind, mode, category, sub-category, particular, partner,
  status, person who entered it, and a free-text search on particulars and
  notes. Sort by transaction date, entry time, amount, category. Tap a row for
  the detail sheet: every field, the settlement link if any, and the **edit
  history** (who changed what, when, old → new). Clerks see the rows
  recorded by clerks here, not the partners'.
- **Outstanding** — open payables and receivables, oldest first, with a Settle
  button that opens the payment form pre-filled.
- **Catalog** (owner) — categories, sub-categories, particulars; add, rename,
  deactivate, reorder.
- **Partners** (owner) — partners, shares, and the statement for a period.

**Entry form** (the sheet the floating "Expense" button already opens):
account · kind · amount · cash/bank · transaction date (defaults to today,
Today/Yesterday chips, calendar) · particular search (fills category and
sub-category) · paid to / received from · reference · notes. Entry time and
person are recorded automatically and shown but never editable.

**Overview tab** (owner): gains a **Books** card — cash and bank balance per
account, ledger income, ledger expenses, outstanding payables and receivables.
The clerk's Overview shows only their own entries for the range.

**Settings**: the Finance rules card (§6). **Staff**: `accountant` appears in
the role picker; the mobile tab set for that role is Finance and Settings.

## 8. Month-end Excel

One workbook **per branch/account**, for a chosen month, from the Ledger's
Export button. Sheets:

1. **Summary** — income and expenses by category and sub-category, cash and
   bank balances at start and end of month.
2. **Transactions** — every entry of the month with all fields, including who
   entered it and when.
3. **Outstanding** — payables and receivables still open at month end.
4. **Partners** — the statement (partner account workbooks only).

Built on the server (`/api/finance/export`), so a phone gets the same file as
the desktop: on web it downloads, in the installed app it opens the share
sheet (email, WhatsApp, Files). A CSV of the current Ledger view stays
available too.

## 9. Database changes (one migration)

New tables, all with `tenant_id`, RLS on, owner/admin full access, clerk
access as in §1:

| Table | Purpose |
| :--- | :--- |
| `finance_accounts` | One per branch and one per partner; opening cash and bank; counts-towards-partner-profit flag; active flag |
| `finance_catalog` | Categories, sub-categories and particulars in one tree: `level`, `parent_id`, `name`, `default_kind`, `sort_order`, `is_active` |
| `finance_partners` | Name, share %, optional link to a staff member |
| `finance_entries` | The ledger: account, kind, status, amount in paise, mode (or from/to for transfers), transaction date, entered at/by, category/sub-category/particular ids plus free-text particulars, counterparty, reference, notes, partner, `settles_entry_id`, settled at/by, void reason/at/by, `updated_at` |
| `finance_entry_revisions` | Written by a trigger on every insert, update and void: who, when, action, the changed fields with old and new values |
| `finance_rules` | One row per tenant with the §6 switches |
| `finance_account_members` | Which accounts a clerk may record into |

Two SQL functions: `finance_can_edit(entry)` (author + cut-off + rules, used
by the update policy) and `finance_balances(account, upto_date)` (cash and
bank balances, used by the Books card and the Excel). The `accountant` value
is added to the staff role check.

The existing `expenses` and `expense_categories` tables have no live rows in
the new module's path and are left in place; the Expenses sub-tab is replaced
by Ledger, and the Overview's expense figures read from `finance_entries`.

## 10. Order of work

1. **Migration + roles + rules + entry + ledger + edit trail.** The clerk can
   record and see their own entries; the owner sees everything with history.
   This alone covers most of the daily use.
2. **Payables, receivables, settlement, transfers, opening balances, Books
   card.**
3. **Catalog screen and particular autofill** (the entry form uses the seeded
   categories until then).
4. **Partners and the statement.**
5. **Month-end Excel.**

Each step ships on its own; nothing waits for the last.

## 11. Left out on purpose

Receipt photos (no storage decided), budgets, recurring entries, approvals,
multi-currency, and the POS-sales income feed. All can be added without
changing what is above.
