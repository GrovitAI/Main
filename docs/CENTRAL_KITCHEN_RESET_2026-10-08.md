# Production Central Kitchen reset — 8 October 2026

Task 156: the user reviewed the production records and approved "Complete Reset Please." This approved deletion of the kitchen history and master lists, while preserving expense categories, staff accounts and actual POS branches. Analytics development remains deferred until after this reset.

## Completed operation

- Target: Le Laban Central Kitchen, production Supabase project `pyikrlqduampooncpzri`.
- Completed at 06:02:11 UTC (11:32:11 IST); independently verified at 06:02:34 UTC.
- Deleted exactly 9 kitchen entries, 3 entry lines, 1 payment allocation, 1 kitchen item and 2 kitchen party records.
- All five scoped base tables are now empty. The kitchen balances and open-document views return no scoped records.
- All 10 expense categories were preserved unchanged. Hash comparisons also confirmed both scoped staff records and the actual Central Kitchen branch record were unchanged.
- Only the five kitchen data tables above were written. No Auth accounts, actual branches, POS records, schema, access policies or staging data were changed. No app deployment was needed.

## Backup and safeguards

Full scoped rows, including categories, were exported and verified before deletion. Private artifacts are under the Git-ignored local directory `scratch/production-kitchen-reset-2026-10-08/`: `backup.json`, `approved-reset.sql` and `verification.json`. Do not commit or publish these artifacts.

Backup SHA-256: `00A5F01615D191D6451DB37294478098276E58CB0159394A34785EA0D7A06C4D`.

The reset ran in one transaction with lock and statement timeouts, explicit tenant and branch filters, exact snapshot comparisons, foreign-key and trigger checks, cross-scope cascade checks and exact deletion-count assertions. A failed check would have rolled back the deletion. No tables were dropped or truncated and no migrations were reversed.

Recovery, if requested, must be a separately reviewed scoped restore from the local backup. An app deployment rollback does not restore deleted records; never rerun the saved reset SQL to restore data.
