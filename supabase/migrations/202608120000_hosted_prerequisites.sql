-- Forward-only prerequisites for the observed BookLingua hosted catalog.
-- Apply only through the reviewed production incremental manifest.

alter table public.orders
  add column if not exists qa_errors text;

alter table public.translation_chunks
  drop constraint if exists translation_chunks_pass_check;
alter table public.translation_chunks
  add constraint translation_chunks_pass_check
  check (pass in ('sonnet', 'opus', 'semantic-pass1', 'semantic-pass2'));

alter table public.translation_chunks
  add column if not exists model_provider text,
  add column if not exists model_id text,
  add column if not exists model_stage text;

update public.translation_chunks
set model_provider = coalesce(model_provider, 'legacy-unknown'),
    model_id = coalesce(model_id, 'unknown-legacy'),
    model_stage = coalesce(model_stage, pass)
where model_provider is null or model_id is null or model_stage is null;

alter table public.translation_chunks
  alter column model_provider set default 'legacy-unknown',
  alter column model_provider set not null,
  alter column model_id set default 'unknown-legacy',
  alter column model_id set not null,
  alter column model_stage set default 'legacy',
  alter column model_stage set not null;

comment on column public.translation_chunks.pass is
  'Backward-compatible pipeline stage identity; not the actual model ID.';
comment on column public.translation_chunks.model_id is
  'Actual provider model ID used for this cached result.';

create or replace function public.booklingua_sha256(p_value text)
returns text
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_namespace text;
  v_result text;
begin
  select n.nspname into v_namespace
  from pg_extension e join pg_namespace n on n.oid=e.extnamespace
  where e.extname='pgcrypto';
  if v_namespace is null then raise exception 'pgcrypto_extension_missing'; end if;
  execute format('select encode(%I.digest($1, ''sha256''), ''hex'')', v_namespace)
    into v_result using p_value;
  return v_result;
end;
$$;

revoke all on function public.booklingua_sha256(text) from public;
grant execute on function public.booklingua_sha256(text) to service_role;
