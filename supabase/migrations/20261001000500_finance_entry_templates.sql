-- ============================================================================
-- Migration: the regulars — saved entries recorded again each month — Task 115
--
-- Rent, the salaries, an EMI, a subscription: the same entry every month with
-- at most the amount changing. A template keeps everything about such an entry
-- except its date, so "Record this month's" is a tick and a save instead of
-- ten fields typed again.
--
-- A template is not an entry and moves no money. Recording from one creates an
-- ordinary ledger entry through the ordinary insert, with every rule that
-- applies to an entry typed by hand. last_recorded_on remembers the last date
-- it was used, so the list can show what this month still needs.
--
-- Who: the owner, and a clerk for the accounts in their scope. Nothing is
-- deleted; a template that is no longer wanted is switched off.
--
-- Safe to run twice.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.finance_entry_templates (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL,
  account_id           uuid NOT NULL REFERENCES public.finance_accounts(id),
  paid_from_account_id uuid REFERENCES public.finance_accounts(id),
  kind                 text NOT NULL CHECK (kind IN ('income', 'expense', 'payable', 'receivable')),
  -- The usual amount; 0 asks for it each time.
  amount_paise         bigint NOT NULL DEFAULT 0 CHECK (amount_paise >= 0),
  mode                 text CHECK (mode IN ('cash', 'bank')),
  category_id          uuid REFERENCES public.finance_catalog(id),
  subcategory_id       uuid REFERENCES public.finance_catalog(id),
  particular_id        uuid REFERENCES public.finance_catalog(id),
  particulars          text NOT NULL CHECK (length(btrim(particulars)) BETWEEN 1 AND 120),
  counterparty         text CHECK (counterparty IS NULL OR length(counterparty) <= 120),
  -- Day of the month a payable or receivable made from this falls due.
  due_day              smallint CHECK (due_day IS NULL OR due_day BETWEEN 1 AND 31),
  sort_order           integer NOT NULL DEFAULT 0,
  is_active            boolean NOT NULL DEFAULT true,
  last_recorded_on     date,
  created_by           uuid REFERENCES public.staff(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_entry_templates_payer CHECK (
    paid_from_account_id IS NULL OR (paid_from_account_id <> account_id AND kind IN ('income', 'expense'))
  ),
  CONSTRAINT finance_entry_templates_due CHECK (due_day IS NULL OR kind IN ('payable', 'receivable'))
);

CREATE INDEX IF NOT EXISTS finance_entry_templates_account_idx
  ON public.finance_entry_templates (tenant_id, account_id, sort_order)
  WHERE is_active;

ALTER TABLE public.finance_entry_templates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.finance_entry_templates FROM anon;
REVOKE ALL ON public.finance_entry_templates FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_entry_templates TO service_role;
-- Signed-in users read, add and change; nothing is deleted.
GRANT SELECT, INSERT, UPDATE ON public.finance_entry_templates TO authenticated;

DROP POLICY IF EXISTS finance_entry_templates_select ON public.finance_entry_templates;
CREATE POLICY finance_entry_templates_select ON public.finance_entry_templates FOR SELECT
  USING (
    tenant_id = public.auth_tenant_id()
    AND (public.finance_is_owner() OR public.finance_is_clerk())
    AND public.finance_account_in_scope(account_id)
  );

DROP POLICY IF EXISTS finance_entry_templates_insert ON public.finance_entry_templates;
CREATE POLICY finance_entry_templates_insert ON public.finance_entry_templates FOR INSERT
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND (public.finance_is_owner() OR public.finance_is_clerk())
    AND public.finance_account_in_scope(account_id)
    AND created_by = public.finance_current_staff_id()
  );

DROP POLICY IF EXISTS finance_entry_templates_update ON public.finance_entry_templates;
CREATE POLICY finance_entry_templates_update ON public.finance_entry_templates FOR UPDATE
  USING (
    tenant_id = public.auth_tenant_id()
    AND (public.finance_is_owner() OR public.finance_is_clerk())
    AND public.finance_account_in_scope(account_id)
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.finance_account_in_scope(account_id)
  );

CREATE OR REPLACE FUNCTION public.finance_entry_templates_touch()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  NEW.particulars := btrim(NEW.particulars);
  NEW.counterparty := nullif(btrim(coalesce(NEW.counterparty, '')), '');
  IF TG_OP = 'UPDATE' THEN
    -- A template stays in the books and the tenant it was made for.
    NEW.tenant_id  := OLD.tenant_id;
    NEW.created_by := OLD.created_by;
    NEW.created_at := OLD.created_at;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS finance_entry_templates_touch ON public.finance_entry_templates;
CREATE TRIGGER finance_entry_templates_touch
  BEFORE INSERT OR UPDATE ON public.finance_entry_templates
  FOR EACH ROW EXECUTE FUNCTION public.finance_entry_templates_touch();
