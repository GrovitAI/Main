# Kitchen: pending dues and month close

Plan, 16 Nov 2026. The client's ask: keep last month's receivables and payables so each month closes
properly. A bill counts in its own month. A payment moves cash in the month it is made, but is never
that month's expense or income. Payments are usually a lump amount against what is pending, not
against chosen bills.

Scope: the Central Kitchen finances only (the owner's answer). The main app's Finance section is
not touched.

## 1. The rules

| What happens | Counts in that month's figures as | Cash / bank | Pending with the party |
|---|---|---|---|
| Bought, Pay later (exists) | Purchase, on the bill's date | No change | Goes up |
| Bought, paid now (exists) | Purchase | Goes down | No change |
| Spent, paid now (exists) | Expense | Goes down | No change |
| **Spent, Pay later (new)** | Expense, on the bill's date | No change | Goes up (payee) |
| Send to a branch (exists) | Sale to branches | No change | Goes up (branch owes) |
| Pay a vendor (exists) | Nothing (not a purchase or expense) | Goes down | Goes down |
| Received from a branch (exists) | Nothing (not a sale) | Goes up | Goes down |
| **Pending from earlier (new)** | Purchase (vendor) or sale (branch), on its "as of" date | No change | Goes up |
| Opening balance (exists) | Nothing: from before the app | No change | Starting figure |

**Payments go against the total.** A payment is just an amount. The app clears the oldest dues
first, so a statement can say "October cleared, ₹4,000 of November still open". This is the
"balance forward" approach most small-business systems use (oldest first, see Sources). Choosing
bills by hand stays optional, as today. Bills picked by hand are taken first, and the rest of the
payment clears the oldest dues.

**Past months do not change.** The kitchen already counts purchases on their bill date and
payments only as cash. The new rules only add two kinds of entry, so no history moves.

### Decisions taken (the owner could not be asked; easy to change)
1. **Pending from earlier counts in that month's figures**, so October's purchases are complete
   even when October's bills were never entered one by one. It moves no cash and no stock (it
   has no items).
2. **Oldest-first is worked out when a statement is read, not stored.** Nothing has to be kept
   in step when an entry is edited or deleted, and the existing hand-picked matches still count.
3. **Payees for Pay later expenses are vendors.** A landlord or the electricity board is added
   as a vendor with no usual items. No new kind of party is needed.
4. **The "as of" date must be chosen.** No date is filled in for the person (rule: no silent
   defaults, no shortcuts). Day lock applies: a date in a locked month needs the owner, as today.
5. **Permission:** Pending from earlier uses the existing `entries.buy` permission for vendors
   and `entries.receive` for branches. Spent Pay later uses `entries.spend`.

## 2. Database (one migration, staging first)

`supabase/migrations/2026111x_kitchen_pending_dues.sql`, idempotent, RLS and grants unchanged
(no new table):

1. **New entry type `carried`** ("Pending from earlier"): `party_id` required, `amount_paise > 0`,
   `entry_date` = the "as of" date, `note` optional, no lines, `paid = false`. Add it to the type
   check constraint and to `kitchen_post_entry` / `kitchen_edit_entry` validation.
2. **Spent can be Pay later:** allow `type = 'spent'` with `paid = false`, which then requires a
   `party_id` (a vendor). Today a spent entry is always paid.
3. **Balances** (`kitchen_party_balances`): add `carried` (+), and `spent` with `NOT paid` (+). New
   columns go at the end of the view (Postgres rule hit in task 136).
4. **Cash and bank** (`kitchen_money_summary`, Cash/Bank reports): a spent entry moves cash only
   when `paid`. Today every spent entry does.
5. **Reports** (`kitchen_range_report`): Purchases include `carried` for vendors, shown under the
   category "Pending from earlier"; Sales include `carried` for branches, shown as "Brought
   forward"; Expenses include unpaid spent.
