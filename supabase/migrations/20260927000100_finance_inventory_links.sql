-- ============================================================================
-- Migration: The Central Kitchen's books — purchases and dispatches post to
-- the finance ledger — Task 110
--
-- The owner's requirement (2026-09-26): the finance module is the Central
-- Kitchen's books first. Vendor purchases are the kitchen's expenses or
-- payables; goods dispatched to a branch are a receivable from that branch
-- that becomes income when the branch pays; and a branch that pays a vendor
-- on the kitchen's behalf builds up a position that nets against what it owes
-- for the goods it received. Every figure comes from one document, so the
-- ledger and the inventory module can never disagree about a purchase or a
-- dispatch.
--
--   1. finance_catalog.system_key: a stable key for the categories the
--      system posts into ('purchases' → Raw Materials, 'branch_supplies' →
--      Branch Supplies), so renaming a category never breaks posting.
--   2. finance_entries gains counterparty_account_id (the other one of OUR
--      accounts a payable or receivable is with), source_type/source_id (the
--      purchase or dispatch that created the entry; immutable, one live entry
--      per document) and the settlement mode 'offset' (a receivable from a
--      branch cleared against what the kitchen owes that branch, no cash moving).
--   3. finance_post_source_entry() / finance_adjust_source_entry(): the only
--      way an inventory document writes the ledger. finance_pair_position():
--      what one account owes another, netted.
--   4. record_purchase(): header, lines, material averages, stock level, stock
--      ledger and the finance entry in ONE transaction, numbered PO-<branch>-0001
--      from branch_counters. Replaces five separate client writes.
--   5. create_dispatch() snapshots the unit cost on every line and posts a
--      receivable in the supplying branch's account with the requesting branch
--      as counterparty. receive_dispatch() reduces it to what actually arrived.
--   6. Between accounts (finance_interaccount_positions) now nets open
--      payables/receivables between our own accounts with the paid-for
--      positions, and finance_can_read() lets a branch see what it owes.
--
-- Idempotent and additive. No existing row changes meaning: the offset mode
-- only appears on settlements made after this migration.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Catalog keys
-- ---------------------------------------------------------------------------
ALTER TABLE public.finance_catalog ADD COLUMN IF NOT EXISTS system_key text;
CREATE UNIQUE INDEX IF NOT EXISTS finance_catalog_system_key_uniq
  ON public.finance_catalog (tenant_id, system_key) WHERE system_key IS NOT NULL;

-- Purchases post into the existing "Raw Materials" category where one exists.
UPDATE public.finance_catalog c
   SET system_key = 'purchases'
 WHERE c.level = 'category' AND c.system_key IS NULL AND lower(c.name) = 'raw materials'
   AND NOT EXISTS (SELECT 1 FROM public.finance_catalog x WHERE x.tenant_id = c.tenant_id AND x.system_key = 'purchases');
INSERT INTO public.finance_catalog (tenant_id, level, name, default_kind, sort_order, system_key)
SELECT t.tenant_id, 'category', 'Raw Materials', 'expense', 10, 'purchases'
  FROM (SELECT DISTINCT tenant_id FROM public.branches) t
 WHERE NOT EXISTS (SELECT 1 FROM public.finance_catalog x WHERE x.tenant_id = t.tenant_id AND x.system_key = 'purchases')
   AND NOT EXISTS (SELECT 1 FROM public.finance_catalog x WHERE x.tenant_id = t.tenant_id AND x.level = 'category' AND lower(x.name) = 'raw materials');

-- Dispatches post into "Branch Supplies" (income). Counts in the kitchen's profit.
UPDATE public.finance_catalog c
   SET system_key = 'branch_supplies'
 WHERE c.level = 'category' AND c.system_key IS NULL AND lower(c.name) = 'branch supplies'
   AND NOT EXISTS (SELECT 1 FROM public.finance_catalog x WHERE x.tenant_id = c.tenant_id AND x.system_key = 'branch_supplies');
INSERT INTO public.finance_catalog (tenant_id, level, name, default_kind, sort_order, system_key)
SELECT t.tenant_id, 'category', 'Branch Supplies', 'income', 5, 'branch_supplies'
  FROM (SELECT DISTINCT tenant_id FROM public.branches) t
 WHERE NOT EXISTS (SELECT 1 FROM public.finance_catalog x WHERE x.tenant_id = t.tenant_id AND x.system_key = 'branch_supplies')
   AND NOT EXISTS (SELECT 1 FROM public.finance_catalog x WHERE x.tenant_id = t.tenant_id AND x.level = 'category' AND lower(x.name) = 'branch supplies');

-- ---------------------------------------------------------------------------
-- 2. Entries: counterparty account, source document, offset mode
-- ---------------------------------------------------------------------------
ALTER TABLE public.finance_entries
  ADD COLUMN IF NOT EXISTS counterparty_account_id uuid REFERENCES public.finance_accounts(id),
  ADD COLUMN IF NOT EXISTS source_type text,
  ADD COLUMN IF NOT EXISTS source_id uuid;

ALTER TABLE public.finance_entries DROP CONSTRAINT IF EXISTS finance_entries_mode_check;
ALTER TABLE public.finance_entries ADD CONSTRAINT finance_entries_mode_check
  CHECK (mode IN ('cash', 'bank', 'offset'));

ALTER TABLE public.finance_entries DROP CONSTRAINT IF EXISTS finance_entries_source;
ALTER TABLE public.finance_entries ADD CONSTRAINT finance_entries_source CHECK (
  (source_type IS NULL AND source_id IS NULL)
  OR (source_type IN ('purchase', 'dispatch') AND source_id IS NOT NULL)
);

-- One live entry per document. A voided entry frees the document to be posted again.
CREATE UNIQUE INDEX IF NOT EXISTS finance_entries_source_uniq
  ON public.finance_entries (tenant_id, source_type, source_id)
  WHERE source_type IS NOT NULL AND status <> 'void';
CREATE INDEX IF NOT EXISTS finance_entries_counterparty_account_idx
  ON public.finance_entries (counterparty_account_id)
  WHERE counterparty_account_id IS NOT NULL;

-- The inventory documents remember the entry they created.
ALTER TABLE public.inventory_purchase_headers ADD COLUMN IF NOT EXISTS finance_entry_id uuid REFERENCES public.finance_entries(id);
ALTER TABLE public.inventory_dispatches
  ADD COLUMN IF NOT EXISTS finance_entry_id uuid REFERENCES public.finance_entries(id),
  ADD COLUMN IF NOT EXISTS value_paise bigint;
ALTER TABLE public.inventory_dispatch_items ADD COLUMN IF NOT EXISTS unit_cost numeric;
ALTER TABLE public.branch_counters ADD COLUMN IF NOT EXISTS purchase_seq bigint NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- 3. The write trigger: counterparty, source and offset rules
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finance_entries_before_write()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_rules     public.finance_rules%ROWTYPE;
  v_staff     uuid := public.finance_current_staff_id();
  -- Set by finance_settle_entry() and the void reversal for the transaction.
  v_settling  boolean := coalesce(current_setting('finance.settling', true), '') = 'on';
  -- Set by the inventory posting helpers: the entry is a consequence of a
  -- purchase or dispatch the caller was allowed to make.
  v_system    boolean := coalesce(current_setting('finance.system', true), '') = 'on';
  v_paid_from public.finance_accounts%ROWTYPE;
  v_cp        public.finance_accounts%ROWTYPE;
