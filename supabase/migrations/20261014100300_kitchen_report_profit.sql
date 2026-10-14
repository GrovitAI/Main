-- Task 209: a Profit report beside Sales, Purchases, Cash and Bank. For each
-- finished good sent in the period: what branches paid and what it cost to
-- make (quantity x the cost per unit kept on each send line, or today's cost
-- for sends from before a cost was set). The summary now also carries the
-- cost of goods sent and how many sent items have no cost yet, so the month's
-- profit is sales - cost of goods sent - other expenses. Purchases are not
-- subtracted again: their cost is inside each item's cost per unit. Same body
-- as 20261014100100_kitchen_report_bank.sql otherwise.

CREATE OR REPLACE FUNCTION public.kitchen_range_report(
 p_tenant_id uuid,p_branch_id uuid,p_start_date date,p_end_date date,p_report text,
 p_party_id uuid DEFAULT NULL,p_item_id uuid DEFAULT NULL,p_category text DEFAULT NULL,
 p_include_expenses boolean DEFAULT false,p_detail boolean DEFAULT false,
 p_offset integer DEFAULT 0,p_limit integer DEFAULT 50,p_export boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public
AS $report$
DECLARE result jsonb;
BEGIN
 IF public.kitchen_can_use(p_tenant_id,p_branch_id) IS NOT TRUE THEN
   RAISE EXCEPTION 'KITCHEN_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 PERFORM public.kitchen_require(p_tenant_id,p_branch_id,'reports.view');
 IF p_export THEN PERFORM public.kitchen_require(p_tenant_id,p_branch_id,'reports.export'); END IF;
 IF p_start_date IS NULL OR p_end_date IS NULL OR p_end_date<p_start_date OR p_report NOT IN ('sales','purchases','cash','bank','profit')
   OR p_report IS NULL OR p_offset IS NULL OR p_offset<0 OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN
   RAISE EXCEPTION 'KITCHEN_INVALID' USING ERRCODE='22023';
 END IF;
 WITH range_entries AS MATERIALIZED (
   SELECT e.*,coalesce(p.name,'Other expense') AS party_name
   FROM public.kitchen_entries e
   LEFT JOIN public.kitchen_parties p ON p.id=e.party_id AND p.tenant_id=p_tenant_id AND p.branch_id=p_branch_id
   WHERE e.tenant_id=p_tenant_id AND e.branch_id=p_branch_id AND e.voided_at IS NULL
     AND e.entry_date>=p_start_date AND e.entry_date<=p_end_date
 ), sale_lines AS MATERIALIZED (
   SELECT e.id AS entry_id,e.entry_date,e.party_id,e.party_name,l.id AS line_id,l.item_id,
     i.name AS item_name,i.unit,l.qty,l.price_paise,l.line_paise,
     -- The cost of the day of the send; sends from before a cost was set use today's cost.
     coalesce(l.cost_paise,i.cost_price_paise) AS unit_cost_paise
   FROM range_entries e
   JOIN public.kitchen_entry_lines l ON l.entry_id=e.id AND l.tenant_id=p_tenant_id AND l.branch_id=p_branch_id
   JOIN public.kitchen_items i ON i.id=l.item_id AND i.tenant_id=p_tenant_id AND i.branch_id=p_branch_id
   WHERE e.type='sent'
 ), filtered_sales AS (
   SELECT * FROM sale_lines WHERE (p_party_id IS NULL OR party_id=p_party_id) AND (p_item_id IS NULL OR item_id=p_item_id)
 ), spending AS MATERIALIZED (
   SELECT e.*,CASE WHEN e.type='bought' THEN coalesce(e.purchase_category_name,'Uncategorized') ELSE e.category END AS category_name,
     CASE WHEN e.type='bought' THEN 'Purchase' ELSE 'Other expense' END AS source_name
   FROM range_entries e WHERE e.type='bought' OR (p_include_expenses AND e.type='spent')
 ), filtered_spending AS (
   SELECT * FROM spending WHERE (p_party_id IS NULL OR party_id=p_party_id) AND (p_category IS NULL OR category_name=p_category)
 ), cash_entries AS (
   -- Cash is cash (or no mode); UPI and bank are Bank, as in kitchen_money_summary.
   SELECT e.* FROM range_entries e
   WHERE (e.type IN ('received','paid','spent') OR (e.type='bought' AND e.paid))
     AND (p_party_id IS NULL OR e.party_id=p_party_id)
     AND CASE WHEN coalesce(e.mode,'cash') IN ('upi','bank') THEN 'bank' ELSE 'cash' END=p_report
 ), money_moves AS (
   -- A move takes money out of one account and puts it into the other; it has no branch or vendor.
   SELECT m.* FROM public.kitchen_money_moves m
   WHERE m.tenant_id=p_tenant_id AND m.branch_id=p_branch_id AND m.voided_at IS NULL
     AND m.move_date>=p_start_date AND m.move_date<=p_end_date
     AND p_party_id IS NULL AND p_report IN ('cash','bank')
 ), report_rows AS (
   SELECT party_id::text||':'||item_id::text AS key,'sale'::text AS kind,NULL::uuid AS entry_id,NULL::date AS date,
     party_id,party_name AS party,item_id,item_name AS item,unit,sum(qty) AS quantity,
     NULL::bigint AS price_paise,sum(line_paise)::bigint AS amount_paise,
     count(DISTINCT entry_id)::integer AS documents,NULL::text AS category,'Goods supplied'::text AS source,
     NULL::text AS payment,NULL::text AS mode,0::bigint AS money_in_paise,0::bigint AS money_out_paise,
     NULL::bigint AS cost_paise
   FROM filtered_sales WHERE p_report='sales' AND NOT (p_detail OR p_export)
   GROUP BY party_id,party_name,item_id,item_name,unit
   UNION ALL
   SELECT line_id::text,'entry',entry_id,entry_date,party_id,party_name,item_id,item_name,unit,qty,price_paise,line_paise,
     1,NULL,'Goods supplied',NULL,NULL,0,0,NULL FROM filtered_sales WHERE p_report='sales' AND (p_detail OR p_export)
   UNION ALL
   -- Profit: per finished good, what branches paid against what it cost to make.
   SELECT item_id::text,'profit',NULL,NULL,NULL,'',item_id,item_name,unit,sum(qty),NULL,sum(line_paise)::bigint,
     count(DISTINCT entry_id)::integer,NULL,'Goods supplied',NULL,NULL,0,0,
     CASE WHEN bool_and(unit_cost_paise IS NOT NULL) THEN round(sum(qty*unit_cost_paise))::bigint END
   FROM filtered_sales WHERE p_report='profit'
   GROUP BY item_id,item_name,unit
   UNION ALL
   SELECT category_name,'category',NULL,NULL,NULL,string_agg(DISTINCT source_name,' + ' ORDER BY source_name),NULL,NULL,NULL,NULL,NULL,
     sum(amount_paise)::bigint,count(*)::integer,category_name,string_agg(DISTINCT source_name,' + ' ORDER BY source_name),NULL,NULL,0,0,NULL
   FROM filtered_spending WHERE p_report='purchases' AND NOT (p_detail OR p_export)
   GROUP BY category_name
   UNION ALL
   SELECT id::text,'entry',id,entry_date,party_id,party_name,NULL,NULL,NULL,NULL,NULL,amount_paise,1,category_name,source_name,
     CASE WHEN type='spent' OR paid THEN 'Paid on entry' ELSE 'Pay later on entry' END,mode,0,0,NULL
   FROM filtered_spending WHERE p_report='purchases' AND (p_detail OR p_export)
   UNION ALL
   SELECT id::text,'cash',id,entry_date,party_id,party_name,NULL,NULL,NULL,NULL,NULL,amount_paise,1,
     coalesce(purchase_category_name,category),
     CASE type WHEN 'received' THEN 'Branch collection' WHEN 'paid' THEN 'Vendor payment'
       WHEN 'bought' THEN 'Purchase paid on entry' ELSE 'Other expense' END,
     NULL,mode,CASE WHEN type='received' THEN amount_paise ELSE 0 END,
     CASE WHEN type<>'received' THEN amount_paise ELSE 0 END,NULL
   FROM cash_entries WHERE p_report IN ('cash','bank')
   UNION ALL
   SELECT id::text,'cash',id,move_date,NULL,CASE WHEN to_account='bank' THEN 'Cash deposited in bank' ELSE 'Cash withdrawn from bank' END,
     NULL,NULL,NULL,NULL,NULL,amount_paise,1,NULL,'Money moved',NULL,NULL,
     CASE WHEN to_account=p_report THEN amount_paise ELSE 0 END,
     CASE WHEN from_account=p_report THEN amount_paise ELSE 0 END,NULL
   FROM money_moves
 ), ordered AS (
   SELECT r.*,row_number() OVER(ORDER BY r.date DESC NULLS LAST,r.amount_paise DESC,r.party,r.item,r.key) AS position
   FROM report_rows r
 ), paged AS (
   SELECT * FROM ordered WHERE (p_export AND position<=10000) OR (NOT p_export AND position>p_offset AND position<=p_offset+p_limit)
 )
 SELECT jsonb_build_object(
   'summary',jsonb_build_object(
     'sales_paise',coalesce((SELECT sum(amount_paise) FROM range_entries WHERE type='sent'),0),
     'purchases_paise',coalesce((SELECT sum(amount_paise) FROM range_entries WHERE type='bought'),0),
     'expenses_paise',coalesce((SELECT sum(amount_paise) FROM range_entries WHERE type='spent'),0),
     'cash_in_paise',coalesce((SELECT sum(amount_paise) FROM range_entries WHERE type='received'),0),
     'cash_out_paise',coalesce((SELECT sum(amount_paise) FROM range_entries WHERE type IN ('paid','spent') OR (type='bought' AND paid)),0),
     'cost_paise',coalesce((SELECT round(sum(qty*unit_cost_paise))::bigint FROM sale_lines WHERE unit_cost_paise IS NOT NULL),0),
     'cost_missing_items',(SELECT count(DISTINCT item_id) FROM sale_lines WHERE unit_cost_paise IS NULL),
     'cost_missing_sales_paise',coalesce((SELECT sum(line_paise) FROM sale_lines WHERE unit_cost_paise IS NULL),0)
   ),
   'total_rows',(SELECT count(*) FROM report_rows),
   'filtered_paise',coalesce((SELECT sum(amount_paise) FROM report_rows),0),
   'filtered_in_paise',coalesce((SELECT sum(money_in_paise) FROM report_rows),0),
   'filtered_out_paise',coalesce((SELECT sum(money_out_paise) FROM report_rows),0),
   'rows',coalesce((SELECT jsonb_agg(to_jsonb(r)-'position' ORDER BY position) FROM paged r),'[]'::jsonb),
   'options',jsonb_build_object(
     'branches',coalesce((SELECT jsonb_agg(to_jsonb(o) ORDER BY label) FROM (SELECT DISTINCT party_id AS id,party_name AS label FROM sale_lines) o),'[]'::jsonb),
     'items',coalesce((SELECT jsonb_agg(to_jsonb(o) ORDER BY label) FROM (SELECT DISTINCT item_id AS id,item_name AS label FROM sale_lines) o),'[]'::jsonb),
     'vendors',coalesce((SELECT jsonb_agg(to_jsonb(o) ORDER BY label) FROM (SELECT DISTINCT party_id AS id,party_name AS label FROM spending WHERE type='bought') o),'[]'::jsonb),
     'categories',coalesce((SELECT jsonb_agg(to_jsonb(o) ORDER BY label) FROM (SELECT DISTINCT category_name AS id,category_name AS label FROM spending) o),'[]'::jsonb)
   )
 ) INTO result;
 IF p_export AND (result->>'total_rows')::bigint>10000 THEN
   RAISE EXCEPTION 'KITCHEN_EXPORT_TOO_LARGE' USING ERRCODE='22023';
 END IF;
 RETURN result;
END
$report$;
