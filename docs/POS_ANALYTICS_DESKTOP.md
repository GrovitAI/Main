# POS analytics on desktop: Daily statement

Task 197 · 11 October 2026 · staging source

The owner chose layout 1, **Daily statement**, from the task 196 previews. They
asked for improvements over the preview, the project's design skills, no
questions, and a more premium chart colour mix. On desktop web (1024 px and
wider) `/analytics` now uses this layout. Phones and tablets keep their
existing screens. Filters, loading, exports and the royalty setting are shared
with the existing screen.

## What it shows

1. **Header:**
   - title, plus a scope line with branch and period (it says "last successful
     load" when a reload fails);
   - Today / Yesterday / 7 days / 30 days / This month / Custom;
   - the date button and the business-hours toggle;
   - owner branch buttons;
   - Item sales and Export transactions.
2. **Money card:**
   - a 48 px total-sales hero figure and its change against the previous
     equal period;
   - orders, average bill and items sold, each with its own change;
   - a collected/pending bar, plus collected, pending, discounts, GST and
     cancelled figures.
3. **Sales by day** and **Payment mix:**
   - Sales by day shows the period total and this period against the previous
     one, as paired columns with a hover tooltip and the best day.
   - Payment mix is a ring with UPI, cash and card shares and amounts.
4. **Rush hours** (hourly columns, busiest hour, and a sentence naming the
   busiest three-hour window and its share) and **Orders by day**.
5. **Menu:** best sellers by quantity, top revenue, slow movers (with a
   prompt), then **Item sales**. That is every item with quantity, revenue and
   share, as list rows.
6. **Franchise royalty:** off or on, with rate controls, the store share and
   the fee.

Loading, error and empty states are handled. "Vs previous period" comes from
one extra read of the existing analytics service for the equal-length period
before the chosen one. Nothing shows while it loads, and it says "Comparison
unavailable" if that read fails. No database change.

## Chart colours

These were chosen with the dataviz skill and checked with its validator
against the white card surface. They are stored as `chart` in
`src/lib/pos/brand.ts`.

| Role | Colour | Use |
|---|---|---|
| series1 | `#0066b2` Le Laban blue | sales, UPI, best sellers, item revenue |
| series2 | `#14a38b` teal | cash, top revenue |
| series3 | `#7a5af5` violet | card, slow movers, royalty fee |
| previous | `#7ab4e4` light blue | the previous period (lighter step of series1) |
| pending | `#d97706` amber | money not yet collected; its label stays in text colour |

The three series colours pass the all-pairs check: colourblind separation 10.7
(target 8), normal-vision 15.9 (floor 15), and every mark at least 3:1 on white.
The previous-period step passes the ordinal check at 2.22:1.

The marks follow dataviz rules:
- columns at most 24 px wide, with a 4 px rounded top and a square base;
- a 2 px gap between paired columns and between ring segments;
- one direct label, on the peak;
- legends for two-series charts;
- tooltips on hover, focus or tap.

## Process and checks

- **Skills:** Impeccable for the direction, design rules, detector, finish
  review and documentation; dataviz for chart form and colour.
- **Typecheck and tests:** typecheck passed, with no lint warnings in the new
  files. The full suite passed: 36 suites, 339 tests.
- **Browser checks:** mocked Playwright against the staging web app at 1440×900
  and 1280×800 with owner data and a previous period checked:
  - the hero figure and change;
  - every section;
  - the tooltip ("Previous period ₹70,276 · +3%");
  - branch re-query;
  - the empty state and error-after-empty;
  - the rush summary.

  46 requests were intercepted and none forwarded to the cloud, with no page
  errors or horizontal overflow. Phone (390 px) and tablet (900 px) still show
  their previous screens.
- **Fixes found on the way:**
  - the bottom navigation covered the last card;
  - ₹1.00L axis ticks;
  - a 0% change shown as green "up";
  - Best sellers ranked by revenue with a quantity bar;
  - a silent error over the empty state.
- **Independent Impeccable finish review:** it returned **fix** with eight
  items:
  1. remove the section eyebrow labels;
  2. scope and empty copy must follow the shown load, and the comparison needs
     loading and failure states;
  3. the ring arcs overlapped;
  4. replace Unicode arrows with icons;
  5. replace side stripes with swatches;
  6. 44 px targets;
  7. 12 px minimum text;
  8. a hover colour token.

  All were applied in one batch. The verdict pass scored all eight resolved,
  with disposition **ship** for those fixes. Its one minor note (Menu card
  heights) was fixed by top-aligning the cards. The ship verdict covers the
  eight fixes, not a new whole-surface review.

## Limits

Not tested on real touch POS terminals or native builds; the desktop layout
only runs on web. Production is unchanged until this branch is released.
