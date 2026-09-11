-- All read-only. No locks, safe during trading.
SELECT '1. bills sharing a settlement (blocks UNIQUE settlements.bill_id in ...000300)' AS check,
       count(*)::text AS failures
FROM (SELECT bill_id FROM settlements GROUP BY bill_id HAVING count(*) > 1) d
UNION ALL
SELECT '2. duplicate invoice numbers per branch, ALL TIME',
       count(*)::text FROM (
  SELECT tenant_id, branch_id, invoice_number FROM bills
  WHERE invoice_number IS NOT NULL
  GROUP BY 1,2,3 HAVING count(*) > 1) d
UNION ALL
SELECT '3. duplicate invoice numbers created on/after 2026-09-07 (informational: migration 2 starts its rule when it runs, so these no longer block it)',
       count(*)::text FROM (
  SELECT tenant_id, branch_id, invoice_number FROM bills
  WHERE invoice_number IS NOT NULL AND created_at >= '2026-09-07'
  GROUP BY 1,2,3 HAVING count(*) > 1) d
UNION ALL
SELECT '4. orders with more than one bill (blocks UNIQUE bills.open_order_id)',
       count(*)::text FROM (
  SELECT open_order_id FROM bills WHERE open_order_id IS NOT NULL
  GROUP BY 1 HAVING count(*) > 1) d
UNION ALL
SELECT '5. active staff without auth_user_id (would be locked out by RLS)',
       count(*)::text FROM staff WHERE status='active' AND deleted_at IS NULL AND auth_user_id IS NULL
UNION ALL
SELECT '6. staff rows whose auth_user_id has no auth.users row',
       count(*)::text FROM staff s WHERE s.auth_user_id IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = s.auth_user_id)
UNION ALL
SELECT '7. settlements orphaned from bills',
       count(*)::text FROM settlements s WHERE NOT EXISTS (SELECT 1 FROM bills b WHERE b.id = s.bill_id)
UNION ALL
SELECT '8. paid bills with NO settlement row',
       count(*)::text FROM bills b WHERE b.status='paid'
         AND NOT (b.discount_type='percent' AND b.discount_value=100)
         AND NOT EXISTS (SELECT 1 FROM settlements s WHERE s.bill_id = b.id)
ORDER BY 1;
