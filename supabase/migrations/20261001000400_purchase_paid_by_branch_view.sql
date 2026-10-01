-- ============================================================================
-- Migration: who paid for a purchase, and the branch's side of its dues — Task 114
--
--   1. record_purchase() takes the account that paid (a branch paying the
--      kitchen's vendor: the cost stays with the kitchen, the money leaves the
--      branch, and Between accounts shows what the kitchen owes it) and a due
--      date for a purchase on credit. finance_post_source_entry() carries both.
--   2. A branch reads what concerns it: every due with its own account on the
--      other side and the payments of those dues, and the entries the system
--      posted into its own account, whoever happened to enter them. Until now
--      a clerk saw only what clerks had entered, so a dispatch made by the
--      owner was invisible to the branch that owed for it.
--   3. A branch may record that it paid such a due, in cash or through the
--      bank. It cannot offset, and cannot say another account paid.
--   4. An offset is the owner's: only someone with the owner's powers over the
--      account that holds the receivable may clear it against what is owed.
--   5. An entry posted by a document (a purchase, a dispatch, a cash count)
--      keeps its money facts. Its amount, kind, accounts, mode and date change
--      only through the document; by hand it can be annotated or, by the
--      owner, voided.
--
-- No existing row changes. Safe to run twice.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Reading: a branch sees its own dues and what the system posted for it
-- ---------------------------------------------------------------------------
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
           -- A due with this branch on the other side, and its payments.
           OR (e.counterparty_account_id IS NOT NULL AND public.finance_account_in_scope(e.counterparty_account_id))
           -- What a purchase, a dispatch or a count posted into this branch's own books.
           OR (e.source_type IS NOT NULL AND public.finance_account_in_scope(e.account_id))
           OR EXISTS (SELECT 1 FROM public.staff s WHERE s.id = e.entered_by AND s.role IN ('accountant', 'manager'))
         )
       )
     );
$$;

-- ---------------------------------------------------------------------------
-- 2. The write trigger: a document's entry keeps its money facts
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
  -- Set by the posting helpers: the entry is a consequence of a purchase, a
  -- dispatch or a count the caller was allowed to make.
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
      RAISE EXCEPTION 'Entries for purchases, dispatches and counts are posted by the system.' USING ERRCODE = '42501';
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

  -- An entry a document posted keeps the document's figures. It can be
  -- annotated, re-categorised or, by the owner, voided; nothing else.
  IF OLD.source_type IS NOT NULL AND NOT v_system AND NOT v_settling AND NEW.status <> 'void' AND (
       NEW.amount_paise <> OLD.amount_paise
    OR NEW.kind <> OLD.kind
    OR NEW.account_id <> OLD.account_id
    OR NEW.paid_from_account_id IS DISTINCT FROM OLD.paid_from_account_id
    OR NEW.counterparty_account_id IS DISTINCT FROM OLD.counterparty_account_id
    OR NEW.mode IS DISTINCT FROM OLD.mode
    OR NEW.transaction_date <> OLD.transaction_date
  ) THEN
    RAISE EXCEPTION 'This entry was posted by a %. Its amount, kind, accounts, mode and date follow that document.',
      CASE OLD.source_type WHEN 'purchase' THEN 'purchase in Inventory' WHEN 'dispatch' THEN 'dispatch in Inventory' ELSE 'cash count' END
      USING ERRCODE = '42501';
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

-- ---------------------------------------------------------------------------
-- 3. Settlement: the owner offsets; a branch may pay what it owes
-- ---------------------------------------------------------------------------
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
  v_own_books boolean;
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

  -- Whose books the entry is in decides what the caller may do with it.
  v_own_books := public.finance_account_in_scope(v_orig.account_id);
  IF NOT v_own_books THEN
    -- The other side of a due: a branch recording that it paid the kitchen.
    IF v_orig.kind <> 'receivable' OR v_orig.counterparty_account_id IS NULL
       OR NOT public.finance_account_in_scope(v_orig.counterparty_account_id) THEN
      RAISE EXCEPTION 'That entry is in another account''s books.' USING ERRCODE = '42501';
    END IF;
    IF p_mode = 'offset' OR p_paid_from_account_id IS NOT NULL THEN
      RAISE EXCEPTION 'Record what you paid in cash or through the bank. Offsets are the owner''s.' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF p_mode = 'offset' THEN
    IF NOT public.finance_is_owner() THEN
      RAISE EXCEPTION 'Only the owner can offset a receivable.' USING ERRCODE = '42501';
    END IF;
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

