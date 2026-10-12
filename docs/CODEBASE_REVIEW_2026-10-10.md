# Codebase review — 10 October 2026

Task 177 follows the new Central Kitchen Attendance feature (task 176). This was a review of the repository, local build, dependency advisories and staging database advisors. It is not a penetration test or a certification that every legacy path is secure. Production was not changed or deployed.

## Changes made

- Printer status and print-job requests now explicitly filter by the authenticated caller's tenant **and selected branch**. A tenant-wide owner can no longer use another branch's registered printer through these endpoints. Normal printing in the selected branch is preserved. Three regression tests cover both denied and allowed requests.
- Batched order-item counts now scope rows through an inner join to their parent order's tenant and branch. The child table has no tenant/branch columns; adding filters against nonexistent columns would break Orders. A regression test checks the join, both filters and quantity aggregation. The existing database filter excluding settled/parked orders remains in place.
- Updated SheetJS from 0.18.5 to the official vendor's 0.20.3 distribution. This addresses the old Excel reader's prototype-pollution and regular-expression denial-of-service advisories. XLSX read/write with decimal quantities and Unicode names, and CSV generation, passed a local roundtrip check.
- Pinned transitive `shell-quote` to 1.12.0, removing the critical command-injection advisory affecting the previous development-tool dependency. Expo SDK 54, React Native, NativeWind and Tailwind major versions are retained.
- Removed unused imports and internal receipt-formatting helpers. Removed redundant introductory text from the new Attendance pane and corrected its navigation comment. Essential report explanations, error recovery and financial terminology remain.
- Attendance uses two scoped reads on focus/date change/explicit refresh, confirms each write before updating the displayed mark, and adds no polling. Its new tables have indexes for daily reads, roster lookup and branch foreign keys.

Primary advisory references: [shell-quote](https://github.com/advisories/GHSA-pqg4-j6r4-53mv), [SheetJS prototype pollution](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6), [SheetJS ReDoS](https://github.com/advisories/GHSA-5pgg-2g8v-p4x9). The SheetJS package comes from its [official installation source](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/).

## Verification

| Check | Result |
|---|---|
| TypeScript | `npm run typecheck` passed |
| Repository lint | `npm run lint`: zero errors, 166 warnings; previously 175 warnings |
| Full local Jest suite | 297 tests across 32 suites passed |
| Web export | 55 routes exported successfully |
| Attendance browser batch | 15 captures at desktop/tablet/390px/320px; no page errors or horizontal overflow; 87 mocked requests, zero forwarded to Supabase |
| Attendance database checks | Authenticated rollback-only fixtures passed duplicate-day, server actor, future-date, immutable identity, branch isolation, archive/history, anonymous read and physical-delete denial checks |
| Public bundle check | Configured local SMTP and PrintNode secret values were absent from the public export; a local service-role key was not configured and could not be checked |
| Dependency audit | 79 findings before → 77 after; critical 1 → 0, high 58 → 57, moderate 20 → 20 |

The public export's main JavaScript bundle is approximately 4.58 MB **uncompressed**. SheetJS is a separate lazy-loaded bundle of approximately 493 kB. Further bundle work should start with measured startup performance and route usage rather than removing features or forcing framework upgrades.

Testing used local/mocked data first. Live work was confined to staging migrations, metadata/advisors and one rollback-only attendance security fixture batch. No broad log scan or recurring usage polling was added. See [testing budget](TESTING_USAGE_BUDGET.md) and [attendance verification](KITCHEN_ATTENDANCE.md).

## Remaining work and release boundary

**The security audit is not clean.** The remaining 77 dependency findings include 57 high and 20 moderate advisories in the existing dependency graph. Several automatic remedies require incompatible Expo/NativeWind major changes or even downgrades. They were not applied blindly. Before a production release, assess reachable affected code, compatible upstream patches and an Expo upgrade in an isolated branch; repeat the same billing, import, printing and native checks after any upgrade.

Staging security advisors also retain existing findings: 19 functions with mutable search paths, 33 authenticated-callable security-definer functions, one extension in the public schema and leaked-password protection disabled. Eleven RLS-enabled tables have no policies; service-only tables can intentionally have this shape. Each function's access and intended role must be reviewed before revoking execution or changing its search path. No new Attendance table/function appeared in those security findings. The two new branch foreign-key index findings were fixed and the indexes verified; existing unrelated index recommendations were not bulk-applied.

Relevant remediation guidance: [function search paths](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable), [security-definer execution](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), [foreign-key indexes](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys).

The 166 lint warnings are mostly legacy unused declarations, hook dependencies and compatibility `require` calls. They remain visible; changing hook dependencies indiscriminately can alter fetch cadence or printing/settlement behavior. Authentication/bootstrap queries and child tables require context-specific scoping rather than a blanket mechanical replacement.

Real iOS/Android hardware, text scaling, keyboard behavior, dark appearance, physical printer output and adversarial penetration testing remain unverified. Existing design documentation also contains stale system-font/navigation prose; the Attendance extension preserved established design tokens rather than rewriting the design system.

Both tasks are staged locally for review. Production databases and deployment are unchanged. The eight pending staging migrations must be reviewed and applied individually before an eventual production feature release; they are listed in `supabase/staging-pending.txt`.