6. **New read function `kitchen_party_statement(p_party, p_from, p_to)`**, returning:
   - the opening pending at `p_from`;
   - each entry with its running balance;
   - for every bill, how much is still open, after hand-picked matches first and then the oldest
     dues cleared by the remaining payments;
   - the age buckets (0–30, 31–60, over 60 days) and the oldest open date.
7. **New read function `kitchen_month_close(p_from, p_to)`** (any range, usually a month),
   returning:
   - **totals:** purchases, expenses, sent to branches and drawings by date; cash and bank in and
     out by type; opening and closing cash and bank;
   - **per party:** pending at the start, bills, payments, pending at the end and the oldest open
     date;
   - **the brought-forward entries** of the period;
   - **a check:** the per-party closing pending must equal the balances as of `p_to`.
8. Both functions are `SECURITY DEFINER` with the kitchen access check, like the existing reports.
   Every query is filtered by `tenant_id` and `branch_id`.

Verification on staging: insert sample entries in a rolled-back transaction, compare the
statement and month close against hand-worked figures, and confirm October/November totals of
existing data are unchanged.

## 3. Screens

All on phone (390 px) and desktop, hover on everything clickable, same-size choices, short labels.

### 3.1 Record → Pending from earlier (new form)
Route `/central-kitchen/carried`, a new row in the + Record sheet (phone) and on Home's actions
list (desktop), icon `History`.

| Row | Control (existing component) |
|---|---|
| Who | Branch or vendor picker with search (`PartyList` picker, as in Send / Pay a vendor), then `WhoRow` with the current pending |
| Amount | `AmountRow` + `AmountPad` (phone), typed box (desktop, task 293) |
| As of | `WhenRow` with no date filled in; required |
| Note | `NoteRow`, optional ("October bills") |
| Footer | `TotalBar`: "Tezz: ₹56,000 → ₹1,12,000 pending" and Save |

Editing and deleting work through the existing `EntryActions` (Edit, Delete), as for every entry.

### 3.2 Spent → Expense: Pay later
- New `ChoiceButtons` row **Paid now / Pay later** (equal width), the same control Bought uses.
- **Pay later:** a **Payee** row (vendor picker, "Add a vendor" in place) is required and
  "Paid by" is hidden.
- **Paid now:** as today.

