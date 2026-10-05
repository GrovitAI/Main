-- Central Kitchen: opening balances (task 136).
-- What stood between the kitchen and a branch or vendor on the day the app
-- started. One signed figure per name, in paise: positive means the branch
-- still owes the kitchen (or the kitchen still owes the vendor); negative is
-- money paid ahead. It is part of the running balance and the first line of
-- the give-and-take, never an entry, so nothing matches against it.
-- Idempotent: safe to run twice.

ALTER TABLE public.kitchen_parties
  ADD COLUMN IF NOT EXISTS opening_paise bigint NOT NULL DEFAULT 0;

CREATE OR REPLACE VIEW public.kitchen_party_balances
WITH (security_invoker = true) AS
SELECT p.id AS party_id,
       p.tenant_id,
       p.branch_id,
       p.kind,
       p.name,
       p.phone,
       p.is_active,
       (p.opening_paise + coalesce(sum(CASE
         WHEN e.type = 'sent' THEN e.amount_paise
         WHEN e.type = 'bought' AND NOT e.paid THEN e.amount_paise
         WHEN e.type IN ('received', 'paid') THEN -e.amount_paise
         ELSE 0 END), 0))::bigint AS balance_paise,
       max(e.entry_date) AS last_entry_date,
       -- appended last: a replaced view may only add columns at the end
       p.opening_paise
  FROM public.kitchen_parties p
  LEFT JOIN public.kitchen_entries e ON e.party_id = p.id AND e.voided_at IS NULL
 GROUP BY p.id;
REVOKE ALL ON public.kitchen_party_balances FROM anon;
GRANT SELECT ON public.kitchen_party_balances TO authenticated, service_role;
