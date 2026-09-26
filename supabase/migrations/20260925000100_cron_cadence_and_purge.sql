-- Log volume: the stock-deduction cron every five minutes, and a weekly purge
-- of pg_cron's run history — Task 107.
--
-- grovit-process-consumption-batches ran every minute, and pg_cron logs two
-- Postgres lines per run ("starting" / "completed"): 2,880 lines a day, day and
-- night, for a job that almost always found nothing pending. Every five minutes
-- is the same work at a fifth of the lines; a bill's stock deduction now lands
-- within five minutes of settlement instead of one.
--
-- cron.job_run_details is never trimmed by pg_cron itself. A week of history is
-- plenty for diagnosing a failed run.
--
-- Applied to the live project on 2026-09-25 through the SQL API, before this
-- file was written. Idempotent: safe to run again.

SELECT cron.alter_job(job_id := jobid, schedule := '*/5 * * * *')
  FROM cron.job
 WHERE jobname = 'grovit-process-consumption-batches'
   AND schedule <> '*/5 * * * *';

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'cron-purge-run-details';
SELECT cron.schedule(
  'cron-purge-run-details',
  '0 22 * * 0',   -- Sundays 22:00 UTC, 03:30 IST Monday
  $$DELETE FROM cron.job_run_details WHERE end_time < now() - interval '7 days'$$
);