BEGIN
  SELECT * INTO v_rules FROM public.finance_rules WHERE tenant_id = NEW.tenant_id;

  NEW.particulars := btrim(NEW.particulars);

  -- Paid from / For. The same account on both sides is stored as NULL.
  IF NEW.paid_from_account_id = NEW.account_id THEN
    NEW.paid_from_account_id := NULL;
  END IF;
  IF NEW.paid_from_account_id IS NOT NULL THEN
    IF NEW.kind IN ('payable', 'receivable') THEN
      RAISE EXCEPTION 'A payable or receivable moves no money yet. Choose who pays when it is settled.' USING ERRCODE = '23514';
    END IF;
    SELECT * INTO v_paid_from FROM public.finance_accounts WHERE id = NEW.paid_from_account_id;
    IF v_paid_from.id IS NULL OR v_paid_from.tenant_id <> NEW.tenant_id OR NOT v_paid_from.is_active THEN
      RAISE EXCEPTION 'Unknown paying account.' USING ERRCODE = '23514';
    END IF;
  END IF;

  -- The counterparty account: another of our own accounts, never the entry's own.
  IF NEW.counterparty_account_id IS NOT NULL THEN
    IF NEW.counterparty_account_id = NEW.account_id THEN
      RAISE EXCEPTION 'The other account cannot be the entry''s own account.' USING ERRCODE = '23514';
    END IF;
    SELECT * INTO v_cp FROM public.finance_accounts WHERE id = NEW.counterparty_account_id;
    IF v_cp.id IS NULL OR v_cp.tenant_id <> NEW.tenant_id THEN
      RAISE EXCEPTION 'Unknown counterparty account.' USING ERRCODE = '23514';
    END IF;
  END IF;

  -- An offset moves no cash; only Settle may record one.
  IF NEW.mode = 'offset' AND NOT v_settling THEN
    RAISE EXCEPTION 'An offset is recorded with Settle, not by hand.' USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.source_type IS NOT NULL AND NOT v_system THEN
      RAISE EXCEPTION 'Entries for purchases and dispatches are posted by the inventory module.' USING ERRCODE = '42501';
    END IF;
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
    IF NEW.settles_entry_id IS NOT NULL AND NOT v_settling THEN
      RAISE EXCEPTION 'Use Settle on the payable or receivable to record its payment.' USING ERRCODE = '42501';
    END IF;
    NEW.settled_paise := 0;
    NEW.settled_at    := NULL;
    NEW.settled_by    := NULL;
    IF NEW.kind = 'transfer' AND NOT public.finance_is_owner() AND NOT coalesce(v_rules.clerk_can_transfer, false) THEN
      RAISE EXCEPTION 'Transfers are recorded by the owner.' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE: what can never change.
  NEW.id          := OLD.id;
  NEW.tenant_id   := OLD.tenant_id;
  NEW.entered_at  := OLD.entered_at;
  NEW.entered_by  := OLD.entered_by;
  NEW.source_type := OLD.source_type;
  NEW.source_id   := OLD.source_id;
  NEW.version     := OLD.version + 1;
  NEW.updated_at  := now();
  NEW.updated_by  := v_staff;

  IF OLD.status = 'void' THEN
    RAISE EXCEPTION 'A voided entry cannot be changed.' USING ERRCODE = '42501';
  END IF;

  -- Settlement bookkeeping changes only through finance_settle_entry() or
  -- the reversal that voiding a payment triggers.
  IF NOT v_settling AND (
       NEW.settled_paise <> OLD.settled_paise
    OR NEW.settles_entry_id IS DISTINCT FROM OLD.settles_entry_id
    OR NEW.settled_at IS DISTINCT FROM OLD.settled_at
    OR NEW.settled_by IS DISTINCT FROM OLD.settled_by
    OR (NEW.status = 'settled' AND OLD.status <> 'settled')
    OR (NEW.status = 'open' AND OLD.status = 'settled')
  ) THEN
    RAISE EXCEPTION 'Settlement is recorded with Settle, not by editing.' USING ERRCODE = '42501';
  END IF;

  -- A payment that settles another entry keeps its money facts. Void it and
  -- settle again to change them; the reversal keeps the original right.
  IF OLD.settles_entry_id IS NOT NULL AND NEW.status <> 'void' AND (
       NEW.amount_paise <> OLD.amount_paise
    OR NEW.kind <> OLD.kind
    OR NEW.account_id <> OLD.account_id
    OR NEW.paid_from_account_id IS DISTINCT FROM OLD.paid_from_account_id
    OR (NEW.mode IS DISTINCT FROM OLD.mode AND (NEW.mode = 'offset' OR OLD.mode = 'offset'))
  ) THEN
    RAISE EXCEPTION 'This payment settles another entry. Void it and settle again to change the amount or account.' USING ERRCODE = '42501';
  END IF;

  -- An entry with payments against it.
  IF OLD.settled_paise > 0 THEN
    IF NEW.status = 'void' THEN
      RAISE EXCEPTION 'This entry has payments against it. Void those payments first.' USING ERRCODE = '42501';
    END IF;
    IF NEW.kind <> OLD.kind OR NEW.account_id <> OLD.account_id THEN
      RAISE EXCEPTION 'This entry has payments against it. Its kind and account cannot change.' USING ERRCODE = '42501';
    END IF;
    IF NEW.amount_paise < NEW.settled_paise THEN
      RAISE EXCEPTION 'The amount cannot be less than what has already been settled.' USING ERRCODE = '23514';
    END IF;
    IF NOT v_settling THEN
      -- Raising the amount above what was paid reopens it.
      NEW.status := CASE WHEN NEW.settled_paise >= NEW.amount_paise THEN 'settled' ELSE 'open' END;
    END IF;
  ELSIF NEW.status <> 'void' AND NOT v_settling THEN
    -- Nothing settled yet: the status follows the kind.
    NEW.status := CASE WHEN NEW.kind IN ('payable', 'receivable') THEN 'open' ELSE 'recorded' END;
  END IF;

  IF NEW.status = 'void' AND OLD.status <> 'void' THEN
    IF NOT v_system AND NOT public.finance_is_owner() AND NOT coalesce(v_rules.clerk_can_void, false) THEN
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

