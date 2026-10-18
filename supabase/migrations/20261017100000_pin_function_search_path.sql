-- Task 234: pin search_path on the older functions the Supabase security
-- advisor lists as "function_search_path_mutable".
--
-- All nineteen run with the caller's rights (none is SECURITY DEFINER), read
-- only tables in public and call no extension functions, so pinning them to
-- public, the setting every newer function in this repo uses, changes nothing
-- they do. It only stops a caller's own search_path from redirecting their
-- unqualified table names.
--
-- Some of these were made outside the migrations (the analytics functions and
-- the updated_at triggers), so each one is altered only when it exists with
-- the signature below. Running the file twice is harmless.

DO $$
DECLARE
  sig text;
BEGIN
  FOREACH sig IN ARRAY ARRAY[
    'public.assign_order_numbers(uuid, uuid, uuid, boolean, boolean)',
    'public.create_dispatch(uuid, uuid, jsonb, text, text)',
    'public.finance_expenses_before_write()',
    'public.finance_ledger_day(timestamptz, time)',
    'public.finance_touch_updated_at()',
    'public.get_analytics_item_performance(uuid, uuid, timestamptz, timestamptz)',
    'public.get_analytics_payment_split(uuid, uuid, timestamptz, timestamptz)',
    'public.get_analytics_sales_trend(uuid, uuid, timestamptz, timestamptz, text)',
    'public.get_analytics_summary(uuid, uuid, timestamptz, timestamptz, text)',
    'public.get_bills_ledger_kpis(uuid, uuid, timestamptz, timestamptz, text, text)',
    'public.get_finance_daily_series(uuid, uuid, timestamptz, timestamptz, date, date, text)',
    'public.get_finance_summary(uuid, uuid, timestamptz, timestamptz, date, date)',
    'public.next_kot_number(uuid, uuid)',
    'public.receive_dispatch(uuid, uuid, jsonb, text, text)',
    'public.set_updated_at()',
    'public.settle_order(uuid, uuid, uuid, text, text, text)',
    'public.trigger_set_updated_at()',
    'public.trigger_update_open_order_version()',
    'public.update_updated_at_column()'
  ]
  LOOP
    IF to_regprocedure(sig) IS NOT NULL THEN
      EXECUTE format('ALTER FUNCTION %s SET search_path = public', to_regprocedure(sig));
    ELSE
      RAISE NOTICE 'Skipped %, not on this database', sig;
    END IF;
  END LOOP;
END
$$;
