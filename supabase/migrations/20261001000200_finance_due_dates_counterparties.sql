-- ============================================================================
-- Migration: due dates on dues, and one name per vendor — Task 112
--
--   1. finance_entries.due_date: when a payable is to be paid or a receivable
--      collected. Optional, and only on a payable or receivable; a small
--      trigger clears it if an entry is edited into another kind. The edit
--      trail records it.
--   2. finance_dues_summary(): what is open, per account and kind, split into
--      overdue, due within a week, later and undated. Feeds the Outstanding
--      card. SECURITY INVOKER, so it adds up only what the caller may read.
--   3. finance_counterparty_names(): names to offer in "Paid to / Received
--      from": the ones already used in the ledger, the suppliers and the
--      staff, merged case-insensitively so "TANGEDCO" and "Tangedco" are one.
--      SECURITY INVOKER: each source is filtered by its own row level security.
--
-- No existing row changes. Safe to run twice.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Due date
-- ---------------------------------------------------------------------------
ALTER TABLE public.finance_entries ADD COLUMN IF NOT EXISTS due_date date;

CREATE OR REPLACE FUNCTION public.finance_entries_due_date_guard()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  -- Only something still owed has a due date.
  IF NEW.kind NOT IN ('payable', 'receivable') THEN
    NEW.due_date := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS finance_entries_due_date_guard ON public.finance_entries;
CREATE TRIGGER finance_entries_due_date_guard
  BEFORE INSERT OR UPDATE ON public.finance_entries
  FOR EACH ROW EXECUTE FUNCTION public.finance_entries_due_date_guard();

ALTER TABLE public.finance_entries DROP CONSTRAINT IF EXISTS finance_entries_due_date;
ALTER TABLE public.finance_entries ADD CONSTRAINT finance_entries_due_date
  CHECK (due_date IS NULL OR kind IN ('payable', 'receivable'));

CREATE INDEX IF NOT EXISTS finance_entries_open_due_idx
  ON public.finance_entries (tenant_id, due_date)
  WHERE status = 'open';

-- The edit trail records the due date too.
CREATE OR REPLACE FUNCTION public.finance_entries_audit()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tracked text[] := ARRAY[
    'account_id', 'paid_from_account_id', 'counterparty_account_id', 'kind', 'status', 'amount_paise', 'mode', 'transfer_from', 'transfer_to',
    'transaction_date', 'due_date', 'category_id', 'subcategory_id', 'particular_id', 'particulars',
    'counterparty', 'reference_no', 'notes', 'settles_entry_id', 'settled_paise', 'void_reason', 'source_type', 'source_id'
  ];
  v_old jsonb;
  v_new jsonb := to_jsonb(NEW);
  v_changes jsonb := '{}'::jsonb;
  v_field text;
  v_action text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    FOREACH v_field IN ARRAY v_tracked LOOP
      IF v_new -> v_field IS NOT NULL AND v_new -> v_field <> 'null'::jsonb THEN
        v_changes := v_changes || jsonb_build_object(v_field, jsonb_build_object('from', null, 'to', v_new -> v_field));
      END IF;
    END LOOP;
    INSERT INTO public.finance_entry_revisions (tenant_id, entry_id, action, changed_by, changes)
    VALUES (NEW.tenant_id, NEW.id, 'create', NEW.entered_by, v_changes);
    RETURN NEW;
  END IF;

  v_old := to_jsonb(OLD);
  FOREACH v_field IN ARRAY v_tracked LOOP
    IF v_old -> v_field IS DISTINCT FROM v_new -> v_field THEN
      v_changes := v_changes || jsonb_build_object(v_field, jsonb_build_object('from', v_old -> v_field, 'to', v_new -> v_field));
    END IF;
  END LOOP;
  IF v_changes = '{}'::jsonb THEN
    RETURN NEW;
  END IF;

  v_action := CASE
    WHEN NEW.status = 'void' AND OLD.status <> 'void' THEN 'void'
    WHEN NEW.status = 'settled' AND OLD.status <> 'settled' THEN 'settle'
    ELSE 'update'
  END;
  INSERT INTO public.finance_entry_revisions (tenant_id, entry_id, action, changed_by, changes)
  VALUES (NEW.tenant_id, NEW.id, v_action, NEW.updated_by, v_changes);
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. What is open, by how soon it is due
-- ---------------------------------------------------------------------------
-- bucket: 'overdue' (due before today), 'week' (due today or within 7 days),
-- 'later' (due after that), 'undated' (no due date).
CREATE OR REPLACE FUNCTION public.finance_dues_summary(p_today date DEFAULT NULL)
RETURNS TABLE (account_id uuid, kind text, bucket text, amount_paise bigint, entries integer)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  WITH t AS (SELECT coalesce(p_today, (now() AT TIME ZONE 'Asia/Kolkata')::date) AS today)
  SELECT e.account_id,
         e.kind,
         CASE
           WHEN e.due_date IS NULL THEN 'undated'
           WHEN e.due_date < t.today THEN 'overdue'
           WHEN e.due_date <= t.today + 7 THEN 'week'
           ELSE 'later'
         END AS bucket,
         sum(e.amount_paise - e.settled_paise)::bigint,
         count(*)::integer
    FROM public.finance_entries e, t
   WHERE e.tenant_id = public.auth_tenant_id()
     AND e.status = 'open'
     AND e.kind IN ('payable', 'receivable')
     AND e.amount_paise > e.settled_paise
   GROUP BY 1, 2, 3;
