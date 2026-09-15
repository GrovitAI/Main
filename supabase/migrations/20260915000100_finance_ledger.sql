-- ============================================================================
-- Migration: Finance ledger — step 1 of docs/FINANCE_LEDGER_PLAN.md (Task 67)
--
-- Adds hand-recorded books underneath the Finance tab: accounts (one per
-- branch and one per partner), a three-level catalog, ledger entries with an
-- edit trail written by trigger, the owner's rule switches, and the
-- `accountant` staff role. Row level security carries the rules: a clerk sees
-- entries recorded by clerks, edits only their own and only until the day
-- ends, and cannot void, transfer or read balances unless the owner switches
-- that on.
--
-- Idempotent: every statement is IF NOT EXISTS / OR REPLACE / ON CONFLICT.
-- Additive: no existing table loses a column or a row. The only change to an
-- existing object is the staff role check, which gains 'accountant'.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. The accountant role
-- ---------------------------------------------------------------------------
ALTER TABLE public.staff DROP CONSTRAINT IF EXISTS chk_staff_role;
ALTER TABLE public.staff ADD CONSTRAINT chk_staff_role
  CHECK (role = ANY (ARRAY['owner', 'admin', 'manager', 'cashier', 'kitchen', 'accountant']));

-- ---------------------------------------------------------------------------
-- 1. Identity helpers (same shape as the auth_* helpers)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finance_current_staff_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT s.id
    FROM public.staff s
   WHERE s.auth_user_id = auth.uid()
     AND s.status = 'active'
     AND s.deleted_at IS NULL
   ORDER BY s.created_at ASC
   LIMIT 1;
$$;

-- Owners and admins hold the books; they see and change everything.
CREATE OR REPLACE FUNCTION public.finance_is_owner()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT coalesce(public.auth_role() IN ('owner', 'admin'), false); $$;

-- Clerks record entries under the owner's rules. Managers count as clerks
-- here: they may enter, they may not read balances.
CREATE OR REPLACE FUNCTION public.finance_is_clerk()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT coalesce(public.auth_role() IN ('accountant', 'manager'), false); $$;

REVOKE ALL ON FUNCTION public.finance_current_staff_id() FROM public, anon;
REVOKE ALL ON FUNCTION public.finance_is_owner() FROM public, anon;
REVOKE ALL ON FUNCTION public.finance_is_clerk() FROM public, anon;

-- ---------------------------------------------------------------------------
-- 2. Rules: one row per tenant, the owner's switches
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.finance_rules (
  tenant_id                   uuid PRIMARY KEY,
  clerk_sees_balances         boolean NOT NULL DEFAULT false,
  clerk_sees_partner_entries  boolean NOT NULL DEFAULT false,
  clerk_edits_after_day_end   boolean NOT NULL DEFAULT false,
  clerk_can_void              boolean NOT NULL DEFAULT false,
  clerk_can_transfer          boolean NOT NULL DEFAULT false,
  -- Ledger days end at midnight IST, deliberately not the tills' 02:30.
  day_end_time                time    NOT NULL DEFAULT '00:00',
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  updated_by                  uuid
);

