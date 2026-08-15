do $$
begin
  if to_regclass('public.order_language_builds') is null
    or to_regclass('public.package_manifests') is null
    or to_regclass('public.delivery_events') is null
    or to_regclass('public.model_call_events') is null then
    raise exception 'Customer Package V1 hardening baseline is incomplete';
  end if;
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name='customer_package_version') then
    raise exception 'Customer Package V1 cutover column already exists; reconcile before migration';
  end if;
end $$;
