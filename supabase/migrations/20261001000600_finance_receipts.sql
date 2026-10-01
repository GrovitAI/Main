-- ============================================================================
-- Migration: the bill behind an entry — Task 116
--
-- A ledger entry can carry a photo or PDF of the bill it records.
--
--   1. finance_entries.receipt_path: where the file sits in storage. It is not
--      a money fact, so it can be added to an entry a document posted, and the
--      edit trail records it.
--   2. A private bucket, finance-receipts. Files live at
--      <tenant_id>/<entry_id>/<file name>. Nothing in it is public: the app
--      asks for a short-lived signed link each time a bill is opened.
--   3. Storage policies tie a file to its entry: whoever may read the entry
--      may read its bill; whoever keeps the books may add one; the owner may
--      remove one. The entry is looked up under the caller's own row level
--      security, so a branch never reaches another branch's bills.
--
-- Safe to run twice.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The column, and its place in the edit trail
-- ---------------------------------------------------------------------------
ALTER TABLE public.finance_entries ADD COLUMN IF NOT EXISTS receipt_path text;

ALTER TABLE public.finance_entries DROP CONSTRAINT IF EXISTS finance_entries_receipt_path;
ALTER TABLE public.finance_entries ADD CONSTRAINT finance_entries_receipt_path
  CHECK (receipt_path IS NULL OR receipt_path LIKE tenant_id::text || '/' || id::text || '/%');

CREATE OR REPLACE FUNCTION public.finance_entries_audit()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tracked text[] := ARRAY[
    'account_id', 'paid_from_account_id', 'counterparty_account_id', 'kind', 'status', 'amount_paise', 'mode', 'transfer_from', 'transfer_to',
    'transaction_date', 'due_date', 'category_id', 'subcategory_id', 'particular_id', 'particulars',
    'counterparty', 'reference_no', 'notes', 'receipt_path', 'settles_entry_id', 'settled_paise', 'void_reason', 'source_type', 'source_id'
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

-- Attaching the bill: allowed to whoever keeps the entry's books, at any
-- time, without reopening the entry for editing. Nothing else changes.
CREATE OR REPLACE FUNCTION public.finance_set_entry_receipt(p_entry_id uuid, p_receipt_path text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_staff uuid := public.finance_current_staff_id();
  v_entry public.finance_entries%ROWTYPE;
  v_path  text := nullif(btrim(coalesce(p_receipt_path, '')), '');
BEGIN
  IF v_staff IS NULL OR NOT (public.finance_is_owner() OR public.finance_is_clerk()) THEN
    RAISE EXCEPTION 'Sign in as the owner or a clerk to attach a bill.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_entry FROM public.finance_entries WHERE id = p_entry_id FOR UPDATE;
  IF v_entry.id IS NULL OR v_entry.tenant_id IS DISTINCT FROM public.auth_tenant_id()
     OR NOT public.finance_can_read(v_entry) OR NOT public.finance_account_in_scope(v_entry.account_id) THEN
    RAISE EXCEPTION 'That entry is not available to you.' USING ERRCODE = '42501';
  END IF;
  IF v_entry.status = 'void' THEN
    RAISE EXCEPTION 'A voided entry cannot be changed.' USING ERRCODE = '42501';
  END IF;
  -- Removing a bill is the owner's; adding or replacing one is everyday work.
  IF v_path IS NULL AND NOT public.finance_is_owner() THEN
    RAISE EXCEPTION 'Only the owner can remove a bill.' USING ERRCODE = '42501';
  END IF;
  IF v_path IS NOT NULL AND v_path NOT LIKE v_entry.tenant_id::text || '/' || v_entry.id::text || '/%' THEN
    RAISE EXCEPTION 'That file does not belong to this entry.' USING ERRCODE = '23514';
  END IF;

  UPDATE public.finance_entries SET receipt_path = v_path WHERE id = v_entry.id;
END;
$$;

REVOKE ALL ON FUNCTION public.finance_set_entry_receipt(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.finance_set_entry_receipt(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. The bucket: private, images and PDFs up to 5 MB
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('finance-receipts', 'finance-receipts', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- 3. Who may read, add and remove a bill
-- ---------------------------------------------------------------------------
-- The entry is found through its own row level security: the subquery only
-- sees entries the caller may read.
DROP POLICY IF EXISTS finance_receipts_select ON storage.objects;
CREATE POLICY finance_receipts_select ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'finance-receipts'
    AND (storage.foldername(name))[1] = public.auth_tenant_id()::text
    AND EXISTS (SELECT 1 FROM public.finance_entries e WHERE e.id::text = (storage.foldername(name))[2])
  );

DROP POLICY IF EXISTS finance_receipts_insert ON storage.objects;
CREATE POLICY finance_receipts_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'finance-receipts'
    AND (storage.foldername(name))[1] = public.auth_tenant_id()::text
    AND (public.finance_is_owner() OR public.finance_is_clerk())
    AND EXISTS (
      SELECT 1 FROM public.finance_entries e
       WHERE e.id::text = (storage.foldername(name))[2]
         AND public.finance_account_in_scope(e.account_id)
    )
  );

DROP POLICY IF EXISTS finance_receipts_delete ON storage.objects;
CREATE POLICY finance_receipts_delete ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'finance-receipts'
    AND (storage.foldername(name))[1] = public.auth_tenant_id()::text
    AND public.finance_is_owner()
  );
