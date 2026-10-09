# Kitchen background and detail previews — task 171

The user requested a professional background/detail refresh and then asked to
see all three suggested directions before selecting one. These were provisional
previews of Central Kitchen Home and Analytics. Neutral workspace was the
recommendation and initial picker selection, not an approval. The user selected
Blue frame on 2026-10-09 and explicitly requested the existing POS left-sidebar
colour scheme and design. Task 172 applies that scoped selection in staging;
see [the implementation record](../KITCHEN_BLUE_FRAME.md). The picker and its
original captures remain selection history, including the mock solid-navy rail
and white selected row; the final app instead shares the exact POS gradient and
translucent selected row. Neutral and Warm off-white remain unselected.

Start the local comparison server with:

```powershell
node docs/previews/serve-kitchen-backgrounds.cjs
```

Open [the background picker](http://127.0.0.1:8095/kitchen-backgrounds.html).
The staging app runs separately with `npm run staging` on localhost:8081,
with its staff API on localhost:8083. The picker links to staging; changing a
preview never changes the running app.

## Directions for selection

All candidates retain Le Laban action blue (`#0066b2`), white working surfaces,
Source Sans 3, exact money figures, existing semantic money colours and compact
report density. They propose changes to the canvas, desktop rail and quiet
separators, plus clearer desktop rail identity: the text “Le Laban” and a
“Central Kitchen” footer. Phone candidates retain the current bottom navigation.

| Candidate | Character | Canvas | Desktop rail | Separators | Control stroke | Muted text |
| --- | --- | --- | --- | --- | --- | --- |
| Neutral workspace (recommended) | Crisp white reports on a soft grey ground | `#f1f3f5` | `#e9edf1` | `#dde3e9` | `#c7d1dc` | `#516173` |
| Warm off-white | Softer page and warm edges, with the same blue actions | `#f5f2ed` | `#ede8df` | `#e3ded5` | `#cec7bc` | `#605e5a` |
| Blue frame | Navy desktop navigation against a richer blue ground | `#e3ecf5` | `#002d5a` | `#cddcea` | `#b7ccdf` | `#506781` |

These values describe the temporary preview treatments. They were not app
tokens or a new global design system at preview time. Task 172 adopts the
Blue frame canvas as a separate Kitchen token and the user-requested existing
POS rail treatment; it does not adopt this table's proposed separator, stroke
or muted-text substitutions. Report rows remain white with quiet
separators; the preview does not demonstrate alternating row stripes.

## Provenance and controls

The 16 PNGs in `assets/kitchen-backgrounds/` are browser captures of the actual
Expo Home and Analytics frontend: the current design plus three candidates,
each on desktop (1440×900) and phone (390×668). The app is not reconstructed
inside the HTML picker. Captures use synthetic local authentication and
illustrative sample responses; their records and totals are not live business
data. Candidate colour and rail changes were temporary browser overrides.

The picker switches three directions, two devices and two pages. “Compare with
current” shows the matching current-design capture alongside the candidate,
stacking them on narrow screens. “Actual size” preserves captured pixels with
contained scrolling; the default scales images to fit. Query parameters restore
the selected direction, device, page, comparison and size modes. Keyboard
activation, selected-state labels, image descriptions, loading failure messages
and full-size image links are provided. App controls within the images are
static; only the labelled picker controls are interactive.

## Verification — 2026-10-09

- Capture checks cover all 12 candidate/device/page combinations, actual Source
  Sans 3, rail identity on desktop and no report overflow. Typical Analytics
  Sales rows retain measured 53px desktop and 62px phone heights. These are
  measurements of the sample browser captures, not universal row-height or
  native guarantees.
- Picker checks cover all 12 combinations, keyboard Space activation, current
  comparison, actual-size mode and URL restoration. Desktop (1370×731), phone
  (390×668) and small phone (320×700) checks found no page overflow, broken
  images, JavaScript errors or external requests; controls meet a 44px minimum
  height. Actual-size image overflow stays inside its scrolling preview region.
- The preview capture run fulfilled 40 cloud-targeted requests locally and
  forwarded zero to Supabase. Picker verification also used local assets only.
  The existing staging startup script performs an administrator credential
  authentication probe, so these results do not claim zero Supabase use for
  the entire session. No log investigation was required for this preview.
- Independent finish review returned **Ship for presenting these previews for
  selection** after the neutral description was corrected to quiet separators
  and an unnecessary picker transition was removed. The scoped confirmation
  found both fixes resolved on desktop, phone and small phone. This verdict
  approves the comparison artifact, not a candidate direction or native release.
- Read-only local availability checks returned web HTTP 200 and staff-create
  GET HTTP 405. The latter checks route availability without creating a user.

Detailed capture and picker results, scripts and QA images are Git-ignored in
`.impeccable/review/`, including `background-capture-results.json` and
`background-picker-results.json`. For task 171, no app source, shared token, service, database,
migration or production deployment changed. Native iOS/Android appearance,
hardware interaction and text scaling remain unverified.

## Design authority and references

`PRODUCT.md`, `DESIGN.md`, `.impeccable/design.json` and the existing app surface
briefs hold the authority, including the scoped task 172 Blue frame extension.
An unselected comparison does not establish a new visual world. The picker has its own Operate surface brief at
`.impeccable/surfaces/docs-previews-kitchen-backgrounds-html.md`; its browser
controls are comparison tooling, not a new app component specification.

The visual research references for restrained surfaces and functional colour
hierarchy are [Linear’s design refresh](https://linear.app/now/behind-the-latest-design-refresh)
and [Shopify Polaris colour guidance](https://polaris-site-prod-kit.shopify.prod.shopifyapps.com/design/colors).
They informed the alternatives; they do not replace Le Laban’s brand or imply
that either system has been adopted.
