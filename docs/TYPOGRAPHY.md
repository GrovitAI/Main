# Source Sans 3 — task 170

The user selected **Source Sans 3** from the task 169 frontend font comparison
on 2026-10-09. It is implemented in staging source for shared interface text and
text inputs. Existing text sizes, spacing and weight roles are preserved; this
task does not redesign screens, reports or business behavior.

## Implementation

- `src/lib/pos/brand.ts` owns the family and face-name tokens.
- `public/fonts/` contains local static Regular 400, Medium 500, SemiBold 600 and
  Bold 700 TTFs and the SIL Open Font License. Total font payload is about 1.5 MB;
  no external font CDN is used. Expo copies these files into the static web
  export, and native code bundles the same files through static asset requires.
- Native `useAppFonts` loads all four named faces with the existing `expo-font`
  dependency. Web loads each face once with its real CSS weight through the
  browser FontFace API. PostScript names were verified against all filenames.
- `Typography.tsx` exposes shared Text/TextInput primitives with NativeWind
  interop. Only their imports were changed across 81 existing UI files, except
  two old Outfit declarations removed from Orders. Existing layout, events,
  controlled values, refs, accessibility and font scaling props are retained.
- NativeWind resolves native weights before the primitive selects the matching
  static face. Native weight is then normal to avoid applying synthetic bold
  over an already bold file. Nested Text inherits the parent's intended weight.
  Existing 800/900 roles use the available Bold 700 face, matching the selected
  preview's nearest-weight behavior; no extra weights are downloaded.
- `StyleSheet.flatten` is used only to inspect existing supplied typography;
  no new StyleSheet styling system was introduced. Explicit custom families
  such as monospace remain respected. Printed documents, SVG chart libraries
  and the intentionally independent startup error screen retain their own
  typography.

Font readiness is provided at the root without delaying route mounting. Routes
still mount immediately after authentication restores. Pending/failed downloads
keep the platform font; successful arrival switches to Source Sans 3 without
remounting fields or losing entered values. The five-second web timeout never
blocks interaction and late successful loading can still apply the font.

## Verification

- TypeScript check and lint of changed sources passed.
- 34 local tests passed: shared typography, inherited bold money/tabular styles,
  controlled-input behavior, fallback styling, phone-frame behavior, report
  calculations and 18 native route imports.
- Playwright used local sample authentication and intercepted every Supabase
  request. Actual report checks cover phone/desktop and widths down to 320px,
  all report tabs, filters, calendar draft/Apply, detail/back, action menu,
  CSV, large figures and empty/error recovery. Existing typical row heights
  and report composition are preserved.
- Additional local browser checks confirm Source Sans 3 on visible Menu,
  Staff creation and kitchen item-form fields, and phone login. Blocked-font
  login remains editable; deliberately pending downloads permit sign-in form
  use, then swap fonts while preserving the entered email. Zero cloud requests
  were forwarded and no database/log scans or writes were made.
- Initial form assertions mistakenly included the native Switch's browser
  checkbox and a hidden retained login input. The focused follow-up waits for
  visible text fields and confirms their fonts; these were harness issues,
  not application font defects.
- A local staging web export succeeded for all 51 static routes and includes
  the four fonts under `/fonts/`.
- Independent source review identified a startup delay from gating routes on
  fonts. It was removed; the reviewer confirmed no remaining material source
  issues. Native hardware appearance, keyboard behavior and OS text scaling
  still require release checks; route-import tests are not native visual proof.

Temporary scripts, captured screens and detailed results are Git-ignored in
`.impeccable/review/source-font-*`. Staging code only: no production deploy,
database migration, query or polling change.
