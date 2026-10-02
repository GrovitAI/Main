with own_fn as (
  select p.* from pg_proc p left join pg_depend d on d.objid = p.oid and d.deptype = 'e'
   where p.pronamespace = 'public'::regnamespace and d.objid is null
)
select
 (select count(*) from own_fn) as fns,
 (select md5(string_agg(oid::regprocedure::text || ':' || md5(prosrc) || ':' || prosecdef::text || ':' || provolatile::text || ':' || coalesce(array_to_string(proconfig, ','), ''), '|' order by oid::regprocedure::text)) from own_fn) as fn_hash,
 (select md5(string_agg(oid::regprocedure::text || ':' || (select string_agg(a::text, ',' order by a::text) from unnest(coalesce(proacl, acldefault('f', proowner))) a), '|' order by oid::regprocedure::text)) from own_fn) as fn_acl_hash,
 (select md5(string_agg(c.relname || ':' || c.relrowsecurity::text || ':' || (select string_agg(a::text, ',' order by a::text) from unnest(coalesce(c.relacl, acldefault(case when c.relkind = 'S' then 's'::"char" else 'r'::"char" end, c.relowner))) a), '|' order by c.relname)) from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','S')) as table_acl_hash,
 (select count(*) from pg_tables where schemaname = 'public') as tables,
 (select md5(string_agg(schemaname || tablename || policyname || cmd || permissive || array_to_string(roles, ',') || coalesce(qual, '') || coalesce(with_check, ''), '|' order by schemaname, tablename, policyname)) from pg_policies where schemaname = 'public' or (schemaname = 'storage' and policyname like 'finance_receipts%')) as policy_hash,
 (select count(*) from pg_policies where schemaname = 'public' or (schemaname = 'storage' and policyname like 'finance_receipts%')) as policies,
 (select md5(string_agg(table_name || column_name || data_type || is_nullable || coalesce(column_default, '') || coalesce(generation_expression, ''), '|' order by table_name, ordinal_position)) from information_schema.columns where table_schema = 'public') as column_hash,
 (select md5(string_agg(conrelid::regclass::text || conname || pg_get_constraintdef(oid), '|' order by conrelid::regclass::text, conname)) from pg_constraint where connamespace = 'public'::regnamespace) as constraint_hash,
 (select md5(string_agg(indexdef, '|' order by indexname)) from pg_indexes where schemaname = 'public') as index_hash,
 (select md5(string_agg(pg_get_triggerdef(t.oid), '|' order by t.tgrelid::regclass::text, t.tgname)) from pg_trigger t join pg_class c on c.oid = t.tgrelid where c.relnamespace = 'public'::regnamespace and not t.tgisinternal) as trigger_hash,
 (select md5(string_agg(coalesce(system_key, '-') || ':' || name, '|' order by tenant_id, level, name)) from public.finance_catalog) as catalog_hash,
 (select id || ':' || public::text || ':' || file_size_limit::text || ':' || array_to_string(allowed_mime_types, ',') from storage.buckets where id = 'finance-receipts') as bucket;
