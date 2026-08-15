do $$
begin
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name='customer_package_version') then
    raise exception 'Customer Package V1 order version column missing';
  end if;
  if not exists(select 1 from pipeline_cutovers where version='customer-package-v1' and pipeline_version='semantic-v2') then
    raise exception 'Customer Package V1 cutover record missing';
  end if;
  if has_table_privilege('anon','public.pipeline_cutovers','SELECT')
    or has_table_privilege('authenticated','public.pipeline_cutovers','SELECT') then
    raise exception 'Pipeline cutover record exposed outside service role';
  end if;
end $$;
