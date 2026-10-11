# Printing lag review

Task 192 · 11 October 2026 · production hotfix (`hotfix/print-lag`, cherry-picked onto `main`)

## What was slow

A till pressing **Save KOT** or **Save & Print** waited for every print job to
reach PrintNode before the order was saved:

1. `use-orders-store.ts` awaited `printKot`, then the cancel KOT, then
   `printBill`, one after another, before writing the order.
2. Each `printKot`/`printBill` in `src/lib/printer/printer-service.ts` first read
   the printer rows from the database. `printBill` then read the branch row
   (`select('*')`, without a tenant filter) and the GST rate, one after
   another, before the job was sent.
3. Each job then went through `/api/printjobs` (Vercel in Mumbai; it verifies
   the token, reads the staff row, checks the rate limit and the printer, then
   posts to PrintNode).
4. Several kitchen printers were sent to one at a time.
5. Leftovers from the local print agent retired in task 82 (July) still ran on
   tills that had set a local printer before then, because the browser kept
   the old `billingPrinter` value:
   - every KOT also called `http://localhost:4545/print` and waited up to
     4 seconds for the missing agent before the order could save;
   - every **Save & Print** sent the bill to PrintNode a second time through
     `printReceipt`.

   The PrintNode job history shows jobs arriving in pairs about 0.5 s apart,
   which matches either a KOT followed by its bill or this duplicate.

   On tills without that old value, **Reprint** refused with "Please configure a
   billing printer in Settings first", but Settings no longer has that option.

## What changed

- **Printing no longer holds up saving.** `src/lib/pos/printer-service.ts`
  queues each KOT and bill and returns at once. Jobs still run one at a time,
  so a KOT always prints before its bill. The queued ticket is a copy, so later
  store changes cannot alter it. Each printer still alerts the cashier on
  failure.
- **Shared printer list, read once every five minutes.** `fetchPrintersCached()`
  in `printer-db-service.ts` serves both print paths and the status check.
  Saving, deleting or syncing printers in Settings clears it. A transient read
  failure keeps the earlier list. If PrintNode refuses a job printed from the
  cached list (a printer changed on another device), the list is reloaded and
  the job retried once; only the last attempt alerts.
- **Bill reads run together.** Printers, receipt header (`phone, gstin,
  address`, now filtered by tenant and branch, cached five minutes) and the
  GST rate are read in parallel.
- **Kitchen printers print together** instead of one after another.
- **Retired local-agent code removed:** the 4-second `localhost:4545` KOT
  call, the duplicate Save & Print bill, and the `billingPrinter` requirement
  on Reprint (POS and Orders). Reprint uses the branch's default bill printer
  from Settings → Printers, as `printReceipt` already did.

## PrintNode account check (read-only)

The PrintNode key in the local `.env` reaches an account with two computers,
`DESKTOP-GGU3CSU` and `DESKTOP-A3347BU`. Both run PrintNode Client 4.29.3 and
both were **disconnected** when checked. Each has a `RETSOL RTP-81` thermal
printer (75710609 and 75710613), last reported online. API calls took
170–635 ms from here.

That account's newest jobs date from 8 September. Either the till PCs have not
printed through this account since then, or production uses a different
PrintNode key in Vercel (`PRINTNODE_API_KEY` takes precedence over
`EXPO_PUBLIC_PRINTNODE_API_KEY`). Confirm the Vercel key, and keep PrintNode
Client running and set to start with Windows on each till PC. A disconnected
client holds jobs until it reconnects, which looks like a long print delay.

The live `printers` table could not be read: production reads are blocked in
this environment, and staging has no printer rows.

## Verification

Typecheck passed, with no lint errors in changed files (the legacy warnings
remain). New `print-queue.test.ts` checks the following:
- calls return before the job finishes;
- a KOT prints before its bill;
- queued tickets are copies;
- a failed job does not stop the queue;
- printer rows are read once per tenant and branch until Settings clears them;
- a failed read keeps the earlier rows.

On the hotfix branch (production `main` plus this change only), the full 27-suite / 254-test run passed; one timing-sensitive navigation test failed once under load and passed on its own and on a full rerun. `npx expo export --platform web`, the Vercel build command, succeeded, and the exported bundle does not contain the PrintNode key. No real printer was driven, and
tap-to-paper time on the till hardware has not been measured. Merging the hotfix pull request deploys it; no database change is needed.
