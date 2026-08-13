do $$
declare table_name text;
begin
  foreach table_name in array array['model_call_events','launch_pack_results'] loop
    if to_regclass('public.' || table_name) is null then raise exception 'Missing table: %', table_name; end if;
    if not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=table_name and c.relrowsecurity) then
      raise exception 'RLS is not enabled: %', table_name;
    end if;
    if not exists(select 1 from pg_trigger where tgrelid=('public.'||table_name)::regclass and tgname=table_name||'_immutable' and not tgisinternal) then
      raise exception 'Immutable trigger missing: %', table_name;
    end if;
  end loop;
  if to_regprocedure('public.fail_active_order_builds(uuid,text,text,timestamp with time zone)') is null then
    raise exception 'Terminal cleanup RPC missing';
  end if;
  if has_function_privilege('anon','public.fail_active_order_builds(uuid,text,text,timestamp with time zone)','EXECUTE')
    or has_function_privilege('authenticated','public.fail_active_order_builds(uuid,text,text,timestamp with time zone)','EXECUTE') then
    raise exception 'Terminal cleanup RPC exposed outside service role';
  end if;
end $$;