INSERT INTO public.finance_rules (tenant_id)
SELECT DISTINCT tenant_id FROM public.branches
ON CONFLICT (tenant_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Accounts: whose books an entry belongs to
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.finance_accounts (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 uuid NOT NULL,
  kind                      text NOT NULL CHECK (kind IN ('branch', 'partner')),
  branch_id                 uuid REFERENCES public.branches(id),
  staff_id                  uuid REFERENCES public.staff(id),
  name                      text NOT NULL,
  opening_cash_paise        bigint NOT NULL DEFAULT 0,
  opening_bank_paise        bigint NOT NULL DEFAULT 0,
  -- Which accounts' income and expenses make up the profit the partners share.
  counts_in_partner_profit  boolean NOT NULL DEFAULT false,
  sort_order                integer NOT NULL DEFAULT 0,
  is_active                 boolean NOT NULL DEFAULT true,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_accounts_kind_link CHECK (
    (kind = 'branch'  AND branch_id IS NOT NULL AND staff_id IS NULL) OR
    (kind = 'partner' AND staff_id  IS NOT NULL AND branch_id IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS finance_accounts_branch_uniq
  ON public.finance_accounts (tenant_id, branch_id) WHERE branch_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS finance_accounts_staff_uniq
  ON public.finance_accounts (tenant_id, staff_id) WHERE staff_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS finance_accounts_tenant_idx
  ON public.finance_accounts (tenant_id, sort_order);

-- One account per active branch. The central kitchen is the one whose profit
-- the partners share (decision of 2026-09-15); the flag is editable later.
INSERT INTO public.finance_accounts (tenant_id, kind, branch_id, name, counts_in_partner_profit, sort_order)
SELECT b.tenant_id, 'branch', b.id, b.name,
       (b.code = 'CK' OR b.name ILIKE '%central kitchen%'),
       row_number() OVER (PARTITION BY b.tenant_id ORDER BY b.created_at)
  FROM public.branches b
 WHERE b.is_active
ON CONFLICT DO NOTHING;

-- One account per partner, i.e. per owner login, kept in step with staff by
-- the trigger below so adding a partner in Staff creates their books.
CREATE OR REPLACE FUNCTION public.finance_sync_partner_account()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.role = 'owner' AND NEW.status = 'active' AND NEW.deleted_at IS NULL THEN
    INSERT INTO public.finance_accounts (tenant_id, kind, staff_id, name, sort_order)
    VALUES (NEW.tenant_id, 'partner', NEW.id, NEW.name, 100)
    ON CONFLICT (tenant_id, staff_id) WHERE staff_id IS NOT NULL
    DO UPDATE SET name = EXCLUDED.name, is_active = true, updated_at = now();
  ELSE
    UPDATE public.finance_accounts
       SET is_active = false, updated_at = now()
     WHERE tenant_id = NEW.tenant_id AND staff_id = NEW.id AND is_active;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS finance_sync_partner_account ON public.staff;
CREATE TRIGGER finance_sync_partner_account
  AFTER INSERT OR UPDATE OF role, name, status, deleted_at ON public.staff
  FOR EACH ROW EXECUTE FUNCTION public.finance_sync_partner_account();

INSERT INTO public.finance_accounts (tenant_id, kind, staff_id, name, sort_order)
SELECT s.tenant_id, 'partner', s.id, s.name, 100
  FROM public.staff s
 WHERE s.role = 'owner' AND s.status = 'active' AND s.deleted_at IS NULL
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. Catalog: categories, sub-categories and particulars in one tree
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.finance_catalog (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  level         text NOT NULL CHECK (level IN ('category', 'subcategory', 'particular')),
  parent_id     uuid REFERENCES public.finance_catalog(id),
  name          text NOT NULL,
  -- Preselected kind when recording; children inherit when null. Required on
  -- a category so every particular resolves to one.
  default_kind  text CHECK (default_kind IN ('income', 'expense', 'payable', 'receivable')),
  sort_order    integer NOT NULL DEFAULT 0,
  -- Built in: Opening Balance and Partners. Never renamed or deactivated.
  is_system     boolean NOT NULL DEFAULT false,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_catalog_tree CHECK (
    (level = 'category' AND parent_id IS NULL AND default_kind IS NOT NULL) OR
    (level <> 'category' AND parent_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS finance_catalog_name_uniq
  ON public.finance_catalog (tenant_id, level, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));
CREATE INDEX IF NOT EXISTS finance_catalog_parent_idx
  ON public.finance_catalog (tenant_id, parent_id, sort_order);

-- Seed: the expense categories of 2026-09-07, plus the two built-in ones.
INSERT INTO public.finance_catalog (tenant_id, level, name, default_kind, sort_order)
SELECT c.tenant_id, 'category', c.name, 'expense', c.sort_order
  FROM public.expense_categories c
 WHERE c.is_active
ON CONFLICT DO NOTHING;

INSERT INTO public.finance_catalog (tenant_id, level, name, default_kind, sort_order, is_system)
SELECT t.tenant_id, 'category', 'Opening Balance', 'income', 0, true
  FROM (SELECT DISTINCT tenant_id FROM public.branches) t
ON CONFLICT DO NOTHING;

INSERT INTO public.finance_catalog (tenant_id, level, name, default_kind, sort_order, is_system)
SELECT t.tenant_id, 'category', 'Partners', 'expense', 900, true
  FROM (SELECT DISTINCT tenant_id FROM public.branches) t
ON CONFLICT DO NOTHING;

INSERT INTO public.finance_catalog (tenant_id, level, parent_id, name, default_kind, sort_order, is_system)
SELECT p.tenant_id, 'subcategory', p.id, sub.name, sub.kind, sub.ord, true
  FROM public.finance_catalog p
  CROSS JOIN (VALUES ('Drawing', 'expense', 1), ('Contribution', 'income', 2), ('Paid personally', 'expense', 3)) AS sub(name, kind, ord)
 WHERE p.level = 'category' AND p.is_system AND p.name = 'Partners'
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5. Entries: the ledger
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.finance_entries (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL,
  account_id        uuid NOT NULL REFERENCES public.finance_accounts(id),
  kind              text NOT NULL CHECK (kind IN ('income', 'expense', 'payable', 'receivable', 'transfer')),
  -- income/expense/transfer: recorded → void. payable/receivable: open → settled or void.
  status            text NOT NULL DEFAULT 'recorded' CHECK (status IN ('recorded', 'open', 'settled', 'void')),
  amount_paise      bigint NOT NULL CHECK (amount_paise > 0),
  mode              text CHECK (mode IN ('cash', 'bank')),
  transfer_from     text CHECK (transfer_from IN ('cash', 'bank')),
  transfer_to       text CHECK (transfer_to IN ('cash', 'bank')),
  -- The day the money moved, as the user states it.
  transaction_date  date NOT NULL,
  -- When and by whom the row was recorded. Never editable.
  entered_at        timestamptz NOT NULL DEFAULT now(),
  entered_by        uuid NOT NULL REFERENCES public.staff(id),
  category_id       uuid REFERENCES public.finance_catalog(id),
  subcategory_id    uuid REFERENCES public.finance_catalog(id),
  particular_id     uuid REFERENCES public.finance_catalog(id),
  -- What it was, always filled: the particular's name or free text.
  particulars       text NOT NULL,
  counterparty      text,
  reference_no      text,
  notes             text,
  -- Settlement (step 2): the payment that settles a payable/receivable points at it.
  settles_entry_id  uuid REFERENCES public.finance_entries(id),
  settled_paise     bigint NOT NULL DEFAULT 0 CHECK (settled_paise >= 0),
  settled_at        timestamptz,
  settled_by        uuid,
  void_reason       text,
  voided_at         timestamptz,
  voided_by         uuid,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  updated_by        uuid,
  version           integer NOT NULL DEFAULT 1,
  CONSTRAINT finance_entries_mode CHECK (
    (kind = 'transfer' AND mode IS NULL AND transfer_from IS NOT NULL AND transfer_to IS NOT NULL AND transfer_from <> transfer_to) OR
    (kind <> 'transfer' AND mode IS NOT NULL AND transfer_from IS NULL AND transfer_to IS NULL)
  ),
  CONSTRAINT finance_entries_status CHECK (
    (kind IN ('payable', 'receivable') AND status IN ('open', 'settled', 'void')) OR
    (kind NOT IN ('payable', 'receivable') AND status IN ('recorded', 'void'))
  ),
  CONSTRAINT finance_entries_particulars CHECK (length(btrim(particulars)) > 0)
);

CREATE INDEX IF NOT EXISTS finance_entries_tenant_date_idx
  ON public.finance_entries (tenant_id, transaction_date DESC, entered_at DESC);
CREATE INDEX IF NOT EXISTS finance_entries_account_idx
  ON public.finance_entries (tenant_id, account_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS finance_entries_entered_by_idx
  ON public.finance_entries (tenant_id, entered_by, entered_at DESC);
CREATE INDEX IF NOT EXISTS finance_entries_open_idx
  ON public.finance_entries (tenant_id, kind, transaction_date) WHERE status = 'open';

-- ---------------------------------------------------------------------------
-- 6. Edit trail
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.finance_entry_revisions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,
  entry_id    uuid NOT NULL REFERENCES public.finance_entries(id) ON DELETE CASCADE,
  action      text NOT NULL CHECK (action IN ('create', 'update', 'void', 'settle')),
  changed_by  uuid REFERENCES public.staff(id),
  changed_at  timestamptz NOT NULL DEFAULT now(),
  -- { "field": { "from": old, "to": new }, ... }; the full row on create.
  changes     jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS finance_entry_revisions_entry_idx
  ON public.finance_entry_revisions (entry_id, changed_at);

-- The reference PostgREST embeds the editor's name through; added after the
-- first run, so it is stated separately for databases that already have the table.
DO $
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'finance_entry_revisions_changed_by_fkey') THEN
    ALTER TABLE public.finance_entry_revisions
      ADD CONSTRAINT finance_entry_revisions_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.staff(id);
  END IF;
END $;

-- ---------------------------------------------------------------------------
-- 7. The ledger day and who may edit
-- ---------------------------------------------------------------------------
-- The calendar day in IST an instant belongs to, given when the ledger day
-- ends. With 00:00 it is the plain date; with 02:30 the small hours belong to
-- the day before, as the tills count them.
CREATE OR REPLACE FUNCTION public.finance_ledger_day(p_at timestamptz, p_day_end time)
RETURNS date
LANGUAGE sql IMMUTABLE
AS $$ SELECT ((p_at AT TIME ZONE 'Asia/Kolkata') - (p_day_end - time '00:00'))::date; $$;

CREATE OR REPLACE FUNCTION public.finance_can_edit(e public.finance_entries)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT coalesce((
    SELECT e.tenant_id = public.auth_tenant_id()
       AND e.status <> 'void'
       AND (
         public.finance_is_owner()
         OR (
           public.finance_is_clerk()
           AND e.entered_by = public.finance_current_staff_id()
           AND (
             r.clerk_edits_after_day_end
             OR public.finance_ledger_day(e.entered_at, r.day_end_time) = public.finance_ledger_day(now(), r.day_end_time)
           )
         )
       )
      FROM public.finance_rules r
     WHERE r.tenant_id = e.tenant_id
  ), false);
$$;

-- Which rows a clerk may read: those recorded by clerks, plus the partners'
-- when the owner allows it.
CREATE OR REPLACE FUNCTION public.finance_can_read(e public.finance_entries)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT e.tenant_id = public.auth_tenant_id()
     AND (
       public.finance_is_owner()
       OR (
         public.finance_is_clerk()
         AND (
           coalesce((SELECT r.clerk_sees_partner_entries FROM public.finance_rules r WHERE r.tenant_id = e.tenant_id), false)
           OR EXISTS (SELECT 1 FROM public.staff s WHERE s.id = e.entered_by AND s.role IN ('accountant', 'manager'))
         )
       )
     );
$$;

REVOKE ALL ON FUNCTION public.finance_ledger_day(timestamptz, time) FROM public, anon;
REVOKE ALL ON FUNCTION public.finance_can_edit(public.finance_entries) FROM public, anon;
REVOKE ALL ON FUNCTION public.finance_can_read(public.finance_entries) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.finance_ledger_day(timestamptz, time) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finance_can_edit(public.finance_entries) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finance_can_read(public.finance_entries) TO authenticated;

-- ---------------------------------------------------------------------------
-- 8. Triggers: defaults, immutability, the owner's rules, the edit trail
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finance_entries_before_write()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_rules public.finance_rules%ROWTYPE;
  v_staff uuid := public.finance_current_staff_id();
BEGIN
  SELECT * INTO v_rules FROM public.finance_rules WHERE tenant_id = NEW.tenant_id;

  NEW.particulars := btrim(NEW.particulars);

  IF TG_OP = 'INSERT' THEN
    NEW.entered_by := coalesce(NEW.entered_by, v_staff);
    NEW.entered_at := now();
    NEW.updated_at := now();
    NEW.updated_by := NEW.entered_by;
    NEW.version    := 1;
    IF NEW.kind IN ('payable', 'receivable') THEN
      NEW.status := 'open';
    ELSE
      NEW.status := 'recorded';
    END IF;
    IF NEW.kind = 'transfer' AND NOT public.finance_is_owner() AND NOT coalesce(v_rules.clerk_can_transfer, false) THEN
      RAISE EXCEPTION 'Transfers are recorded by the owner.' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE: what can never change.
  NEW.id         := OLD.id;
  NEW.tenant_id  := OLD.tenant_id;
  NEW.entered_at := OLD.entered_at;
  NEW.entered_by := OLD.entered_by;
  NEW.version    := OLD.version + 1;
  NEW.updated_at := now();
  NEW.updated_by := v_staff;

  IF OLD.status = 'void' THEN
    RAISE EXCEPTION 'A voided entry cannot be changed.' USING ERRCODE = '42501';
  END IF;

  IF NEW.status = 'void' AND OLD.status <> 'void' THEN
    IF NOT public.finance_is_owner() AND NOT coalesce(v_rules.clerk_can_void, false) THEN
      RAISE EXCEPTION 'Only the owner can void an entry.' USING ERRCODE = '42501';
    END IF;
    IF length(btrim(coalesce(NEW.void_reason, ''))) = 0 THEN
      RAISE EXCEPTION 'A reason is needed to void an entry.' USING ERRCODE = '23514';
    END IF;
    NEW.voided_at := now();
    NEW.voided_by := v_staff;
  END IF;

  IF NEW.kind = 'transfer' AND OLD.kind <> 'transfer' AND NOT public.finance_is_owner() AND NOT coalesce(v_rules.clerk_can_transfer, false) THEN
    RAISE EXCEPTION 'Transfers are recorded by the owner.' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS finance_entries_before_write ON public.finance_entries;
CREATE TRIGGER finance_entries_before_write
  BEFORE INSERT OR UPDATE ON public.finance_entries
  FOR EACH ROW EXECUTE FUNCTION public.finance_entries_before_write();

CREATE OR REPLACE FUNCTION public.finance_entries_audit()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tracked text[] := ARRAY[
    'account_id', 'kind', 'status', 'amount_paise', 'mode', 'transfer_from', 'transfer_to',
    'transaction_date', 'category_id', 'subcategory_id', 'particular_id', 'particulars',
    'counterparty', 'reference_no', 'notes', 'settles_entry_id', 'settled_paise', 'void_reason'
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

DROP TRIGGER IF EXISTS finance_entries_audit ON public.finance_entries;
CREATE TRIGGER finance_entries_audit
  AFTER INSERT OR UPDATE ON public.finance_entries
  FOR EACH ROW EXECUTE FUNCTION public.finance_entries_audit();

-- updated_at on the small tables.
CREATE OR REPLACE FUNCTION public.finance_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS finance_accounts_touch ON public.finance_accounts;
CREATE TRIGGER finance_accounts_touch BEFORE UPDATE ON public.finance_accounts
  FOR EACH ROW EXECUTE FUNCTION public.finance_touch_updated_at();
DROP TRIGGER IF EXISTS finance_catalog_touch ON public.finance_catalog;
CREATE TRIGGER finance_catalog_touch BEFORE UPDATE ON public.finance_catalog
  FOR EACH ROW EXECUTE FUNCTION public.finance_touch_updated_at();
DROP TRIGGER IF EXISTS finance_rules_touch ON public.finance_rules;
CREATE TRIGGER finance_rules_touch BEFORE UPDATE ON public.finance_rules
  FOR EACH ROW EXECUTE FUNCTION public.finance_touch_updated_at();

-- ---------------------------------------------------------------------------
-- 9. Balances: opening + money in − money out, per account
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finance_balances(p_account_id uuid, p_upto date DEFAULT NULL)
RETURNS TABLE (cash_paise bigint, bank_paise bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_account public.finance_accounts%ROWTYPE;
  v_allowed boolean;
BEGIN
  SELECT * INTO v_account FROM public.finance_accounts WHERE id = p_account_id;
  IF v_account.id IS NULL OR v_account.tenant_id IS DISTINCT FROM public.auth_tenant_id() THEN
    RAISE EXCEPTION 'Unknown account.' USING ERRCODE = '42501';
  END IF;
  v_allowed := public.finance_is_owner()
    OR (public.finance_is_clerk() AND coalesce((SELECT r.clerk_sees_balances FROM public.finance_rules r WHERE r.tenant_id = v_account.tenant_id), false));
  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Balances are visible to the owner.' USING ERRCODE = '42501';
  END IF;

  -- sum() over bigint yields numeric; the casts keep the declared row type.
  RETURN QUERY
  SELECT
    (v_account.opening_cash_paise
      + coalesce(sum(CASE WHEN e.kind = 'income'   AND e.mode = 'cash' THEN e.amount_paise ELSE 0 END), 0)
      - coalesce(sum(CASE WHEN e.kind = 'expense'  AND e.mode = 'cash' THEN e.amount_paise ELSE 0 END), 0)
      + coalesce(sum(CASE WHEN e.kind = 'transfer' AND e.transfer_to   = 'cash' THEN e.amount_paise ELSE 0 END), 0)
      - coalesce(sum(CASE WHEN e.kind = 'transfer' AND e.transfer_from = 'cash' THEN e.amount_paise ELSE 0 END), 0))::bigint,
    (v_account.opening_bank_paise
      + coalesce(sum(CASE WHEN e.kind = 'income'   AND e.mode = 'bank' THEN e.amount_paise ELSE 0 END), 0)
      - coalesce(sum(CASE WHEN e.kind = 'expense'  AND e.mode = 'bank' THEN e.amount_paise ELSE 0 END), 0)
      + coalesce(sum(CASE WHEN e.kind = 'transfer' AND e.transfer_to   = 'bank' THEN e.amount_paise ELSE 0 END), 0)
      - coalesce(sum(CASE WHEN e.kind = 'transfer' AND e.transfer_from = 'bank' THEN e.amount_paise ELSE 0 END), 0))::bigint
  FROM public.finance_entries e
  WHERE e.account_id = p_account_id
    AND e.status = 'recorded'
    AND (p_upto IS NULL OR e.transaction_date <= p_upto);
END;
$$;

REVOKE ALL ON FUNCTION public.finance_balances(uuid, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.finance_balances(uuid, date) TO authenticated;

-- ---------------------------------------------------------------------------
-- 10. Row level security
-- ---------------------------------------------------------------------------
ALTER TABLE public.finance_rules           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_accounts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_catalog         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_entries         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_entry_revisions ENABLE ROW LEVEL SECURITY;

-- Rules: everyone in the tenant reads them (the app greys buttons out); the owner writes.
DROP POLICY IF EXISTS finance_rules_select ON public.finance_rules;
CREATE POLICY finance_rules_select ON public.finance_rules FOR SELECT
  USING (tenant_id = public.auth_tenant_id());
DROP POLICY IF EXISTS finance_rules_update ON public.finance_rules;
CREATE POLICY finance_rules_update ON public.finance_rules FOR UPDATE
  USING (tenant_id = public.auth_tenant_id() AND public.finance_is_owner())
  WITH CHECK (tenant_id = public.auth_tenant_id() AND public.finance_is_owner());
DROP POLICY IF EXISTS finance_rules_insert ON public.finance_rules;
CREATE POLICY finance_rules_insert ON public.finance_rules FOR INSERT
  WITH CHECK (tenant_id = public.auth_tenant_id() AND public.finance_is_owner());

-- Accounts and catalog: the tenant reads, the owner writes. Nothing is deleted.
DROP POLICY IF EXISTS finance_accounts_select ON public.finance_accounts;
CREATE POLICY finance_accounts_select ON public.finance_accounts FOR SELECT
  USING (tenant_id = public.auth_tenant_id());
DROP POLICY IF EXISTS finance_accounts_insert ON public.finance_accounts;
CREATE POLICY finance_accounts_insert ON public.finance_accounts FOR INSERT
  WITH CHECK (tenant_id = public.auth_tenant_id() AND public.finance_is_owner());
DROP POLICY IF EXISTS finance_accounts_update ON public.finance_accounts;
CREATE POLICY finance_accounts_update ON public.finance_accounts FOR UPDATE
  USING (tenant_id = public.auth_tenant_id() AND public.finance_is_owner())
  WITH CHECK (tenant_id = public.auth_tenant_id() AND public.finance_is_owner());

DROP POLICY IF EXISTS finance_catalog_select ON public.finance_catalog;
CREATE POLICY finance_catalog_select ON public.finance_catalog FOR SELECT
  USING (tenant_id = public.auth_tenant_id());
DROP POLICY IF EXISTS finance_catalog_insert ON public.finance_catalog;
CREATE POLICY finance_catalog_insert ON public.finance_catalog FOR INSERT
  WITH CHECK (tenant_id = public.auth_tenant_id() AND public.finance_is_owner());
DROP POLICY IF EXISTS finance_catalog_update ON public.finance_catalog;
CREATE POLICY finance_catalog_update ON public.finance_catalog FOR UPDATE
  USING (tenant_id = public.auth_tenant_id() AND public.finance_is_owner())
  WITH CHECK (tenant_id = public.auth_tenant_id() AND public.finance_is_owner());

-- Entries: read under finance_can_read, record as yourself, edit under
-- finance_can_edit. No delete policy: nothing is ever deleted.
DROP POLICY IF EXISTS finance_entries_select ON public.finance_entries;
CREATE POLICY finance_entries_select ON public.finance_entries FOR SELECT
  USING (public.finance_can_read(finance_entries));
DROP POLICY IF EXISTS finance_entries_insert ON public.finance_entries;
CREATE POLICY finance_entries_insert ON public.finance_entries FOR INSERT
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND (public.finance_is_owner() OR public.finance_is_clerk())
    AND entered_by = public.finance_current_staff_id()
  );
DROP POLICY IF EXISTS finance_entries_update ON public.finance_entries;
CREATE POLICY finance_entries_update ON public.finance_entries FOR UPDATE
  USING (public.finance_can_edit(finance_entries))
  WITH CHECK (tenant_id = public.auth_tenant_id());

-- Revisions: readable wherever the entry is; written only by the trigger.
DROP POLICY IF EXISTS finance_entry_revisions_select ON public.finance_entry_revisions;
CREATE POLICY finance_entry_revisions_select ON public.finance_entry_revisions FOR SELECT
  USING (
    tenant_id = public.auth_tenant_id()
    AND EXISTS (SELECT 1 FROM public.finance_entries e WHERE e.id = finance_entry_revisions.entry_id)
  );

REVOKE ALL ON public.finance_rules, public.finance_accounts, public.finance_catalog,
              public.finance_entries, public.finance_entry_revisions FROM anon, public;
GRANT SELECT, INSERT, UPDATE ON public.finance_rules, public.finance_accounts, public.finance_catalog, public.finance_entries TO authenticated;
GRANT SELECT ON public.finance_entry_revisions TO authenticated;

-- ---------------------------------------------------------------------------
-- 11. Report
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_accounts integer;
  v_catalog integer;
BEGIN
  SELECT count(*) INTO v_accounts FROM public.finance_accounts;
  SELECT count(*) INTO v_catalog FROM public.finance_catalog;
  RAISE NOTICE 'Finance ledger installed: % accounts, % catalog rows.', v_accounts, v_catalog;
END $$;