$$;

REVOKE ALL ON FUNCTION public.finance_dues_summary(date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.finance_dues_summary(date) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Names to offer in "Paid to / Received from"
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finance_counterparty_names(p_query text DEFAULT NULL, p_limit integer DEFAULT 12)
RETURNS TABLE (name text, source text, uses integer)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  WITH q AS (
    SELECT nullif(btrim(coalesce(p_query, '')), '') AS needle
  ),
  names AS (
    SELECT btrim(e.counterparty) AS name, 'used'::text AS source, 1 AS uses, e.entered_at AS last_used
      FROM public.finance_entries e
     WHERE e.tenant_id = public.auth_tenant_id()
       AND e.status <> 'void'
       AND e.counterparty IS NOT NULL
       AND e.counterparty_account_id IS NULL
    UNION ALL
    SELECT btrim(s.supplier_name), 'supplier', 0, NULL::timestamptz
      FROM public.inventory_suppliers s
     WHERE s.tenant_id = public.auth_tenant_id()
       AND s.deleted_at IS NULL
       AND coalesce(s.is_active, true)
    UNION ALL
    SELECT btrim(st.name), 'staff', 0, NULL::timestamptz
      FROM public.staff st
     WHERE st.tenant_id = public.auth_tenant_id()
       AND st.deleted_at IS NULL
       AND st.status = 'active'
  ),
  merged AS (
    SELECT (array_agg(n.name ORDER BY (n.source = 'used'), n.name))[1] AS name,
           CASE WHEN bool_or(n.source = 'supplier') THEN 'supplier'
                WHEN bool_or(n.source = 'staff') THEN 'staff'
                ELSE 'used' END AS source,
           sum(n.uses)::integer AS uses,
           max(n.last_used) AS last_used
      FROM names n
     WHERE n.name <> ''
     GROUP BY lower(n.name)
  )
  SELECT m.name, m.source, m.uses
    FROM merged m, q
   WHERE q.needle IS NULL
      OR position(lower(q.needle) IN lower(m.name)) > 0
   ORDER BY (q.needle IS NOT NULL AND left(lower(m.name), length(q.needle)) = lower(q.needle)) DESC,
            m.uses DESC, m.last_used DESC NULLS LAST, m.name
   LIMIT greatest(1, least(coalesce(p_limit, 12), 50));
$$;

REVOKE ALL ON FUNCTION public.finance_counterparty_names(text, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.finance_counterparty_names(text, integer) TO authenticated;
