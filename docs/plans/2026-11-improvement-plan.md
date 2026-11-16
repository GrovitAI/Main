# Le Laban app: where to improve next

Review, 16 Nov 2026. It is based on measurements of this app and on well-known guidance:
- Expo's own documentation;
- Callstack's *Ultimate Guide to React Native Optimization*;
- Shopify's FlashList work;
- Supabase's database and row-security performance notes.

The measured numbers come from a production web build with sample data, the phone layout with the
CPU slowed 4×, which is roughly a mid-range phone.

## Already done this month
| Change | Measured effect |
|---|---|
| Task 308: sheets fade and rise instead of the system slide | Sheet starts moving in 40–75 ms, no dropped frames |
| Task 309: only the icons in use ship; invoice badge loads on print; Stock prepared in the background | Main web file 5.7 → 3.9 MB; first load 3.1 → 2.4 s, longest freeze 0.81 → 0.22 s; Stock tab 0.32 → 0.14 s |
| Task 310: Analytics shows its load time, with Refresh | Fixes stale figures after coming back to the tab |
| Task 311: compact bill (PR #17, waiting for the owner) | 37 → 16 lines for a one-item bill |

Polling is already disciplined: it runs only on the focused screen while the app is in front
(`use-active-interval.ts`). The database performance checker raises no warnings, only
informational notes.

## Priorities

### 1. Measure the till app (Orders, billing, Menu)  — high
The tills are used all day, yet only the kitchen has a sample-data harness. Next step:
- Build the same mocked harness for the main app, with menu items, open orders and settings.
- Time the paths staff use all day: open Orders, add items, send KOT, bill, settle, reprint, and
  switch tabs.
- Fix whatever is over 100 ms of input delay at phone speed.

Without this, any speed work on the tills is a guess.

### 2. Turn on the React Compiler — high value, needs a careful trial
- **What it is:** SDK 54 supports it with `experiments.reactCompiler: true`. It memoises
  components automatically, so a change in one place stops redrawing unrelated parts of the
  screen. ([Expo guide](https://docs.expo.dev/guides/react-compiler/), [React Compiler 1.0](https://de.react.dev/blog/2025/10/07/react-compiler-1))
- **Why it fits here:** the slow spots measured here are almost all React and React Native Web
  redrawing, not our own logic. Stock took 706 ms of work at 4× slower CPU; Analytics 520 ms.
- **Reported gains:** 18–34% less JavaScript-thread time on list screens, but from a single
  author, not a benchmark ([write-up](https://reactnativerelay.com/article/react-compiler-react-native-expo-2026)).
- **Plan:**
  1. Enable it on a branch and run the full tests.
  2. Re-time the kitchen and the tills with the harness.
  3. Add the compiler's lint plugin to catch code it cannot optimise.
  4. Ship only if the numbers improve and nothing behaves differently.
- Expo labels it experimental, so measure before and after.

### 3. Split the web app per screen — medium
- **What:** with `asyncRoutes: { web: true }` (expo-router plugin option), each screen downloads
  when it is first opened. A kitchen login would then never download the till's
  7,300-line Inventory screen (205 KB) or Finance. ([Expo async routes](https://docs.expo.dev/router/web/async-routes))
- **Expected effect:** a smaller first download and less script to read at start, on top of
  task 309.
- **Cost and plan:** the first visit to each screen fetches its file. To keep that invisible,
  pre-load the next likely screens when idle, as task 309 does for Stock. Try it on staging and
  time the first open of each tab.

### 4. Faster long lists (FlashList v2) — medium, later
- **What:** History, the menu, Orders history and invoices use `FlatList`. FlashList v2 recycles
  rows instead of creating new ones, and is reported to be much lighter on long lists.
  ([Shopify](https://shopify.engineering/instant-performance-upgrade-flatlist-flashlist), [FlashList](https://github.com/shopify/flash-list))
- **Requirement:** the New Architecture, which is the default in SDK 54.
- **Rule change needed:** AGENTS.md says "FlatList for all lists", so the rule changes first.
- **Plan:** start with History and the menu, and measure the scroll and first draw.

### 5. Break up the Inventory screen — medium
`src/app/(app)/inventory.tsx` is 7,300 lines in one component (205 KB, the biggest file in the
app). Move each tab into its own component file, one tab per task, without changing behaviour.
That makes each tab cheaper to redraw, and lets async routes (item 3) and the React Compiler
(item 2) do more. This moves code into smaller files; it is not a rewrite.

### 6. Know about lag on real phones — medium
Today there is no crash or performance reporting from the installed app, so phone lag is only
known when someone mentions it. Add crash and slow-screen reporting, for example Sentry for
React Native/Expo, with no personal data, to see real slow screens and errors on the tills and
phones. This needs the owner's account.

### 7. Database safety (from Supabase's security checker on staging) — medium
- **Leaked-password protection is off:** turn it on in Supabase Auth. It is one switch in the
  dashboard, for the owner.
- **52 database functions can be called by any signed-in user:**
  - Most are the app's own actions, which is correct.
  - A few are never called by the app: the number counters `next_invoice_number` and
    `next_branch_sequence`, `finance_post_source_entry` and `finance_adjust_source_entry`.
  - `check_rate_limit` is called only by the server.
  - Plan: for each one, check it is not used inside an access rule (rules need it callable),
    then take away direct calling from signed-in users, in one migration, staging first.
- **Tables with row security but no policy (16):** intentional, as these tables are reached only
  through functions. No change.
- **`pg_trgm` in the public schema:** low priority; leave it.
([Supabase linter](https://supabase.com/docs/guides/database/database-linter))

### 8. Database speed — low, measure first
- **The checker's notes:** 96 table links with no index, and 64 indexes never used (staging).
- **Supabase's advice:** index the columns that policies and filters use, and back out indexes
  that don't help. ([RLS performance](https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv))
- **Plan:** with the owner's OK, read production's slowest queries (`pg_stat_statements`,
  read-only), then add indexes only for the queries that are slow. No blanket indexing.
- **Already right:** policies are written the fast way, as the checker finds no
  `auth_rls_initplan` warnings.

### 9. Smaller follow-ups
- **Reprint:** it still prints the old long bill (`src/services/printService.ts`). Move it to the
  compact layout from task 311 once the owner approves it.
- **Kitchen Analytics:** the first visit takes 0.29 s to respond at phone speed. Show the
  summary first and draw the charts a moment later.
- **iPhone:** publish an over-the-air update after each merge (`eas update --channel
  production`). The owner runs it; the safety check blocks me from doing it.

## Suggested order
1. Till harness and measurements (1)
2. React Compiler trial (2)
3. Database safety migration and the password switch (7)
4. Kitchen pending dues and month close (separate plan: `2026-11-kitchen-dues-and-month-close.md`)
5. Async routes (3), Inventory split (5), FlashList (4), crash reporting (6), database speed (8)

## Sources
- Expo: [React Compiler](https://docs.expo.dev/guides/react-compiler/), [Async routes](https://docs.expo.dev/router/web/async-routes)
- React: [React Compiler v1.0](https://de.react.dev/blog/2025/10/07/react-compiler-1)
- Callstack: [The Ultimate Guide to React Native Optimization](https://callstack.com/ebook/the-ultimate-guide-to-react-native-optimization)
- Shopify: [FlatList to FlashList](https://shopify.engineering/instant-performance-upgrade-flatlist-flashlist), [FlashList on GitHub](https://github.com/shopify/flash-list)
- Supabase: [RLS performance and best practices](https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv), [Database linter](https://supabase.com/docs/guides/database/database-linter)