-- The edit trail records the new fields too.
CREATE OR REPLACE FUNCTION public.finance_entries_audit()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tracked text[] := ARRAY[
    'account_id', 'paid_from_account_id', 'counterparty_account_id', 'kind', 'status', 'amount_paise', 'mode', 'transfer_from', 'transfer_to',
    'transaction_date', 'category_id', 'subcategory_id', 'particular_id', 'particulars',
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

-- A branch may read what it owes another account.
CREATE OR REPLACE FUNCTION public.finance_can_read(e public.finance_entries)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT e.tenant_id = public.auth_tenant_id()
     AND (
       public.finance_account_in_scope(e.account_id)
       OR (e.paid_from_account_id IS NOT NULL AND public.finance_account_in_scope(e.paid_from_account_id))
       OR (e.counterparty_account_id IS NOT NULL AND public.finance_account_in_scope(e.counterparty_account_id))
     )
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

-- ---------------------------------------------------------------------------
-- 4. Between accounts: paid-for positions AND open dues between our accounts
-- ---------------------------------------------------------------------------
-- Money one account paid for another (an expense paid by X for Y, a transfer
-- from X to Y, income collected by X for Y) and what one account still owes
-- another on an open payable or receivable, netted per pair.
CREATE OR REPLACE FUNCTION public.finance_interaccount_positions()
RETURNS TABLE (owed_by uuid, owed_to uuid, amount_paise bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tenant uuid := public.auth_tenant_id();
  v_allowed boolean;
BEGIN
  v_allowed := public.finance_is_owner()
    OR (public.finance_is_clerk() AND coalesce((SELECT r.clerk_sees_balances FROM public.finance_rules r WHERE r.tenant_id = v_tenant), false));
  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Balances are visible to the owner.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH moves AS (
    SELECT CASE WHEN e.kind = 'income' THEN e.paid_from_account_id ELSE e.account_id END AS debtor,
           CASE WHEN e.kind = 'income' THEN e.account_id ELSE e.paid_from_account_id END AS creditor,
           e.amount_paise
      FROM public.finance_entries e
     WHERE e.tenant_id = v_tenant
       AND e.status = 'recorded'
       AND e.paid_from_account_id IS NOT NULL
       AND e.kind IN ('income', 'expense', 'transfer')
    UNION ALL
    SELECT CASE WHEN e.kind = 'receivable' THEN e.counterparty_account_id ELSE e.account_id END,
           CASE WHEN e.kind = 'receivable' THEN e.account_id ELSE e.counterparty_account_id END,
           e.amount_paise - e.settled_paise
      FROM public.finance_entries e
     WHERE e.tenant_id = v_tenant
       AND e.status = 'open'
       AND e.kind IN ('payable', 'receivable')
       AND e.counterparty_account_id IS NOT NULL
       AND e.amount_paise > e.settled_paise
  ),
  pairs AS (
    SELECT least(m.debtor, m.creditor) AS a,
           greatest(m.debtor, m.creditor) AS b,
           sum(CASE WHEN m.debtor = least(m.debtor, m.creditor) THEN m.amount_paise ELSE -m.amount_paise END)::bigint AS net
      FROM moves m
     GROUP BY least(m.debtor, m.creditor), greatest(m.debtor, m.creditor)
  )
  SELECT CASE WHEN p.net > 0 THEN p.a ELSE p.b END,
         CASE WHEN p.net > 0 THEN p.b ELSE p.a END,
         abs(p.net)::bigint
    FROM pairs p
   WHERE p.net <> 0
     AND (public.finance_account_in_scope(p.a) OR public.finance_account_in_scope(p.b));
END;
$$;

-- What p_debtor owes p_creditor from money that has actually moved between
-- the two (an expense paid by one for the other, a transfer, income collected
-- by one for the other, an earlier offset), netted; positive, or 0 when
-- nothing or when the debt runs the other way. Open receivables and payables
-- are deliberately left out: this is the most an offset may clear, and the
-- receivable being offset must not reduce its own cap.
CREATE OR REPLACE FUNCTION public.finance_pair_position(p_debtor uuid, p_creditor uuid)
RETURNS bigint
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tenant uuid := public.auth_tenant_id();
  v_net bigint;
BEGIN
  IF p_debtor IS NULL OR p_creditor IS NULL OR p_debtor = p_creditor THEN
    RETURN 0;
  END IF;
  IF NOT (public.finance_account_in_scope(p_debtor) OR public.finance_account_in_scope(p_creditor)) THEN
    RETURN 0;
  END IF;
  SELECT coalesce(sum(
           CASE
             WHEN (CASE WHEN e.kind = 'income' THEN e.paid_from_account_id ELSE e.account_id END) = p_debtor THEN e.amount_paise
             ELSE -e.amount_paise
           END), 0)::bigint
    INTO v_net
    FROM public.finance_entries e
   WHERE e.tenant_id = v_tenant
     AND e.status = 'recorded'
     AND e.paid_from_account_id IS NOT NULL
     AND e.kind IN ('income', 'expense', 'transfer')
     AND ((e.account_id = p_debtor AND e.paid_from_account_id = p_creditor)
       OR (e.account_id = p_creditor AND e.paid_from_account_id = p_debtor));
  RETURN greatest(v_net, 0)::bigint;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Settlement, with the offset mode
-- ---------------------------------------------------------------------------
-- p_mode 'offset': a receivable from one of our own accounts is cleared
-- against what this account owes that account (a vendor bill the branch paid
-- for the kitchen, for example). No cash moves: the income row carries mode
-- 'offset' and is paid from the counterparty, which cancels the paid-for
-- position in the positions above. Only up to what is actually owed from
-- money already moved (finance_pair_position), never more.
CREATE OR REPLACE FUNCTION public.finance_settle_entry(
  p_entry_id             uuid,
  p_amount_paise         bigint,
  p_mode                 text,
  p_transaction_date     date,
  p_paid_from_account_id uuid DEFAULT NULL,
  p_reference_no         text DEFAULT NULL,
  p_notes                text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_staff     uuid := public.finance_current_staff_id();
  v_orig      public.finance_entries%ROWTYPE;
  v_remaining bigint;
  v_payment   uuid;
  v_settled   bigint;
  v_paid_from uuid := p_paid_from_account_id;
  v_owed      bigint;
BEGIN
  IF v_staff IS NULL OR NOT (public.finance_is_owner() OR public.finance_is_clerk()) THEN
    RAISE EXCEPTION 'Sign in as the owner or a clerk to settle an entry.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_orig FROM public.finance_entries WHERE id = p_entry_id FOR UPDATE;
  IF v_orig.id IS NULL OR v_orig.tenant_id IS DISTINCT FROM public.auth_tenant_id() OR NOT public.finance_can_read(v_orig) THEN
    RAISE EXCEPTION 'That entry is not available to you.' USING ERRCODE = '42501';
  END IF;
  IF v_orig.kind NOT IN ('payable', 'receivable') THEN
    RAISE EXCEPTION 'Only a payable or a receivable can be settled.' USING ERRCODE = '23514';
  END IF;
  IF v_orig.status <> 'open' THEN
    RAISE EXCEPTION 'This entry is % and cannot be settled.', v_orig.status USING ERRCODE = '23514';
  END IF;
  IF p_mode IS NULL OR p_mode NOT IN ('cash', 'bank', 'offset') THEN
    RAISE EXCEPTION 'Say whether it was paid in cash, through the bank, or offset against what is owed.' USING ERRCODE = '23514';
  END IF;
  IF p_transaction_date IS NULL THEN
    RAISE EXCEPTION 'A transaction date is needed.' USING ERRCODE = '23514';
  END IF;
  v_remaining := v_orig.amount_paise - v_orig.settled_paise;
  IF p_amount_paise IS NULL OR p_amount_paise <= 0 THEN
    RAISE EXCEPTION 'The amount must be more than zero.' USING ERRCODE = '23514';
  END IF;
  IF p_amount_paise > v_remaining THEN
    RAISE EXCEPTION 'Only % paise remain to be settled on this entry.', v_remaining USING ERRCODE = '23514';
  END IF;

  IF p_mode = 'offset' THEN
    IF v_orig.kind <> 'receivable' OR v_orig.counterparty_account_id IS NULL THEN
      RAISE EXCEPTION 'Only a receivable from one of our own accounts can be offset.' USING ERRCODE = '23514';
    END IF;
    v_owed := public.finance_pair_position(v_orig.account_id, v_orig.counterparty_account_id);
    IF p_amount_paise > v_owed THEN
      RAISE EXCEPTION 'Only % paise are owed to that account to offset against.', v_owed USING ERRCODE = '23514';
    END IF;
    v_paid_from := v_orig.counterparty_account_id;
  END IF;

  PERFORM set_config('finance.settling', 'on', true);

  INSERT INTO public.finance_entries (
    tenant_id, account_id, paid_from_account_id, counterparty_account_id, kind, amount_paise, mode, transaction_date, entered_by,
    category_id, subcategory_id, particular_id, particulars, counterparty, reference_no, notes, settles_entry_id
  ) VALUES (
    v_orig.tenant_id,
    v_orig.account_id,
    v_paid_from,
    v_orig.counterparty_account_id,
    CASE WHEN v_orig.kind = 'payable' THEN 'expense' ELSE 'income' END,
    p_amount_paise,
    p_mode,
    p_transaction_date,
    v_staff,
    v_orig.category_id, v_orig.subcategory_id, v_orig.particular_id,
    v_orig.particulars, v_orig.counterparty,
    nullif(btrim(coalesce(p_reference_no, '')), ''),
    nullif(btrim(coalesce(p_notes, '')), ''),
    v_orig.id
  )
  RETURNING id INTO v_payment;

  v_settled := v_orig.settled_paise + p_amount_paise;
  UPDATE public.finance_entries
     SET settled_paise = v_settled,
         status        = CASE WHEN v_settled >= amount_paise THEN 'settled' ELSE 'open' END,
         settled_at    = CASE WHEN v_settled >= amount_paise THEN now() ELSE NULL END,
         settled_by    = CASE WHEN v_settled >= amount_paise THEN v_staff ELSE NULL END
   WHERE id = v_orig.id;

  PERFORM set_config('finance.settling', 'off', true);
  RETURN v_payment;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Posting from inventory documents
-- ---------------------------------------------------------------------------
-- The only way a purchase or dispatch writes the ledger. The caller must be
-- signed-in staff of the tenant with access to the account's branch; the
-- entry itself is a consequence of an inventory action the caller was
-- already allowed to make, so no finance role is required.
CREATE OR REPLACE FUNCTION public.finance_post_source_entry(
  p_tenant_id               uuid,
  p_account_id              uuid,
  p_counterparty_account_id uuid,
  p_kind                    text,
  p_amount_paise            bigint,
  p_mode                    text,
  p_transaction_date        date,
  p_category_key            text,
  p_particulars             text,
  p_counterparty            text,
  p_reference_no            text,
  p_notes                   text,
  p_source_type             text,
  p_source_id               uuid
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_staff    uuid := public.finance_current_staff_id();
  v_account  public.finance_accounts%ROWTYPE;
  v_category uuid;
  v_entry    uuid;
BEGIN
  IF p_tenant_id IS NULL OR p_tenant_id IS DISTINCT FROM public.auth_tenant_id() OR v_staff IS NULL THEN
    RAISE EXCEPTION 'LEDGER_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF p_kind NOT IN ('income', 'expense', 'payable', 'receivable') OR p_amount_paise IS NULL OR p_amount_paise <= 0
     OR p_source_type NOT IN ('purchase', 'dispatch') OR p_source_id IS NULL OR p_transaction_date IS NULL THEN
    RAISE EXCEPTION 'LEDGER_INVALID_ARGS' USING ERRCODE = '22023';
  END IF;
  IF (p_kind IN ('income', 'expense')) <> (coalesce(p_mode, '') IN ('cash', 'bank')) THEN
    RAISE EXCEPTION 'LEDGER_INVALID_ARGS' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_account FROM public.finance_accounts WHERE id = p_account_id AND tenant_id = p_tenant_id AND is_active;
  IF v_account.id IS NULL THEN
    RAISE EXCEPTION 'LEDGER_NO_ACCOUNT' USING ERRCODE = 'P0001';
  END IF;
  IF v_account.kind = 'branch' AND NOT public.auth_can_access_branch(p_tenant_id, v_account.branch_id) THEN
    RAISE EXCEPTION 'LEDGER_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_category FROM public.finance_catalog
   WHERE tenant_id = p_tenant_id AND system_key = p_category_key;
  IF v_category IS NULL THEN
    INSERT INTO public.finance_catalog (tenant_id, level, name, default_kind, sort_order, system_key)
    VALUES (p_tenant_id, 'category',
            CASE p_category_key WHEN 'purchases' THEN 'Raw Materials' WHEN 'branch_supplies' THEN 'Branch Supplies' ELSE initcap(replace(p_category_key, '_', ' ')) END,
            CASE WHEN p_kind IN ('income', 'receivable') THEN 'income' ELSE 'expense' END,
            10, p_category_key)
    RETURNING id INTO v_category;
  END IF;

  PERFORM set_config('finance.system', 'on', true);
  INSERT INTO public.finance_entries (
    tenant_id, account_id, counterparty_account_id, kind, amount_paise, mode, transaction_date, entered_by,
    category_id, particulars, counterparty, reference_no, notes, source_type, source_id
  ) VALUES (
    p_tenant_id, p_account_id, p_counterparty_account_id, p_kind, p_amount_paise, p_mode, p_transaction_date, v_staff,
    v_category, p_particulars, nullif(btrim(coalesce(p_counterparty, '')), ''),
    nullif(btrim(coalesce(p_reference_no, '')), ''), nullif(btrim(coalesce(p_notes, '')), ''), p_source_type, p_source_id
  )
  RETURNING id INTO v_entry;
  PERFORM set_config('finance.system', 'off', true);
  RETURN v_entry;
END;
$$;

-- Brings a document's open entry down to what actually happened (goods that
-- never arrived). Zero voids it. Either party to the entry may call it.
CREATE OR REPLACE FUNCTION public.finance_adjust_source_entry(
  p_tenant_id    uuid,
  p_source_type  text,
  p_source_id    uuid,
  p_amount_paise bigint,
  p_note         text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_staff uuid := public.finance_current_staff_id();
  v_entry public.finance_entries%ROWTYPE;
BEGIN
  IF p_tenant_id IS NULL OR p_tenant_id IS DISTINCT FROM public.auth_tenant_id() OR v_staff IS NULL THEN
    RAISE EXCEPTION 'LEDGER_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_entry FROM public.finance_entries
   WHERE tenant_id = p_tenant_id AND source_type = p_source_type AND source_id = p_source_id AND status <> 'void'
   FOR UPDATE;
  IF v_entry.id IS NULL THEN
    RETURN;
  END IF;
  IF NOT (public.auth_is_tenant_wide()
          OR public.finance_account_in_scope(v_entry.account_id)
          OR (v_entry.counterparty_account_id IS NOT NULL AND public.finance_account_in_scope(v_entry.counterparty_account_id))) THEN
    RAISE EXCEPTION 'LEDGER_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF v_entry.status <> 'open' THEN
    RAISE EXCEPTION 'LEDGER_ALREADY_SETTLED' USING ERRCODE = 'P0001';
  END IF;

  PERFORM set_config('finance.system', 'on', true);
  IF coalesce(p_amount_paise, 0) <= 0 THEN
    UPDATE public.finance_entries
       SET status = 'void', void_reason = coalesce(nullif(btrim(p_note), ''), 'Nothing was received.')
     WHERE id = v_entry.id;
  ELSIF p_amount_paise <> v_entry.amount_paise THEN
    IF p_amount_paise < v_entry.settled_paise THEN
      RAISE EXCEPTION 'LEDGER_ALREADY_SETTLED' USING ERRCODE = 'P0001';
    END IF;
    UPDATE public.finance_entries
       SET amount_paise = p_amount_paise,
           notes = concat_ws(E'\n', nullif(notes, ''), nullif(btrim(p_note), ''))
     WHERE id = v_entry.id;
  END IF;
  PERFORM set_config('finance.system', 'off', true);
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. Purchase numbers from the branch counter
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.next_branch_sequence(
  p_tenant_id uuid,
  p_branch_id uuid,
  p_kind text                      -- 'bill' | 'order' | 'kot' | 'purchase'
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seed_bill  bigint;
  v_seed_order bigint;
  v_seed_kot   bigint;
  v_next       bigint;
BEGIN
  IF p_tenant_id IS NULL OR p_branch_id IS NULL THEN
    RAISE EXCEPTION 'SEQ_INVALID_ARGS' USING ERRCODE = '22023';
  END IF;
  IF p_kind NOT IN ('bill', 'order', 'kot', 'purchase') THEN
    RAISE EXCEPTION 'SEQ_INVALID_KIND' USING ERRCODE = '22023';
  END IF;

  -- Callers must belong to the branch (cron/worker paths run without auth.uid()
  -- and are allowed through because auth.uid() is NULL there).
  IF auth.uid() IS NOT NULL AND NOT public.auth_can_access_branch(p_tenant_id, p_branch_id) THEN
    RAISE EXCEPTION 'SEQ_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  -- First use for this branch: seed from the highest numbers already issued.
  IF NOT EXISTS (SELECT 1 FROM public.branch_counters
                  WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id) THEN
    SELECT greatest(
             coalesce((SELECT max(nullif(regexp_replace(invoice_number, '\D', '', 'g'), '')::bigint)
                         FROM public.bills
                        WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id), 0),
             coalesce((SELECT max(nullif(regexp_replace(invoice_number, '\D', '', 'g'), '')::bigint)
                         FROM public.open_orders
                        WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id), 0))
      INTO v_seed_bill;

    SELECT coalesce(max(nullif(regexp_replace(order_name, '\D', '', 'g'), '')::bigint), 0)
      INTO v_seed_order
      FROM public.open_orders
     WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id
       AND order_name ILIKE 'Order #%';

    SELECT coalesce(max(kot_number), 0)
      INTO v_seed_kot
      FROM public.kots
     WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id;

    INSERT INTO public.branch_counters (tenant_id, branch_id, bill_seq, order_seq, kot_seq)
    VALUES (p_tenant_id, p_branch_id, v_seed_bill, v_seed_order, v_seed_kot)
    ON CONFLICT (tenant_id, branch_id) DO NOTHING;
  END IF;

  -- Atomic increment under the row lock taken by UPDATE.
  IF p_kind = 'bill' THEN
    UPDATE public.branch_counters SET bill_seq = bill_seq + 1, updated_at = now()
     WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id
     RETURNING bill_seq INTO v_next;
  ELSIF p_kind = 'order' THEN
    UPDATE public.branch_counters SET order_seq = order_seq + 1, updated_at = now()
     WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id
     RETURNING order_seq INTO v_next;
  ELSIF p_kind = 'purchase' THEN
    UPDATE public.branch_counters SET purchase_seq = purchase_seq + 1, updated_at = now()
     WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id
     RETURNING purchase_seq INTO v_next;
  ELSE
    UPDATE public.branch_counters SET kot_seq = kot_seq + 1, updated_at = now()
     WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id
     RETURNING kot_seq INTO v_next;
  END IF;

  RETURN v_next;
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. record_purchase: one transaction for the whole goods receipt
--    p_items: [{"material_id": uuid, "quantity": n, "unit_price": n, "line_total": n}, ...]
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_purchase(
  p_branch_id      uuid,
  p_supplier_id    uuid,
  p_purchase_date  date,
  p_invoice_number text,
  p_invoice_date   date,
  p_payment_mode   text,
  p_paid           boolean,
  p_items          jsonb,
  p_subtotal       numeric,
  p_discount       numeric,
  p_tax            numeric,
  p_transport      numeric,
  p_other          numeric,
  p_grand_total    numeric,
  p_remarks        text DEFAULT NULL,
  p_location_id    text DEFAULT 'Dry Storage',
  p_created_by     text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tenant      uuid := public.auth_tenant_id();
  v_staff       uuid := public.finance_current_staff_id();
  v_role        text := public.auth_role();
  v_supplier    record;
  v_branch      record;
  v_header      public.inventory_purchase_headers%ROWTYPE;
  v_item        jsonb;
  v_material    record;
  v_level       record;
  v_material_id uuid;
  v_qty         numeric;
  v_price       numeric;
  v_line        numeric;
  v_total_stock numeric;
  v_avg         numeric;
  v_now         timestamptz := now();
  v_number      text;
  v_created_by  text;
  v_account_id  uuid;
  v_entry       uuid;
  v_mode        text;
  v_location    text := coalesce(nullif(btrim(coalesce(p_location_id, '')), ''), 'Dry Storage');
BEGIN
  IF v_tenant IS NULL OR v_staff IS NULL OR v_role NOT IN ('owner', 'admin', 'manager') THEN
    RAISE EXCEPTION 'PURCHASE_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF p_branch_id IS NULL OR NOT public.auth_can_access_branch(v_tenant, p_branch_id) THEN
    RAISE EXCEPTION 'PURCHASE_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0
     OR p_purchase_date IS NULL OR p_grand_total IS NULL OR p_grand_total <= 0
     OR p_payment_mode IS NULL OR btrim(p_payment_mode) = '' OR p_paid IS NULL THEN
    RAISE EXCEPTION 'PURCHASE_INVALID_ARGS' USING ERRCODE = '22023';
  END IF;

  SELECT id, supplier_name INTO v_supplier
    FROM public.inventory_suppliers
   WHERE id = p_supplier_id AND tenant_id = v_tenant AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PURCHASE_SUPPLIER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  SELECT id, code, name INTO v_branch FROM public.branches WHERE id = p_branch_id AND tenant_id = v_tenant;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PURCHASE_BRANCH_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- The kitchen's books must exist before anything can be posted into them.
  SELECT id INTO v_account_id FROM public.finance_accounts
   WHERE tenant_id = v_tenant AND kind = 'branch' AND branch_id = p_branch_id AND is_active
   LIMIT 1;
  IF v_account_id IS NULL THEN
    RAISE EXCEPTION 'PURCHASE_NO_ACCOUNT' USING ERRCODE = 'P0001';
  END IF;

  v_created_by := coalesce(nullif(btrim(coalesce(p_created_by, '')), ''), (SELECT s.name FROM public.staff s WHERE s.id = v_staff), 'Staff');
  v_number := 'PO-' || coalesce(nullif(v_branch.code, ''), 'BR') || '-'
              || lpad(public.next_branch_sequence(v_tenant, p_branch_id, 'purchase')::text, 4, '0');

  INSERT INTO public.inventory_purchase_headers (
    tenant_id, branch_id, purchase_number, purchase_date, supplier_id, invoice_number, invoice_date, payment_mode,
    subtotal, discount_amount, tax_amount, transport_charges, other_charges, grand_total, invoice_file_url, remarks,
    status, created_by, created_at
  ) VALUES (
    v_tenant, p_branch_id, v_number,
    (p_purchase_date::timestamp AT TIME ZONE 'Asia/Kolkata'),
    v_supplier.id, nullif(btrim(coalesce(p_invoice_number, '')), ''),
    CASE WHEN p_invoice_date IS NULL THEN NULL ELSE (p_invoice_date::timestamp AT TIME ZONE 'Asia/Kolkata') END,
    btrim(p_payment_mode),
    coalesce(p_subtotal, 0), coalesce(p_discount, 0), coalesce(p_tax, 0), coalesce(p_transport, 0), coalesce(p_other, 0), p_grand_total,
    NULL, nullif(btrim(coalesce(p_remarks, '')), ''),
    'Completed', v_created_by, v_now
  )
  RETURNING * INTO v_header;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_material_id := nullif(v_item->>'material_id', '')::uuid;
    v_qty   := (v_item->>'quantity')::numeric;
    v_price := (v_item->>'unit_price')::numeric;
    v_line  := coalesce((v_item->>'line_total')::numeric, v_qty * v_price);
    IF v_material_id IS NULL OR v_qty IS NULL OR v_qty <= 0 OR v_price IS NULL OR v_price < 0 THEN
      RAISE EXCEPTION 'PURCHASE_INVALID_ITEM' USING ERRCODE = '22023';
    END IF;

    SELECT id, material_name, coalesce(current_stock, 0) AS current_stock, coalesce(average_cost, 0) AS average_cost
      INTO v_material
      FROM public.inventory_materials
     WHERE id = v_material_id AND tenant_id = v_tenant AND deleted_at IS NULL
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'PURCHASE_MATERIAL_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;

    INSERT INTO public.inventory_purchase_items (tenant_id, branch_id, purchase_header_id, material_id, quantity, unit_price, line_total, created_at)
    VALUES (v_tenant, p_branch_id, v_header.id, v_material_id, v_qty, v_price, v_line, v_now);

    -- Weighted average cost: ((stock × avg) + (qty × price)) / (stock + qty).
    v_total_stock := v_material.current_stock + v_qty;
    v_avg := CASE WHEN v_total_stock > 0
                  THEN (v_material.current_stock * v_material.average_cost + v_qty * v_price) / v_total_stock
                  ELSE v_price END;
    UPDATE public.inventory_materials
       SET current_stock = v_total_stock,
           average_cost = v_avg,
           last_purchase_price = v_price,
           inventory_value = v_total_stock * v_avg,
           updated_at = v_now
     WHERE id = v_material_id;

    SELECT * INTO v_level FROM public.inventory_material_stock_levels
     WHERE tenant_id = v_tenant AND branch_id = p_branch_id AND material_id = v_material_id AND location_id = v_location
     ORDER BY updated_at DESC NULLS LAST
     LIMIT 1
     FOR UPDATE;
    IF FOUND THEN
      UPDATE public.inventory_material_stock_levels
         SET current_stock = coalesce(current_stock, 0) + v_qty,
             available_stock = coalesce(available_stock, 0) + v_qty,
             updated_at = v_now
       WHERE id = v_level.id;
    ELSE
      INSERT INTO public.inventory_material_stock_levels
        (tenant_id, branch_id, material_id, location_id, current_stock, reserved_stock, available_stock, updated_at)
      VALUES (v_tenant, p_branch_id, v_material_id, v_location, v_qty, 0, v_qty, v_now);
    END IF;

    INSERT INTO public.inventory_material_vendor_prices (tenant_id, branch_id, material_id, supplier_id, purchase_price, effective_date)
    VALUES (v_tenant, p_branch_id, v_material_id, v_supplier.id, v_price, v_now);

    INSERT INTO public.inventory_stock_ledger
      (tenant_id, branch_id, material_id, transaction_date, transaction_type, reference_type, reference_id,
       qty_in, qty_out, balance_stock, unit_cost, total_value, remarks, created_by)
    VALUES (v_tenant, p_branch_id, v_material_id, v_now, 'Purchase', 'Purchase Invoice', v_header.id,
            v_qty, 0, v_total_stock, v_price, v_qty * v_price,
            'Purchased from ' || v_supplier.supplier_name || ' · ' || v_number, v_created_by);
  END LOOP;

  -- The kitchen's books: an expense when paid now, a payable to the supplier otherwise.
  v_mode := CASE WHEN NOT p_paid THEN NULL WHEN lower(btrim(p_payment_mode)) = 'cash' THEN 'cash' ELSE 'bank' END;
  v_entry := public.finance_post_source_entry(
    v_tenant, v_account_id, NULL,
    CASE WHEN p_paid THEN 'expense' ELSE 'payable' END,
    round(p_grand_total * 100)::bigint, v_mode, p_purchase_date, 'purchases',
    'Purchase ' || v_number || ' · ' || v_supplier.supplier_name,
    v_supplier.supplier_name, p_invoice_number, p_remarks, 'purchase', v_header.id);

  UPDATE public.inventory_purchase_headers SET finance_entry_id = v_entry WHERE id = v_header.id
  RETURNING * INTO v_header;

  RETURN json_build_object('header', row_to_json(v_header), 'finance_entry_id', v_entry);
END;
$$;

-- ---------------------------------------------------------------------------
-- 9. create_dispatch: snapshot the unit cost, post the receivable
--    p_items: [{"material_id": uuid, "dispatched_quantity": number}, ...]
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_dispatch(
  p_tenant_id  uuid,
  p_request_id uuid,
  p_items      jsonb,
  p_remarks    text DEFAULT NULL,
  p_created_by text DEFAULT 'Owner Staff'
)
RETURNS json
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_req         inventory_transfer_requests%ROWTYPE;
  v_dispatch    inventory_dispatches%ROWTYPE;
  v_item        jsonb;
  v_material_id uuid;
  v_qty         numeric;
  v_level       record;
  v_material    record;
  v_next_stock  numeric;
  v_next_res    numeric;
  v_now         timestamptz := now();
  v_all_done    boolean := true;
  v_ri          record;
  v_sent_total  numeric;
  v_status      text;
  v_unit_cost   numeric;
  v_value       numeric := 0;
  v_value_paise bigint;
  v_sup_acct    uuid;
  v_req_acct    uuid;
  v_req_branch  text;
  v_entry       uuid;
BEGIN
  IF p_tenant_id IS NULL OR p_request_id IS NULL OR p_items IS NULL OR jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'DISPATCH_INVALID_ARGS' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_req FROM public.inventory_transfer_requests
   WHERE id = p_request_id AND tenant_id = p_tenant_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DISPATCH_REQUEST_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF v_req.status IN ('Cancelled', 'Rejected', 'Completed') THEN
    RAISE EXCEPTION 'DISPATCH_REQUEST_CLOSED' USING ERRCODE = 'P0001';
  END IF;
  IF NOT (public.auth_is_tenant_wide() OR public.auth_branch_id() = v_req.supplying_branch_id) THEN
    RAISE EXCEPTION 'DISPATCH_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.inventory_dispatches (request_id, dispatch_number, dispatched_at, status)
  VALUES (v_req.id,
          'DSP-' || to_char(v_now, 'YYYY') || '-' || lpad(nextval('public.inventory_dispatch_number_seq')::text, 6, '0'),
          v_now, 'Dispatched')
  RETURNING * INTO v_dispatch;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_material_id := (v_item->>'material_id')::uuid;
    v_qty := (v_item->>'dispatched_quantity')::numeric;
    IF v_material_id IS NULL OR v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'DISPATCH_INVALID_ITEM' USING ERRCODE = '22023';
    END IF;

    SELECT id, material_name, coalesce(average_cost, 0) AS average_cost INTO v_material
      FROM public.inventory_materials
     WHERE id = v_material_id AND tenant_id = p_tenant_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'DISPATCH_MATERIAL_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;
    v_unit_cost := v_material.average_cost;

    SELECT * INTO v_level FROM public.inventory_material_stock_levels
     WHERE tenant_id = p_tenant_id AND branch_id = v_req.supplying_branch_id AND material_id = v_material_id
     ORDER BY updated_at DESC NULLS LAST
     LIMIT 1
     FOR UPDATE;

    IF NOT FOUND OR coalesce(v_level.current_stock, 0) < v_qty THEN
      RAISE EXCEPTION 'INSUFFICIENT_STOCK:%', v_material.material_name USING ERRCODE = 'P0001';
    END IF;

    v_next_stock := coalesce(v_level.current_stock, 0) - v_qty;
    v_next_res   := greatest(0, coalesce(v_level.reserved_stock, 0) - v_qty);
    UPDATE public.inventory_material_stock_levels
       SET current_stock = v_next_stock, reserved_stock = v_next_res,
           available_stock = v_next_stock - v_next_res, updated_at = v_now
     WHERE id = v_level.id;

    INSERT INTO public.inventory_stock_ledger
      (tenant_id, branch_id, material_id, transaction_date, transaction_type, reference_type, reference_id,
       qty_in, qty_out, balance_stock, unit_cost, total_value, remarks, created_by)
    VALUES (p_tenant_id, v_req.supplying_branch_id, v_material_id, v_now, 'Transfer Out', 'Dispatch Invoice', v_dispatch.id,
            0, v_qty, v_next_stock, v_unit_cost, v_next_stock * v_unit_cost,
            'Dispatched to branch. Dispatch No: ' || v_dispatch.dispatch_number, p_created_by);

    INSERT INTO public.inventory_dispatch_items (dispatch_id, material_id, quantity, unit_cost)
    VALUES (v_dispatch.id, v_material_id, v_qty, v_unit_cost);

    v_value := v_value + v_qty * v_unit_cost;
  END LOOP;

  -- Request status from the cumulative quantity shipped across all dispatches.
  FOR v_ri IN SELECT material_id, coalesce(approved_qty, 0) AS approved_qty
                FROM public.inventory_transfer_request_items WHERE request_id = v_req.id LOOP
    SELECT coalesce(sum(di.quantity), 0) INTO v_sent_total
      FROM public.inventory_dispatch_items di
      JOIN public.inventory_dispatches d ON d.id = di.dispatch_id
     WHERE d.request_id = v_req.id AND di.material_id = v_ri.material_id;
    IF v_sent_total < v_ri.approved_qty THEN
      v_all_done := false;
    END IF;
  END LOOP;

  v_status := CASE WHEN v_all_done THEN 'Dispatched' ELSE 'Partially Dispatched' END;
  UPDATE public.inventory_transfer_requests SET status = v_status, updated_at = v_now WHERE id = v_req.id;

  INSERT INTO public.inventory_transfer_events (tenant_id, branch_id, transfer_request_id, event_type, performed_by, notes)
  VALUES (p_tenant_id, v_req.supplying_branch_id, v_req.id, 'Dispatched', p_created_by,
          'Items dispatched. Status set to ' || v_status || '.'
          || CASE WHEN p_remarks IS NOT NULL AND trim(p_remarks) <> '' THEN ' Remarks: ' || trim(p_remarks) ELSE '' END);

  -- The supplying branch's books: a receivable from the requesting branch for
  -- the goods at cost. Skipped when either branch has no finance account or
  -- the goods carry no cost yet.
  v_value_paise := round(v_value * 100)::bigint;
  IF v_value_paise > 0 THEN
    SELECT id INTO v_sup_acct FROM public.finance_accounts
     WHERE tenant_id = p_tenant_id AND kind = 'branch' AND branch_id = v_req.supplying_branch_id AND is_active LIMIT 1;
    SELECT id INTO v_req_acct FROM public.finance_accounts
     WHERE tenant_id = p_tenant_id AND kind = 'branch' AND branch_id = v_req.requesting_branch_id AND is_active LIMIT 1;
    IF v_sup_acct IS NOT NULL AND v_req_acct IS NOT NULL THEN
      SELECT name INTO v_req_branch FROM public.branches WHERE id = v_req.requesting_branch_id;
      v_entry := public.finance_post_source_entry(
        p_tenant_id, v_sup_acct, v_req_acct, 'receivable', v_value_paise, NULL,
        (v_now AT TIME ZONE 'Asia/Kolkata')::date, 'branch_supplies',
        'Dispatch ' || v_dispatch.dispatch_number || ' to ' || coalesce(v_req_branch, 'branch'),
        v_req_branch, v_dispatch.dispatch_number,
        'Request ' || coalesce(v_req.request_number, '') || CASE WHEN p_remarks IS NOT NULL AND trim(p_remarks) <> '' THEN ' · ' || trim(p_remarks) ELSE '' END,
        'dispatch', v_dispatch.id);
      UPDATE public.inventory_dispatches SET finance_entry_id = v_entry, value_paise = v_value_paise WHERE id = v_dispatch.id
      RETURNING * INTO v_dispatch;
    END IF;
  END IF;

  RETURN json_build_object(
    'dispatch', row_to_json(v_dispatch),
    'request_status', v_status,
    'request_number', v_req.request_number,
    'from_branch_id', v_req.supplying_branch_id,
    'to_branch_id', v_req.requesting_branch_id,
    'finance_entry_id', v_entry,
    'value_paise', v_value_paise
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 10. receive_dispatch: the receivable follows what arrived
--     p_items: [{"id": dispatch_item_id, "material_id": uuid,
--                "received_quantity": number, "dispatched_quantity": number}, ...]
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.receive_dispatch(
  p_tenant_id   uuid,
  p_dispatch_id uuid,
  p_items       jsonb,
  p_remarks     text DEFAULT NULL,
  p_received_by text DEFAULT 'Owner Staff'
)
RETURNS json
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_dispatch    inventory_dispatches%ROWTYPE;
  v_req         inventory_transfer_requests%ROWTYPE;
  v_item        jsonb;
  v_item_id     uuid;
  v_material_id uuid;
  v_received    numeric;
  v_dispatched  numeric;
  v_level       record;
  v_next_stock  numeric;
  v_now         timestamptz := now();
  v_all_done    boolean := true;
  v_ri          record;
  v_recv_total  numeric;
  v_status      text;
  v_recv_value  numeric;
  v_recv_paise  bigint;
  v_req_branch  text;
BEGIN
  IF p_tenant_id IS NULL OR p_dispatch_id IS NULL OR p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'RECEIVE_INVALID_ARGS' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_dispatch FROM public.inventory_dispatches WHERE id = p_dispatch_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RECEIVE_DISPATCH_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_req FROM public.inventory_transfer_requests
   WHERE id = v_dispatch.request_id AND tenant_id = p_tenant_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RECEIVE_REQUEST_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_dispatch.status = 'Received' THEN
    RETURN json_build_object('already_received', true, 'request_status', v_req.status);
  END IF;

  IF NOT (public.auth_is_tenant_wide() OR public.auth_branch_id() = v_req.requesting_branch_id) THEN
    RAISE EXCEPTION 'RECEIVE_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_item_id     := nullif(v_item->>'id', '')::uuid;
    v_material_id := (v_item->>'material_id')::uuid;
    v_received    := coalesce((v_item->>'received_quantity')::numeric, 0);
    v_dispatched  := coalesce((v_item->>'dispatched_quantity')::numeric, 0);
    IF v_material_id IS NULL OR v_received < 0 THEN
      RAISE EXCEPTION 'RECEIVE_INVALID_ITEM' USING ERRCODE = '22023';
    END IF;

    -- Record what actually arrived on the dispatch line.
    IF v_item_id IS NOT NULL THEN
      UPDATE public.inventory_dispatch_items SET received_quantity = v_received
       WHERE id = v_item_id AND dispatch_id = v_dispatch.id;
    ELSE
      UPDATE public.inventory_dispatch_items SET received_quantity = v_received
       WHERE dispatch_id = v_dispatch.id AND material_id = v_material_id;
    END IF;

    UPDATE public.inventory_transfer_request_items
       SET received_qty = coalesce(received_qty, 0) + v_received
     WHERE request_id = v_req.id AND material_id = v_material_id;

    IF v_received > 0 THEN
      SELECT * INTO v_level FROM public.inventory_material_stock_levels
       WHERE tenant_id = p_tenant_id AND branch_id = v_req.requesting_branch_id AND material_id = v_material_id
       ORDER BY updated_at DESC NULLS LAST
       LIMIT 1
       FOR UPDATE;

      IF FOUND THEN
        v_next_stock := coalesce(v_level.current_stock, 0) + v_received;
        UPDATE public.inventory_material_stock_levels
           SET current_stock = v_next_stock,
               available_stock = v_next_stock - coalesce(reserved_stock, 0),
               updated_at = v_now
         WHERE id = v_level.id;
      ELSE
        v_next_stock := v_received;
        INSERT INTO public.inventory_material_stock_levels
          (tenant_id, branch_id, material_id, location_id, current_stock, reserved_stock, available_stock, updated_at)
        VALUES (p_tenant_id, v_req.requesting_branch_id, v_material_id, 'Main Storage', v_received, 0, v_received, v_now);
      END IF;

      INSERT INTO public.inventory_stock_ledger
        (tenant_id, branch_id, material_id, transaction_date, transaction_type, reference_type, reference_id,
         qty_in, qty_out, balance_stock, unit_cost, total_value, remarks, created_by)
      SELECT p_tenant_id, v_req.requesting_branch_id, v_material_id, v_now, 'Transfer In', 'Receipt Invoice', v_dispatch.id,
             v_received, 0, v_next_stock, coalesce(m.average_cost, 0), v_next_stock * coalesce(m.average_cost, 0),
             'Received from branch. Dispatch No: ' || coalesce(v_dispatch.dispatch_number, ''), p_received_by
        FROM public.inventory_materials m WHERE m.id = v_material_id;
    END IF;

    IF v_received < v_dispatched THEN
      INSERT INTO public.inventory_transfer_variances
        (tenant_id, branch_id, dispatch_item_id, material_id, dispatched_qty, received_qty, variance_qty, reason)
      VALUES (p_tenant_id, v_req.requesting_branch_id, v_item_id, v_material_id, v_dispatched, v_received,
              v_dispatched - v_received, coalesce(nullif(trim(p_remarks), ''), 'Transit loss'));
    END IF;
  END LOOP;

  UPDATE public.inventory_dispatches SET status = 'Received', received_at = v_now WHERE id = v_dispatch.id;

  -- The receivable posted at dispatch comes down to the value that arrived.
  IF v_dispatch.finance_entry_id IS NOT NULL THEN
    SELECT coalesce(sum(coalesce(di.received_quantity, 0) * coalesce(di.unit_cost, 0)), 0) INTO v_recv_value
      FROM public.inventory_dispatch_items di WHERE di.dispatch_id = v_dispatch.id;
    v_recv_paise := round(v_recv_value * 100)::bigint;
    IF v_recv_paise < coalesce(v_dispatch.value_paise, v_recv_paise) THEN
      SELECT name INTO v_req_branch FROM public.branches WHERE id = v_req.requesting_branch_id;
      PERFORM public.finance_adjust_source_entry(
        p_tenant_id, 'dispatch', v_dispatch.id, v_recv_paise,
        'Reduced to what ' || coalesce(v_req_branch, 'the branch') || ' received on '
        || to_char(v_now AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY') || '.');
    END IF;
  END IF;

  -- Request status from cumulative received quantities across all dispatches.
  FOR v_ri IN SELECT material_id, coalesce(approved_qty, 0) AS approved_qty
                FROM public.inventory_transfer_request_items WHERE request_id = v_req.id LOOP
    SELECT coalesce(sum(coalesce(di.received_quantity, 0)), 0) INTO v_recv_total
      FROM public.inventory_dispatch_items di
      JOIN public.inventory_dispatches d ON d.id = di.dispatch_id
     WHERE d.request_id = v_req.id AND di.material_id = v_ri.material_id;
    IF v_recv_total < v_ri.approved_qty THEN
      v_all_done := false;
    END IF;
  END LOOP;

  v_status := CASE WHEN v_all_done THEN 'Completed' ELSE 'Partially Received' END;
  UPDATE public.inventory_transfer_requests SET status = v_status, updated_at = v_now WHERE id = v_req.id;

  INSERT INTO public.inventory_transfer_events (tenant_id, branch_id, transfer_request_id, event_type, performed_by, notes)
  VALUES (p_tenant_id, v_req.requesting_branch_id, v_req.id, 'Received', p_received_by,
          'Goods received. Status set to ' || v_status || '.');

  RETURN json_build_object('already_received', false, 'request_status', v_status);
END;
$$;

-- ---------------------------------------------------------------------------
-- 11. Grants: signed-in users only, never anon
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.finance_pair_position(uuid, uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.finance_post_source_entry(uuid, uuid, uuid, text, bigint, text, date, text, text, text, text, text, text, uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.finance_adjust_source_entry(uuid, text, uuid, bigint, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.record_purchase(uuid, uuid, date, text, date, text, boolean, jsonb, numeric, numeric, numeric, numeric, numeric, numeric, text, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.finance_pair_position(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finance_post_source_entry(uuid, uuid, uuid, text, bigint, text, date, text, text, text, text, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finance_adjust_source_entry(uuid, text, uuid, bigint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_purchase(uuid, uuid, date, text, date, text, boolean, jsonb, numeric, numeric, numeric, numeric, numeric, numeric, text, text, text) TO authenticated;
