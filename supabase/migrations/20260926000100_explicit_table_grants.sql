-- Make every table's Data API grants explicit — Task 108.
--
-- From 30 Oct 2026 Supabase stops granting the API roles access to new
-- tables automatically. Existing tables keep what they have, so production
-- is unaffected. But a fresh database built from these migrations — a
-- preview branch, a local `supabase db reset`, a second project — would
-- come up with tables the app cannot reach, because the earlier migrations
-- relied on the automatic grants for service_role and, for a few tables,
-- for authenticated.
--
-- This file states the grants as they stand on the live project on
-- 2026-09-26, so a rebuilt database matches it. On the live project it
-- changes nothing. Every migration that creates a table from now on carries
-- its own grants (AGENTS.md, "Migration rules").
--
-- The shape: the app signs in, so anon reads nothing; the server's API
-- functions use service_role; authenticated gets the four row privileges
-- on the tables the app touches, SELECT only on branch_activity, and
-- nothing on the tables that are written only by SECURITY DEFINER functions
-- or the server. Row level security narrows all of this to the caller's
-- tenant and branch; grants only say which roles may ask at all.

-- The signed-out role reads nothing.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;

-- The server's role reaches everything, as it does today.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;

-- Signed-in users: the tables the app reads and writes.
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.approval_email_verifications,
  public.approval_requests,
  public.bill_items,
  public.bills,
  public.branch_approval_settings,
  public.branch_approval_settings_history,
  public.branch_counters,
  public.branches,
  public.categories,
  public.expense_categories,
  public.expenses,
  public.finance_accounts,
  public.finance_catalog,
  public.finance_day_closures,
  public.finance_entries,
  public.finance_entry_revisions,
  public.finance_rules,
  public.inventory_adjustments,
  public.inventory_alerts,
  public.inventory_audit_logs,
  public.inventory_categories,
  public.inventory_consumption_batches,
  public.inventory_consumption_jobs,
  public.inventory_dispatch_items,
  public.inventory_dispatches,
  public.inventory_material_stock_levels,
  public.inventory_material_vendor_prices,
  public.inventory_materials,
  public.inventory_purchase_headers,
  public.inventory_purchase_items,
  public.inventory_recipe_items,
  public.inventory_recipes,
  public.inventory_stock_ledger,
  public.inventory_suppliers,
  public.inventory_transfer_events,
  public.inventory_transfer_request_items,
  public.inventory_transfer_requests,
  public.inventory_transfer_variances,
  public.inventory_units,
  public.inventory_wastage,
  public.kot_items,
  public.kots,
  public.open_order_items,
  public.open_orders,
  public.pos_settings,
  public.pos_terminals,
  public.printers,
  public.products,
  public.refunds,
  public.settlements,
  public.staff,
  public.subscriptions,
  public.tenant_features,
  public.tenants
TO authenticated;

-- Read-only for signed-in users: written by a trigger.
GRANT SELECT ON public.branch_activity TO authenticated;

-- Server- and function-only tables: signed-in users do not touch them directly.
REVOKE ALL ON
  public.api_rate_limits,
  public.finance_balance_snapshots,
  public.pos_audit_logs,
  public.pos_domain_events,
  public.print_jobs,
  public.refund_items,
  public.request_log,
  public.sequence_trackers,
  public.settings,
  public.staff_branch_access,
  public.tax_configs
FROM authenticated;
