# POS analytics desktop previews

Task 196 · 11 October 2026 · preview only

The owner shared a reference dashboard (soft white cards, rounded columns
against light tracks with a highlighted peak, a ring chart, change chips, and a
sidebar card with a monthly figure). They asked for three desktop previews of
the POS analytics page in a similar style.

## Owner's answers

- **Colours:** Le Laban blue, matching the POS and kitchen, rather than the
  reference's lavender.
- **Leads with:** sales and money.
- **Sections:** all of the current page's sections. That means:
  - sales trend;
  - rush hours;
  - payment split;
  - best and slow sellers;
  - recent bills;
  - franchise royalty;
  - money details (collected, pending, discounts, GST, cancelled).

## The three layouts

The look is fixed (Le Laban blue, Source Sans 3, the existing POS sidebar), so
the previews differ in structure. Impeccable's surface concept seed
(`d0718abc`, operate mode) chose three structures from a ranked list of seven.

1. **Daily statement:** a money summary card first, with total sales, orders,
   average bill and items sold, plus a bar showing collected against pending
   and five money figures. Then labelled sections read top to bottom: Sales,
   When customers come, Menu, and Bills and royalty.
2. **Menu insight:** four money cards, then a large chart placing each dessert
   by quantity sold and revenue. Its four zones are Stars, Premium picks, Crowd
   pleasers and Slow movers, with a ranked list beside them. The trend, payment
   mix, rush hours, bills, money details and royalty follow.
3. **Branch split:** four combined money cards and a Kolathur / Velachery share
   bar. Then two matching branch cards, each with sales, change, a 7-day
   chart, payment mix, best seller, busiest hour, pending amount and top
   three. Combined charts, bills, royalty and items follow.

All three use the existing POS sidebar with an October sales-target card, a
header with search, date range, branch filter and Export, and change chips.
Columns stand against full-height light tracks with a thin last-week marker,
and the busiest day or hour is highlighted.

## Open it

```bash
node docs/previews/serve-pos-analytics.cjs
```

Then open `http://127.0.0.1:8096/pos-analytics.html`. Keys 1–3 or the top
buttons switch layouts, and `#statement`, `#menu` or `#branches` links straight
to one. Screenshots at 1440 px are in `docs/previews/assets/pos-analytics/`.

## Data and limits

All figures are **sample data**, labelled on the page. They are not Le Laban
figures. The page loads no remote assets and makes no Supabase requests.

The current analytics service already provides almost every number shown:
KPIs, daily and hourly sales, payment split, item performance and bills. Three
things would need new work:
- the "vs last week" comparison;
- the per-branch breakdown;
- the monthly sales target.

## Checks

Playwright captured each layout at 1440×900 and 1280×800. There were no page
errors and no external requests, the brand font loaded, and there was no
horizontal overflow. Keyboard switching worked.

One batch of fixes followed the first review:
- the switcher no longer overlaps the page;
- last-week tracks and markers are visible;
- the chart labels no longer collide;
- bill numbers and hour labels no longer wrap;
- the busiest-hours sentence spacing is fixed.

These are previews only. No layout is chosen, and no app code, database or
production change was made.
