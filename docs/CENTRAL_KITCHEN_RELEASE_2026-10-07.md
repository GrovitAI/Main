# Central Kitchen release — 7 October 2026

The owner approved production deployment of the staging feature branch, including Central Kitchen, compact desktop layouts, daily-work navigation with the floating clear-pill bar and More menu, and deferral of standalone Finance and Day Close. Central Kitchen bookkeeping remains available.

## Verified release preparation

- Latest `origin/main` merged into `feat/central-kitchen`; existing production usage optimizations are preserved.
- TypeScript passes; lint has 0 errors and 166 warnings. All 251 tests in 26 suites pass.
- All ten migrations formerly in `supabase/staging-pending.txt` applied to production individually, in order, with column/function/grant/RLS checks after each. Kitchen balances views retain security-invoker behavior; receipt storage is private; new tables and business RPCs deny anonymous access.
- Preflight confirmed active branches have finance accounts and there are no duplicate system-category names. All public tables had RLS enabled.
- The purchase migration retains the existing fail-closed document-number guard. Kitchen permission checks return false for a missing staff identity. Staging and production regression checks refuse that identity and preserve valid owner access; test transactions were rolled back.
- Security advisors report no ERROR-level findings. Intentional, authenticated transaction RPCs are flagged as SECURITY DEFINER; existing search-path, extension-location and password-protection warnings remain outside this release.
- `.vercelignore` excludes local environment files, credentials and test state from CLI uploads. An initial isolated build that loaded a local `.env` was removed before promotion; future CLI builds must load production values from Vercel only.

## Deployment state

Production database `pyikrlqduampooncpzri` is ready. The web release is being built at an isolated Vercel URL with production settings before assigning the live domain.

GitHub CLI currently identifies as `Ladman349`, which has pull permission but no push permission on `GrovitAI/Main`. PR creation was refused with "must be a collaborator". Publishing and merging this branch still require the repository owner's `GrovitAI` account or another account with write access. Do not redeploy the older GitHub main branch over the new release before syncing the approved commits.

## Rollback

Previous production deployment: `dpl_HCDy2QRtqwNggF7cLhsoxFA78xHh`, at `main-kagstk9in-grovitais-projects.vercel.app`.

```powershell
vercel rollback dpl_HCDy2QRtqwNggF7cLhsoxFA78xHh --scope grovitais-projects --yes
```

An app rollback leaves the additive database changes in place. Never drop the kitchen tables or reverse migrations after staff have entered real data. The older purchase-call signature was replaced by the new transaction RPC, so a full database rollback needs a separate reviewed plan; the previous web app does not use that new signature.
