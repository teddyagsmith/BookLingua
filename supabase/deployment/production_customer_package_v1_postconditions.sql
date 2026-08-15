do $$
begin
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name='customer_package_version') then
    raise exception 'Customer Package V1 order version column missing';
  end if;
  if not exists(select 1 from pipeline_cutovers where version='customer-package-v1' and pipeline_version='semantic-v2') then
    raise exception 'Customer Package V1 cutover record missing';
  end if;
  if not exists(
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='pipeline_cutovers' and c.relrowsecurity
  ) then
    raise exception 'Pipeline cutover RLS is disabled';
  end if;
  if exists(
    select 1 from pg_policy p
    where p.polrelid='public.pipeline_cutovers'::regclass
      and p.polcmd in ('*','r')
      and (0=any(p.polroles) or 'anon'::regrole::oid=any(p.polroles) or 'authenticated'::regrole::oid=any(p.polroles))
  ) then
    raise exception 'Pipeline cutover has a customer-readable RLS policy';
  end if;
end $$;

set local role anon;
do $$ declare visible_rows bigint := 0; begin
  begin
    select count(*) into visible_rows from public.pipeline_cutovers;
  exception when insufficient_privilege then
    visible_rows := 0;
  end;
  if visible_rows <> 0 then
    raise exception 'Anonymous role can read pipeline cutover rows';
  end if;
end $$;
reset role;

set local role authenticated;
do $$ declare visible_rows bigint := 0; begin
  begin
    select count(*) into visible_rows from public.pipeline_cutovers;
  exception when insufficient_privilege then
    visible_rows := 0;
  end;
  if visible_rows <> 0 then
    raise exception 'Authenticated role can read pipeline cutover rows';
  end if;
end $$;
reset role;

set local role service_role;
do $$ begin
  if not exists(select 1 from public.pipeline_cutovers where version='customer-package-v1') then
    raise exception 'Service role cannot read pipeline cutover record';
  end if;
end $$;
reset role;
