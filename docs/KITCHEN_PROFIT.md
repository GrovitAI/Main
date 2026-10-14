# Central Kitchen: cost of finished goods and profit

Task 209 · 14 October 2026 · staging source

The owner chose a typed cost per unit (not recipes) and a Profit report.

## Cost per unit

- **Where it is set:** a finished good's form has **Costs us, ₹ per unit**,
  below the selling price. It means what one kg, litre or piece costs the
  kitchen to make: ingredients and packing. The form shows the profit per unit
  and the margin while typing.
- **Optional:** leaving it blank means "not set".
- **Who sees it:** the field shows only for logins that see amounts. A save by
  any other login leaves the cost unchanged.
- **Kept on each send:** every send line stores the cost of that day
  (`kitchen_entry_lines.cost_paise`, stamped by a trigger), so changing a cost
  later does not rewrite past months.
- **Older sends:** sends from before a cost was set use the item's current
  cost.
- **Edits:** editing a send posts a new one, so it takes the cost of the day of
  the edit.
- **Where it shows:** the finished-goods list and the item detail show
  "costs ₹…" or "no cost set".

## Profit report

Analytics has a **Profit** tab beside Sales, Purchases, Cash and Bank. Logins
that do not see amounts do not get the tab.

The statement at the top:

    Sales to branches
  − Cost of goods sent        (quantity × cost per unit)
  = Gross profit              (with margin)
  − Other expenses            (Spent entries: salaries, gas, rent …)
  = Profit for the period     (with margin)

**Purchases are not subtracted again.** Their cost is inside each finished
good's cost per unit; the statement shows the period's purchases for
comparison.

**Items with no cost:** when finished goods were sent without a cost, a
notice says how many there are and what they sold for. Their cost counts as
zero, so profit reads high until costs are set, and a button opens Finished
goods.

**Rows:** one row per finished good, showing quantity sent, sales, cost,
profit and margin. CSV export adds a Cost column.

## Database (staging only until promoted)

- `20261014100200_kitchen_finished_goods_cost.sql`:
  - `kitchen_items.cost_price_paise` and `kitchen_entry_lines.cost_paise`;
  - the `kitchen_line_cost_snapshot` trigger.
- `20261014100300_kitchen_report_profit.sql`:
  - `kitchen_range_report` gains the `profit` report;
  - the summary adds `cost_paise`, `cost_missing_items` and
    `cost_missing_sales_paise`.
- **App compatibility:** the app still loads items from a database without the
  cost column, just without costs. The report parser treats the missing
  summary fields as zero.

## Checks

- **Staging rollback test:**
  1. set a cost of ₹40;
  2. post a send of 3;
  3. change the cost to ₹90;
  4. the line kept ₹40, and the report showed cost ₹120 against sales ₹300.
- **Mocked browser check:** the cost field and margin hint, and the Profit tab
  on desktop and phone.
- **Unit tests:** parsing, CSV, item save and the fallback.

## Limits

- **Cost per unit is a typed estimate.** Profit is only as good as the costs
  entered. Recipe-based costing was not chosen.
- **Stock on hand is not valued.** Profit follows what was sent, not what was
  made.