REVOKE ALL ON FUNCTION public.finance_settle_entry(uuid, bigint, text, date, uuid, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.finance_settle_entry(uuid, bigint, text, date, uuid, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Posting from a document, now with the paying account and a due date
-- ---------------------------------------------------------------------------
-- Two parameters are added at the end, so the fourteen-argument calls in
-- create_dispatch() keep working. The old signature is dropped first: two
-- overloads of one name would make the call ambiguous.
DROP FUNCTION IF EXISTS public.finance_post_source_entry(uuid, uuid, uuid, text, bigint, text, date, text, text, text, text, text, text, uuid);

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
  p_source_id               uuid,
  p_paid_from_account_id    uuid DEFAULT NULL,
  p_due_date                date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_staff    uuid := public.finance_current_staff_id();
  v_account  public.finance_accounts%ROWTYPE;
  v_category uuid;
  v_entry    uuid;
  v_payer    uuid := p_paid_from_account_id;
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

  -- Who paid: only for money that moved, and never the account itself.
  IF v_payer = p_account_id OR p_kind NOT IN ('income', 'expense') THEN
    v_payer := NULL;
  END IF;
  IF v_payer IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.finance_accounts a WHERE a.id = v_payer AND a.tenant_id = p_tenant_id AND a.is_active) THEN
    RAISE EXCEPTION 'LEDGER_NO_ACCOUNT' USING ERRCODE = 'P0001';
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
    tenant_id, account_id, paid_from_account_id, counterparty_account_id, kind, amount_paise, mode, transaction_date, due_date, entered_by,
    category_id, particulars, counterparty, reference_no, notes, source_type, source_id
  ) VALUES (
    p_tenant_id, p_account_id, v_payer, p_counterparty_account_id, p_kind, p_amount_paise, p_mode, p_transaction_date,
    CASE WHEN p_kind IN ('payable', 'receivable') THEN p_due_date ELSE NULL END, v_staff,
    v_category, p_particulars, nullif(btrim(coalesce(p_counterparty, '')), ''),
    nullif(btrim(coalesce(p_reference_no, '')), ''), nullif(btrim(coalesce(p_notes, '')), ''), p_source_type, p_source_id
  )
  RETURNING id INTO v_entry;
  PERFORM set_config('finance.system', 'off', true);
  RETURN v_entry;
END;
$$;

REVOKE ALL ON FUNCTION public.finance_post_source_entry(uuid, uuid, uuid, text, bigint, text, date, text, text, text, text, text, text, uuid, uuid, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.finance_post_source_entry(uuid, uuid, uuid, text, bigint, text, date, text, text, text, text, text, text, uuid, uuid, date) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. record_purchase: who paid, and when a purchase on credit falls due
--    p_items: [{"material_id": uuid, "quantity": n, "unit_price": n, "line_total": n}, ...]
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.record_purchase(uuid, uuid, date, text, date, text, boolean, jsonb, numeric, numeric, numeric, numeric, numeric, numeric, text, text, text);

CREATE OR REPLACE FUNCTION public.record_purchase(
  p_branch_id            uuid,
  p_supplier_id          uuid,
  p_purchase_date        date,
  p_invoice_number       text,
  p_invoice_date         date,
  p_payment_mode         text,
  p_paid                 boolean,
  p_items                jsonb,
  p_subtotal             numeric,
  p_discount             numeric,
  p_tax                  numeric,
  p_transport            numeric,
  p_other                numeric,
  p_grand_total          numeric,
  p_remarks              text DEFAULT NULL,
  p_location_id          text DEFAULT 'Dry Storage',
  p_created_by           text DEFAULT NULL,
  -- The account whose cash or bank paid, when it was not the branch's own.
  p_paid_from_account_id uuid DEFAULT NULL,
  -- When a purchase on credit is to be paid.
  p_due_date             date DEFAULT NULL
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
  IF p_due_date IS NOT NULL AND p_due_date < p_purchase_date THEN
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

  -- The branch's books: an expense when paid now (from its own money, or from
  -- the account that paid for it), a payable to the supplier otherwise.
  v_mode := CASE WHEN NOT p_paid THEN NULL WHEN lower(btrim(p_payment_mode)) = 'cash' THEN 'cash' ELSE 'bank' END;
  v_entry := public.finance_post_source_entry(
    v_tenant, v_account_id, NULL,
    CASE WHEN p_paid THEN 'expense' ELSE 'payable' END,
    round(p_grand_total * 100)::bigint, v_mode, p_purchase_date, 'purchases',
    'Purchase ' || v_number || ' · ' || v_supplier.supplier_name,
    v_supplier.supplier_name, p_invoice_number, p_remarks, 'purchase', v_header.id,
    CASE WHEN p_paid THEN p_paid_from_account_id ELSE NULL END,
    CASE WHEN p_paid THEN NULL ELSE p_due_date END);

  UPDATE public.inventory_purchase_headers SET finance_entry_id = v_entry WHERE id = v_header.id
  RETURNING * INTO v_header;

  RETURN json_build_object('header', row_to_json(v_header), 'finance_entry_id', v_entry);
END;
$$;

REVOKE ALL ON FUNCTION public.record_purchase(uuid, uuid, date, text, date, text, boolean, jsonb, numeric, numeric, numeric, numeric, numeric, numeric, text, text, text, uuid, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.record_purchase(uuid, uuid, date, text, date, text, boolean, jsonb, numeric, numeric, numeric, numeric, numeric, numeric, text, text, text, uuid, date) TO authenticated;
