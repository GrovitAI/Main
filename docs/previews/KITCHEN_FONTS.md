# Kitchen Analytics font comparison — task 169

The user asked to preview the suggested professional font families on the
frontend before selecting one. Open `kitchen-fonts.html` through the local
preview server:

```powershell
node docs/previews/serve-kitchen-fonts.cjs
```

Visit http://127.0.0.1:8094/kitchen-fonts.html. Inter is the recommended initial
option; IBM Plex Sans, Source Sans 3 and the current browser font are also
available. Phone/Desktop, Sales/Purchases/Cash, comparison with current and
actual-size controls work independently. Query parameters preserve the selection.

## What the preview shows

The 24 report images are Playwright captures of the actual task 168 Expo web
frontend, using synthetic local authentication and mocked sample report data.
They are not a reconstruction of the report in HTML. Custom font faces were
loaded locally and applied through a temporary browser stylesheet. No application
source file, global font configuration, data, service, schema or deployment was
changed. The app still uses its existing typography.

Each capture retains the current font sizes, weights, layout and report behavior;
font metrics can change text wrapping. The specimen below the captures separately
shows a suggested 400/500/600/700 hierarchy. The controls inside the report images
are static; the labelled controls above them switch the captured reports.

Captures are 390×668 for phone and 1440×900 for desktop, with additional 320×700
browser checks. This is browser evidence, not proof of native iOS/Android
rendering or Dynamic Type. A selected font should be integrated with Expo's
static font support and checked on native devices before release. The current
font baseline is Windows Chrome's computed platform font stack and may differ
on another operating system.

## Verification (2026-10-09)

- All four families across three reports and two viewports: actual font loaded,
  computed family checked, no horizontal report overflow, unchanged typical row
  heights (62px phone; 53px desktop Sales/Cash, 61px desktop Purchases).
- Preview checks cover all 24 image selections, comparison, actual-size controls,
  deep links, keyboard activation, contained scrolling and 44px button heights
  at 320/390/1024/1440px widths. No JavaScript errors or external asset requests.
- All Supabase requests were intercepted and fulfilled locally. Zero cloud
  requests were forwarded; no log scans or live database checks were needed.
- Detector's missing-source finding was corrected by assigning the initially
  hidden baseline image its real source. Metadata below 12px was raised to 12px.
  Remaining typography advisories are intentional: this requested font comparison
  contains Inter and multiple families, and its 16px specimens/preview controls
  sit outside the incumbent app's type ramp. Dense 12px preview captions are
  separate from 16px live specimens and the unchanged app captures. The app's
  DESIGN.md is not rewritten by an unselected preview.

Temporary capture/verification scripts, detailed results and QA screenshots are
Git-ignored in `.impeccable/review/`. App source is unchanged, so application
typecheck/unit checks were not rerun for this artifact-only task.

## Assets and licenses

`assets/fonts/` includes static Regular 400, Medium 500, SemiBold 600 and Bold 700
TTF files for each candidate. Files were sourced from the Expo Google Fonts
repository, with each family's SIL Open Font License included alongside them.
They are preview assets; they are not registered or imported into the app bundle.

- [Expo Google Fonts](https://github.com/expo/google-fonts)
- [Inter](https://rsms.me/inter/)
- [IBM Plex Sans](https://www.ibm.com/design/language/typography/typeface/)
- [Source Sans 3](https://github.com/adobe-fonts/source-sans)

No font family has been selected or approved for application-wide use yet.