### 3.3 Spent → Pay a vendor and Received: clears oldest first
- Under the amount, a short **"Clears"** preview made by `FifoPreview` (new component). It lists
  the bills this amount will clear, oldest first (for example "12 Oct ₹18,750 · 20 Oct ₹6,000 of
  ₹9,000"), and "₹2,000 paid ahead" when it is more than what is pending.
- "Choose bills" stays as a text link, for those who match by hand (`OpenDocsPicker`, exists).

### 3.4 Branch / vendor statement (PartyDetail, extended)
- **Header:**
  - the pending total;
  - "Oldest due 12 Oct";
  - `AgeingStrip` (new): three equal segments, 0–30 / 31–60 / over 60 days, each with its amount.
    Tapping a segment filters the rows.
- **Filters:**
  - period: `ReportDateRange`, with "All dates" as today;
  - an **Open only** `Toggle`;
  - search by note or amount: existing search box.
- **Rows:**
  - date, kind, amount and running balance;
  - every bill carries a `DueTag` (new): **Cleared**, **₹x left** or **Open**;
  - payments show what they cleared.
- Export CSV (web) / Share (phone), as the reports do.

### 3.5 Month close (new screen)
Route `/central-kitchen/month-close`. It opens from a new **Month close** tab in Analytics
(owners and `reports.view`) and from Money.

**Filters:**
- **Month:** `ReportDateRange` in month mode (the existing date range picker; full-cell 44 px
  targets per the date-range rule). Any range works too.
- **Show:** All / Branches / Vendors, as `Segmented` (equal width).
- **Search:** a party name.
- **Settled parties:** `Toggle`, off by default.

**Sections:**
1. **Month figures:** tiles for Purchases, Expenses, Sent to branches, Cash in, Cash out, and
   Closing cash and bank (the tile style of Money).
2. **Pending at month end:** a table on desktop with Party, At start, Bills, Paid, At end and
   Oldest due, and a totals row. On a phone each party is one row showing name, end pending and
   oldest due; tapping it shows the four figures. Any row opens that party's statement for the
   month.
3. **Brought forward this month:** the Pending from earlier entries.
4. **Check line:** "Ties up with balances" with a tick, or the difference in amber if not.
5. **Export:** the month as CSV / Share (reuse the analytics export).

### 3.6 Smaller changes
- **Branches / Vendors lists:** each row shows its oldest due age ("since 12 Oct"), with a sort
  by pending (`ReportSelect`).
- **History filters:**
  - add the type **Pending from earlier**;
  - add **Unpaid** for Pay later bought and spent entries (`HistoryFilterSheet`, `ReportMultiSelect`).
- **Home tiles:** "Branches yet to pay" and "We owe vendors" pick up the new entries
  automatically, from the balance view.

## 4. Components

| Component | New / existing | Used in |
|---|---|---|
| `FifoPreview` | new, `components/kitchen` | Pay a vendor, Received |
| `AgeingStrip` | new | Statement header |
| `DueTag` | new | Statement rows |
| `MonthCloseTable` (desktop) / `MonthCloseRows` (phone) | new | Month close |
| `fifoClear()` pure helper | new, `kitchen-utils.ts` | Preview; mirrors the SQL for tests |
| PartyList picker, WhoRow, AmountRow/Pad, WhenRow, NoteRow, TotalBar | existing | Pending from earlier |
| ChoiceButtons, Segmented, Toggle, SelectRow | existing | Spent, filters |
| ReportDateRange, ReportSelect, ReportMultiSelect | existing | Statement, Month close, History |
| EntryActions, OpenDocsPicker, HistoryFilterSheet | existing | Edit/delete, hand matching, filters |

Service layer: `kitchen-service.ts` (post/edit the new kinds) and a new
`kitchen-dues-service.ts` (statement, month close). Each function has try/catch, typed results and
friendly errors.

## 5. Tasks and order

| Task | What | Database |
|---|---|---|
| 312 | Migration: `carried` type, Spent Pay later, balances, cash rules, reports | staging, then owner on production |
| 313 | Pending from earlier form + Record entry + History filter | — |
| 314 | Spent Pay later (payee, balances, cash) | — |
| 315 | `kitchen_party_statement` + statement header, ageing, DueTag, Open only | function in 312's migration or its own |
| 316 | `FifoPreview` on Pay a vendor and Received | — |
| 317 | `kitchen_month_close` + Month close screen, tab, export | function |
| 318 | Branches/Vendors oldest-due, sort; QA on phone and desktop; finish review | — |

**Checks per task:**
- local tsc, lint and unit tests (`fifoClear`, the forms);
- the mocked kitchen harness (`kc.cjs`) on phone and desktop;
- rolled-back SQL checks on staging.

**Release:** the migration goes to staging (by me) and to production (by the owner in the SQL
editor). The PR merges after the owner says the SQL has been run. The iPhone gets it by
over-the-air update.

## Sources
- Oldest-first allocation of unapplied payments: [TreviPay](https://trevipay.helpjuice.com/payment-application/what-is-fifo-and-exact-match), [Flawless POS](https://flawlesspos.freshdesk.com/support/solutions/articles/150000180460-how-to-apply-a-payment-to-ap-invoice-and-reviewing-the-account-aging-report), [Thomson Reuters](https://cs.thomsonreuters.com/ua/acct_pr/acs/cs_us_en/clients/cl_clients_scrn_tab_ap.htm)
- Balance forward vs open item: [Sage Intacct](https://www.intacct.com/ia/docs/en_US/help_action/Accounts_Receivable/Payments/select-invoices-for-payment.htm), [NewViews](https://newviews.com/qw_manual_webserver_root/qw_manual/nv2/topics/150220040923175422.htm)
- Month-end ageing check: [Beancount AP ageing](https://beancount.io/blog/2026/10/09/accounts-payable-aging-report-30-60-90-day-buckets-cash-flow-guide)
