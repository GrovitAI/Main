# Central Kitchen analytics — design evidence

Date: 2026-10-08. Scope: the local, interactive HTML alternatives **Monthly
overview** and **Report workspace**, before staging implementation. Requirements
and direction contract: [KITCHEN_ANALYTICS_PLAN.md](KITCHEN_ANALYTICS_PLAN.md).
Product truth remains [PRODUCT.md](../PRODUCT.md); the incumbent visual system
remains [DESIGN.md](../DESIGN.md).

Artifact:
`C:/Users/Might/.codex/visualizations/2026/10/05/01a10c91-a0ad-7b12-9c39-3f9dc9598875/kitchen-analytics.html`.

An identical repository copy at
[docs/previews/kitchen-analytics.html](previews/kitchen-analytics.html) keeps the
preview reviewable on `codex/kitchen-analytics`. SHA256 was checked for both
copies and matches:
`4F737347638105F72BF75E11B4DB8DB4A318BE6B4F9AAA9A222FF268D5E6DF4F`.
`PROJECT_CONTEXT.md` records Task 155 as preview review with client feedback
pending and no app/schema changes.

## Inherited system

The preview extends the Kitchen Ledger with traceable monthly purchases and
goods supplied to branches. It retains the established visual identity; no
durable design-system changes are needed for this extension.

- **Palette:** the light preview uses Le Laban blue (`#0066b2`), pale blue canvas
  (`#e8f2fa`), white surfaces, Ink (`#0f2744`), muted Ink (`#5b6b7c`), Stroke
  (`#c5d9eb`) and Blue Wash (`#dbeafe`). Semantic green/red remain available for
  cash direction; amber marks missing category information, not profitability.
- **Typography:** system sans, tabular numeric figures and Indian rupee grouping.
  Observed HTML roles include 24px desktop headings, 17px section titles,
  13–14px report text, 12px labels/captions and 20px summary figures at weight
  800. Phone fields use 16px text. These source values describe this preview;
  they do not replace the incumbent type tokens.
- **Material:** flat white panels on the tinted canvas, fine dividers, rounded
  corners and no gradients or shadows. Panel fields now use flat tinted wells
  with transparent borders, preserving the No Box-In-Box rule. Controls remain
  at least 44px tall and retain visible keyboard focus outlines.
- **Desktop:** compact navigation beside the content, a shared monthly header,
  and either paired reports or a report-tab workspace. Category rows lead to
  local detail; the selected report can be exported as mock CSV.
- **Phone:** content stacks rather than scaling down desktop. Below the preview's
  560px container breakpoint the rail disappears, filters become full-width
  stacked fields, and table rows become labelled two-column blocks. Phone
  preview mode is capped at 390px; the five kitchen tabs remain visible.

Named incumbent rules retained: One Blue, No Shadow and No Box-In-Box. Preview
fallbacks, alternate dark CSS values and source-specific measurements are not
new normative tokens. The existing stale `.impeccable/design.json` sidecar and
unset `buildPath` remain pre-existing drift and were not repaired or canonized.
`PRODUCT.md`, `DESIGN.md` and `.impeccable` files were left unchanged.

## Review disposition

The initial independent review requested three corrections. The final targeted
independent review returned **ship for these three scored fixes only**:

| Finding | Corrected behavior | Evidence |
| --- | --- | --- |
| Phone filter values were truncated | Stacked fields preserve complete selected values | Corrected phone filter capture |
| Combined spending omitted its source | Rows identify Purchase or Other expense; CSV has Source, preserves the selected category and includes totals | Corrected spending capture, export source and reported CSV verification |
| White bordered controls nested inside panels | Flat tinted fields retain 44px targets and focus outlines | Corrected desktop and phone captures, CSS source |

The targeted reviewer observed no regressions in the supplied correction
captures. This disposition does not approve the future application or schema.
Cash visuals, complete history rows and loading/error states retain the initial
verification limits. Native behavior has not been verified.

The parent session's browser verification record covers branch/item totals,
category drilldown, vendor defaults and purchase overrides without rewriting
old categories, filtered CSV totals, an empty month and recovery, All spending
and separate cash totals. Its 320px and 1024px width checks found no overflowing
report controls. Script syntax passed and the static design detector returned
`[]`. These are local preview checks, not production readiness evidence.

## Screenshot provenance

All files below are in the same visualization directory as the artifact. They
were authored by the local CUA screenshot API from the actual local HTML
preview. They contain synthetic figures and vendors. No AI-generated raster,
external image assets or external reference screenshots were used.

| File | Viewport | Capture scope |
| --- | --- | --- |
| `kitchen-overview-desktop.png` | 1440px | Monthly overview desktop evidence |
| `kitchen-review-spending-desktop.png` | 1440px | Corrected combined spending, source labels and tinted fields |
| `kitchen-purchases-1024.png` | 1024px | Initial capture before the three targeted corrections; not proof of corrected fields |
| `kitchen-overview-phone.png` | 390px | Initial overview first viewport; not proof of corrected filters |
| `kitchen-review-filters-phone.png` | 390px | Corrected stacked filters and labelled purchase rows |
| `kitchen-review-sales-phone.png` | 390px | Corrected sales filters and phone table layout |

The documentation pass inspected the HTML source and the corrected filter and
spending captures directly. The capture provenance and targeted verdict above
are supplied by the parent review session.

Both alternatives run solely in the browser using synthetic data. They make no
Supabase calls and introduce no app, schema or production changes. Client
selection of the report composition and category scope precedes staging work.
