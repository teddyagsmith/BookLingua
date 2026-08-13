-- READ ONLY. Run in Supabase SQL editor with results download enabled.
-- Does not query application/customer rows or object contents.
begin transaction read only;
select version from supabase_migrations.schema_migrations order by version;
select table_schema,table_name,column_name,data_type,is_nullable from information_schema.columns where table_schema in ('public','storage') order by 1,2,ordinal_position;
select n.nspname schema_name,c.relname table_name,con.conname,pg_get_constraintdef(con.oid) definition from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','storage') order by 1,2,3;
select schemaname,tablename,indexname,indexdef from pg_indexes where schemaname in ('public','storage') order by 1,2,3;
select n.nspname schema_name,p.proname,pg_get_function_identity_arguments(p.oid) arguments,pg_get_functiondef(p.oid) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' order by 2,3;
select extname,extversion from pg_extension order by extname;
select n.nspname schema_name,c.relname table_name,c.relrowsecurity rls_enabled,c.relforcerowsecurity rls_forced from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','storage') and c.relkind='r' order by 1,2;
select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check from pg_policies where schemaname in ('public','storage') order by 1,2,3;
select id,name,public,file_size_limit,allowed_mime_types from storage.buckets order by id;
rollback;
