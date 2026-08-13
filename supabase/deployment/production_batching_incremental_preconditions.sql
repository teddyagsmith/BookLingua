do $$
begin
  if to_regclass('public.order_language_builds') is null
    or to_regclass('public.pipeline_events') is null
    or to_regclass('public.semantic_documents') is null then
    raise exception 'Required hosted hardening baseline is absent';
  end if;
  if to_regclass('public.model_call_events') is not null
    or to_regclass('public.launch_pack_results') is not null then
    raise exception 'Batching observability objects already exist; reconcile before migration';
  end if;
  if to_regprocedure('public.fail_active_order_builds(uuid,text,text,timestamp with time zone)') is not null then
    raise exception 'Terminal cleanup RPC already exists; reconcile before migration';
  end if;
  if to_regprocedure('public.prevent_hardened_history_mutation()') is null then
    raise exception 'Immutable-history baseline function is absent';
  end if;
end $$;
