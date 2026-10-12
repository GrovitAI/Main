---
version: 1
slug: "docs-previews-kitchen-backgrounds-html"
primary_target: "docs/previews/kitchen-backgrounds.html"
related_targets: ["docs/previews/serve-kitchen-backgrounds.cjs", "docs/previews/KITCHEN_BACKGROUNDS.md", "docs/previews/assets/kitchen-backgrounds"]
---

# Central Kitchen background comparison

Scope: task 171 preview-only direction comparison for Central Kitchen Home and
Analytics. Mode: Operate. The user must be able to compare all three proposed
background/detail treatments before choosing one. No candidate is selected for
the application; Neutral workspace is the recommended initial picker value.

THESIS: Compare the same working screens and sample figures across three
background treatments, making the colour and navigation differences easy to
judge without changing the app.

OWN-WORLD: Preserve the incumbent Kitchen Ledger authority in PRODUCT.md,
DESIGN.md and its sidecar. Retain Le Laban action blue, Source Sans 3, semantic
money colours, exact figures, compact rows and phone bottom navigation in every
candidate. The provisional options are Neutral workspace (soft grey canvas and
quieter rail), Warm off-white (warm canvas and separators) and Blue frame
(richer blue canvas and navy desktop rail). Desktop candidates add “Le Laban”
text identity and “Central Kitchen” in the rail footer. None establishes new
shared tokens or an approved replacement world. White report rows use quiet
separators; do not describe alternating stripes.

STORY: Choose a direction, switch Desktop/Phone and Analytics/Home, compare it
with the matching current-design capture, then inspect actual-size pixels or
open the full image. URL state restores the comparison. The separate staging
link opens the existing app; picker choices only switch local images.

FIRST VIEWPORT: Title and short comparison purpose, three labelled directions,
device/page controls, comparison and actual-size controls, then the selected
direction description and capture dimensions. The local-sample/static-image
notice precedes the capture. On narrow screens, direction controls form one
column and comparison captures stack. Actual-size mode confines horizontal
scroll to the image stage rather than the whole page.

FORM: Self-contained local HTML comparison tool using actual Expo web captures,
not recreated app markup. Sixteen PNGs cover current plus three candidates,
Home/Analytics and desktop 1440×900/phone 390×668. Synthetic local authentication
and mocked illustrative records supply the captures. Temporary browser colour
and rail overrides supply the candidate details; app source is unchanged.
Typical sampled Analytics Sales rows measure 53px desktop and 62px phone.
Picker buttons and links retain 44px minimum targets, focus-visible feedback,
keyboard activation, selected-state labels, meaningful image descriptions and
image-error messages. Selection updates instantly without a decorative
transition. All required assets are local.

FINISH: 2026-10-09 browser checks cover all 12 candidate/device/page selections,
comparison, actual size, URL restoration and keyboard Space. Picker frames at
1370×731, 390×668 and 320×700 show no page overflow, broken images, JavaScript
errors or external requests. Capture checks forwarded zero of 40 cloud-targeted
requests; staging startup's existing authentication probe means this is not a
whole-session zero-usage claim. Independent scoped review returned Ship for
presenting the previews after quiet-separator wording and removal of the picker
transition were confirmed. No direction or native release was approved.

BOUNDARY: No app source, shared token, database, service, migration or production
deployment change. PRODUCT.md, DESIGN.md, .impeccable/design.json and existing
app surface briefs are preserved. Native appearance, hardware interaction and
text scaling remain unverified. Full provenance and references are recorded in
docs/previews/KITCHEN_BACKGROUNDS.md; QA evidence remains Git-ignored under
.impeccable/review/.
