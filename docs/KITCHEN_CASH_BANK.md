# Central Kitchen cash and bank

Task 194 · 11 October 2026 · staging only

The owner asked for separate Cash and Bank balances, because some money moves
in cash and some through the bank. This replaces the earlier "one pot of money"
decision recorded in `PRODUCT.md`.

## Decisions (owner, 11 October)

- **UPI counts as Bank**, since UPI payments settle into the bank account.
- **Move money** records cash deposited into the bank or withdrawn from it.
- **Opening cash and bank** are entered on an as-of date.

## How the balances work

- Money entries already record a mode. **cash** is Cash; **UPI** and **bank**
  are Bank. An entry without a mode (only pay-later buys, which move no money)
  would count as Cash.
- Money in: *Received* from a branch. Money out: *Spent*, vendor payments and
  buys paid on the spot.
- **Balance = opening on the as-of date + money entries and transfers dated on
  or after it.** Earlier entries are not counted, because the opening already
  includes them. Until an opening is set, every money entry counts, starting
  from zero, and the screen says so.
- **A transfer** (Cash → Bank or Bank → Cash) only moves money between the two.
  It changes no sale, purchase, stock or branch/vendor balance. Transfers are
  voided, never deleted, and a repeated save (double tap or lost response)
  returns the first transfer.
- Recording the original entry with the wrong mode is fixed by editing that
  entry, as before.

## Where it shows

- **Home:** two tiles under "Branches yet to pay / We owe vendors": **Cash in
  hand** and **Bank · UPI**. They turn red when negative and open the Cash &
  bank screen. They refresh when Home is shown and after each save.
- **Cash & bank** (`/central-kitchen/money`): both balances; the opening line
  (date, figures, who set it); **Move money** and **Set / Change opening
  balances** editors; what came in, went out and moved for each account since
  the opening; and the transfer list with **Void**. Pull down to refresh on
  phones.

## Database

`20261011170100_kitchen_cash_bank.sql` adds:
- `kitchen_money_openings`: one row per kitchen;
- `kitchen_money_moves`: transfers.

Both have row security, a scoped authenticated SELECT policy, service-role
grants, no anon access and no direct authenticated writes.
`kitchen_money_summary` is security invoker and computes the balances in the
database. `kitchen_set_money_opening`, `kitchen_move_money` and
`kitchen_void_money_move` are security definer with an empty search path; each
checks `auth.uid()` and `kitchen_can_use` and scopes every statement by tenant
and branch. The migration is listed in `supabase/staging-pending.txt`;
production is unchanged.

## Verification

- Staging: one authenticated, rollback-only fixture checked the following:
  - **Opening:** ₹1,000 cash and ₹5,000 bank.
  - **Entries:** ₹200 received in cash and ₹300 by UPI, with ₹50 spent by UPI,
    gave Cash +₹200 and Bank +₹250. An entry dated before the opening was
    ignored.
  - **Transfer:** a ₹150 deposit moved ₹150 from Cash to Bank.
  - **Refused:** a retry with the same key returned the same transfer. A
    changed retry, a same-account move and a future-dated move were refused.
  - **Void:** voiding the transfer restored both balances.
  - **Access:** another tenant and direct table inserts were refused.

  A follow-up read found no fixture rows. Anonymous users cannot execute any
  of the functions.
- Security advisor: the three new security-definer functions are expected (as
  for the invoice RPCs). No other new findings, apart from the deliberately
  policy-less `kitchen_invoice_counters` from task 193.
- Typecheck passed and lint showed no warnings on changed files. The new
  `kitchen-money.test.ts` (6 tests) and the full suite (36 suites, 339 tests)
  passed.
- Mocked Playwright against the staging web app at 1440×900, 390×844 and
  320×700 checked:
  - the Home tiles, including a negative cash figure;
  - opening the screen;
  - the no-opening notice and empty transfer list;
  - setting the opening;
  - the over-balance warning;
  - saving a deposit, with the expected balances;
  - voiding it.

  60 requests were intercepted and none forwarded. There were no page errors
  or horizontal overflow. One defect was found and fixed: the amount fields
  had no visible labels.
- The design detector found nothing. Native hardware remains unverified.

## Not included yet

The Analytics **Cash** report still totals all money together. A Cash/Bank
split there is a possible follow-up.
