-- Pipeline hardening v2: normalized stage, validation and artifact records.
-- DO NOT apply automatically.
-- Apply after 20260812_pipeline_hardening_source.sql.

alter table orders
  add column if not exists failed_stage text,
  add column if not exists failure_message text,
  add column if not exists failed_at timestamptz;

create table if not exists pipeline_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  language text,
  stage text not null,
  status text not null,
  level text not null default 'info',
  safe_message text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists pipeline_events_order_created_idx
  on pipeline_events(order_id, created_at desc);

create table if not exists validation_reports (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  language text,
  build_id uuid not null,
  stage text not null,
  validator_version text not null,
  passed boolean not null,
  errors jsonb not null default '[]'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(order_id, language, build_id, stage, validator_version)
);

create table if not exists artifacts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  language text not null,
  build_id uuid not null,
  artifact_type text not null,
  storage_bucket text not null,
  storage_path text not null,
  filename text not null,
  sha256 text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  schema_version text,
  validation_report_id uuid references validation_reports(id),
  validation_status text not null check (validation_status in ('pending', 'pass', 'fail')),
  created_at timestamptz not null default now(),
  check (size_bytes > 0),
  unique(order_id, language, build_id, artifact_type),
  unique(id, order_id, language, build_id, artifact_type)
);

create table if not exists package_manifests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  language text not null,
  build_id uuid not null,
  schema_version text not null,
  status text not null check (status in ('building', 'pass', 'fail')),
  manifest jsonb not null,
  validation_report_id uuid references validation_reports(id),
  created_at timestamptz not null default now(),
  unique(order_id, language, build_id),
  unique(id, order_id, language, build_id)
);

create index if not exists artifacts_package_lookup_idx
  on artifacts(order_id, language, build_id, artifact_type, validation_status);
create index if not exists package_manifests_gate_lookup_idx
  on package_manifests(order_id, language, status, created_at desc);

alter table pipeline_events enable row level security;
alter table validation_reports enable row level security;
alter table artifacts enable row level security;
alter table package_manifests enable row level security;

create policy "Service role manages pipeline events" on pipeline_events
  for all using (auth.role() = 'service_role');
create policy "Service role manages validation reports" on validation_reports
  for all using (auth.role() = 'service_role');
create policy "Service role manages artifacts" on artifacts
  for all using (auth.role() = 'service_role');
create policy "Service role manages package manifests" on package_manifests
  for all using (auth.role() = 'service_role');

-- Resolve an order gate in one database transaction. A PASS is possible only
-- when every purchased language has exactly one latest passing package.
create or replace function resolve_order_package_gate(p_order_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_languages text[];
  v_missing_or_failed integer;
  v_status text;
begin
  select languages into v_languages from orders where id = p_order_id for update;
  if v_languages is null then raise exception 'order_not_found'; end if;

  with required_languages as (
    select unnest(v_languages) as language
  ), latest_packages as (
    select distinct on (language) language, status
    from package_manifests
    where order_id = p_order_id
    order by language, created_at desc
  )
  select count(*) into v_missing_or_failed
  from required_languages r
  left join latest_packages p using (language)
  where p.language is null or p.status <> 'pass';

  v_status := case when v_missing_or_failed = 0 then 'ready_for_review' else 'gate_failed' end;
  update orders set status = v_status, completed_at = null where id = p_order_id;
  return v_status;
end;
$$;

revoke all on function resolve_order_package_gate(uuid) from public;
grant execute on function resolve_order_package_gate(uuid) to service_role;
