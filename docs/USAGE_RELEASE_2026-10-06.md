# Usage optimization release — 6 October 2026

This release is based on production commit `702f11973a4d0bdffd0430c96d95d7b45834a9fa` and contains only tasks 137 and 139 from the Central Kitchen feature branch. Finance, Central Kitchen, database migrations, server handlers and package dependencies are excluded.

## Behavior

- Active Orders keeps its 10-second foreground refresh and shares pending polling within one app instance. Requests cannot overlap. History refreshes every 60 seconds; manual refresh stays immediate.
- Printer health retains its existing cadence and now waits for a pending check.
- Analytics charts load four aggregate RPCs. Transaction detail is fetched on Export, with loading, failure and empty feedback; incomplete pages reject the export.
- Inventory initial/focus/tab loads share pending reads. Mutation refreshes and branch changes invalidate older responses.

## Verification before merge

- The isolated release checkout passed typecheck, lint (0 errors, 161 existing warnings), and all 178 tests in 20 suites.
- The diff has no changes under `supabase/` or `api/`, and no dependency or environment file changes. No production migration is needed.
- Read-only production inspection confirmed the required bills, bill_items and branches columns, foreign-key joins, and all four existing Analytics RPC signatures.
- Local staging (`inbxezmtuytpalqvlcsm`) rendered Orders, Analytics and Inventory without browser errors. Analytics export completed its loading state without an error. The current browser download event was not captured, so a new downloaded-file check is not claimed. The identical task 139 export was previously verified against a 2,251-row CSV and staging SQL; pagination, branch scoping and partial-failure cases also pass in this release's tests.
- GitHub CI and the Vercel preview build must pass on the PR head before merge. Final results and deployment identifiers are recorded on the PR.

## Production deployment and rollback

Vercel project `main` (`prj_JcIq7HFLIflXCsM9Jf1RF9IUTPSB`) uses GitHub's `main` as its production branch and builds with `npx expo export --platform web`. Merging the PR starts the production deployment.

The previous ready production deployment is `dpl_Hx4NHzjWEXwo44u73tzAfXwCEZvD`, at `main-buro6abvc-grovitais-projects.vercel.app`. For a release regression, restore it using:

```powershell
vercel rollback dpl_Hx4NHzjWEXwo44u73tzAfXwCEZvD --scope grovitais-projects --yes
```

Then revert the release merge through GitHub so a subsequent deployment preserves the rollback. This release has no database changes to reverse.

Vercel previews inherit production database settings; preview checks must remain read-only. The local verification uses the separate staging database. Close temporary test tabs and stop the local verification server after checking.

Request reduction is verified; monthly billed log savings still need a clean 24–48-hour usage comparison. No background monitoring or scheduled task is created by this release.
