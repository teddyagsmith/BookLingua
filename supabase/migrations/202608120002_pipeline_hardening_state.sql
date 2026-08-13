-- Pipeline hardening v2: normalized stage, validation and artifact records.
-- DO NOT apply automatically.
-- Apply after 202608120001_pipeline_hardening_source.sql.

alter table orders
  add column if not exists failed_stage text,
  add column if not exists failure_message text,
  add column if not exists failed_at timestamptz,
  add column if not exists delivery_started_at timestamptz;

create table if not exists pipeline_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  language text not null,
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
  language text not null,
  build_id uuid not null,
  stage text not null,
  validator_version text not null,
  passed boolean not null,
  errors jsonb not null default '[]'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(order_id, language, build_id, stage, validator_version),
  unique(id, order_id, language, build_id)
);
alter table validation_reports alter column language set not null;

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
  validation_report_id uuid not null,
  validation_status text not null check (validation_status in ('pending', 'pass', 'fail')),
  created_at timestamptz not null default now(),
  check (size_bytes > 0),
  unique(order_id, language, build_id, artifact_type),
  unique(id, order_id, language, build_id, artifact_type),
  foreign key(validation_report_id, order_id, language, build_id)
    references validation_reports(id, order_id, language, build_id)
);

create table if not exists package_manifests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  language text not null,
  build_id uuid not null,
  schema_version text not null,
  status text not null check (status in ('building', 'pass', 'fail')),
  manifest jsonb not null,
  validation_report_id uuid,
  created_at timestamptz not null default now(),
  unique(order_id, language, build_id),
  unique(id, order_id, language, build_id)
);

create or replace function prevent_hardened_history_mutation()
returns trigger language plpgsql set search_path = public as $$
begin raise exception 'hardened_history_is_immutable'; end;
$$;

drop trigger if exists validation_reports_immutable on validation_reports;
drop trigger if exists artifacts_immutable on artifacts;
drop trigger if exists package_manifests_immutable on package_manifests;
create trigger validation_reports_immutable before update or delete on validation_reports
for each row execute function prevent_hardened_history_mutation();
create trigger artifacts_immutable before update or delete on artifacts
for each row execute function prevent_hardened_history_mutation();
create trigger package_manifests_immutable before update or delete on package_manifests
for each row execute function prevent_hardened_history_mutation();

create or replace function prevent_artifact_changes_during_delivery()
returns trigger language plpgsql set search_path = public as $$
declare v_status text;
begin
  select status into v_status from orders where id = new.order_id for share;
  if v_status in ('delivery_pending', 'completed') then raise exception 'order_delivery_already_started'; end if;
  return new;
end;
$$;
drop trigger if exists artifacts_delivery_guard on artifacts;
drop trigger if exists package_manifests_delivery_guard on package_manifests;
create trigger artifacts_delivery_guard before insert on artifacts
for each row execute function prevent_artifact_changes_during_delivery();
create trigger package_manifests_delivery_guard before insert on package_manifests
for each row execute function prevent_artifact_changes_during_delivery();

create index if not exists artifacts_package_lookup_idx
  on artifacts(order_id, language, build_id, artifact_type, validation_status);
create index if not exists package_manifests_gate_lookup_idx
  on package_manifests(order_id, language, status, created_at desc);

alter table pipeline_events enable row level security;
alter table validation_reports enable row level security;
alter table artifacts enable row level security;
alter table package_manifests enable row level security;

drop policy if exists "Service role manages pipeline events" on pipeline_events;
drop policy if exists "Service role manages validation reports" on validation_reports;
drop policy if exists "Service role manages artifacts" on artifacts;
drop policy if exists "Service role manages package manifests" on package_manifests;
create policy "Service role manages pipeline events" on pipeline_events
  for all using (auth.role() = 'service_role');
create policy "Service role manages validation reports" on validation_reports
  for all using (auth.role() = 'service_role');
create policy "Service role manages artifacts" on artifacts
  for all using (auth.role() = 'service_role');
create policy "Service role manages package manifests" on package_manifests
  for all using (auth.role() = 'service_role');

-- Recompute package authority from persisted rows. A caller-supplied `pass`
-- value or manifest JSON is never sufficient to make an order reviewable.
create or replace function is_authoritative_package_manifest(p_manifest_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with selected as (
    select p.*, o.file_format, o.upsells
    from package_manifests p
    join orders o on o.id = p.order_id
    where p.id = p_manifest_id
  ), required_types as (
    select unnest(array[
      'translation_brief', 'pass1_docx', 'review_docx', 'translation_notes',
      'chapter_map_docx', 'chapter_map_csv', 'upload_guide'
    ]::text[]) artifact_type
    union all
    select 'final_epub' from selected
      where replace(file_format, '.', '') = 'epub'
        or coalesce(upsells, '[]'::jsonb) ? 'dual-format'
    union all
    select 'final_docx' from selected
      where replace(file_format, '.', '') in ('docx', 'txt')
        or coalesce(upsells, '[]'::jsonb) ? 'dual-format'
    union all
    select 'launch_pack' from selected
      where coalesce(upsells, '[]'::jsonb) ? 'launch-pack'
  ), manifest_items as (
    select item
    from selected s
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(s.manifest->'artifacts') = 'array'
        then s.manifest->'artifacts' else '[]'::jsonb end
    ) item
  ), authoritative_items as (
    select mi.item, a.artifact_type
    from manifest_items mi
    join selected s on true
    join artifacts a
      on a.id::text = mi.item->>'id'
     and a.order_id = s.order_id
     and a.language = s.language
     and a.build_id = s.build_id
     and a.artifact_type = mi.item->>'type'
     and a.storage_bucket = mi.item->>'storageBucket'
     and a.storage_path = mi.item->>'storagePath'
     and a.sha256 = mi.item->>'sha256'
     and a.size_bytes::text = mi.item->>'sizeBytes'
     and a.validation_status = 'pass'
    join validation_reports vr
      on vr.id = a.validation_report_id
     and vr.order_id = a.order_id
     and vr.language = a.language
     and vr.build_id = a.build_id
     and vr.passed = true
  )
  select coalesce((select
    s.status = 'pass'
    and s.manifest->>'orderId' = s.order_id::text
    and s.manifest->>'language' = s.language
    and s.manifest->>'buildId' = s.build_id::text
    and s.manifest->>'status' = 'pass'
    and jsonb_typeof(s.manifest->'errors') = 'array'
    and jsonb_array_length(s.manifest->'errors') = 0
    and (select count(*) from manifest_items) = (select count(*) from authoritative_items)
    and not exists (
      select 1 from required_types r
      where (select count(*) from authoritative_items a where a.artifact_type = r.artifact_type) <> 1
    )
  from selected s), false);
$$;
revoke all on function is_authoritative_package_manifest(uuid) from public;
grant execute on function is_authoritative_package_manifest(uuid) to service_role;

-- Resolve an order gate in one database transaction. A PASS is possible only
-- when every purchased language has exactly one latest passing package.
create or replace function resolve_order_package_gate(p_order_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_languages jsonb;
  v_missing_or_failed integer;
  v_status text;
begin
  select languages into v_languages from orders where id = p_order_id for update;
  if v_languages is null then raise exception 'order_not_found'; end if;

  with required_languages as (
    select jsonb_array_elements_text(v_languages) as language
  ), latest_packages as (
    select distinct on (language) language, status,
      is_authoritative_package_manifest(id) as authoritative
    from package_manifests
    where order_id = p_order_id
    order by language, created_at desc, id desc
  )
  select count(*) into v_missing_or_failed
  from required_languages r
  left join latest_packages p using (language)
  where p.language is null or p.status <> 'pass' or p.authoritative is not true;

  if jsonb_typeof(v_languages) <> 'array'
    or jsonb_array_length(v_languages) = 0
    or jsonb_array_length(v_languages) <> (
      select count(distinct language) from jsonb_array_elements_text(v_languages) as u(language)
    ) then
    raise exception 'invalid_order_languages';
  end if;
  if (select status from orders where id = p_order_id) in ('delivery_pending', 'completed') then
    raise exception 'order_delivery_already_started';
  end if;
  v_status := case when v_missing_or_failed = 0 then 'ready_for_review' else 'gate_failed' end;
  update orders set status = v_status, completed_at = null where id = p_order_id;
  return v_status;
end;
$$;

revoke all on function resolve_order_package_gate(uuid) from public;
grant execute on function resolve_order_package_gate(uuid) to service_role;

create or replace function begin_hardened_delivery(p_order_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_languages jsonb; v_missing integer;
begin
  select languages into v_languages from orders
  where id = p_order_id and status in ('ready_for_review', 'delivery_pending') for update;
  if v_languages is null then raise exception 'order_not_ready_for_delivery'; end if;
  if jsonb_typeof(v_languages) <> 'array' or jsonb_array_length(v_languages) = 0 then
    raise exception 'invalid_order_languages';
  end if;
  with required_languages as (select jsonb_array_elements_text(v_languages) language),
  latest as (
    select distinct on (language) language, status,
      is_authoritative_package_manifest(id) as authoritative from package_manifests
    where order_id = p_order_id order by language, created_at desc, id desc
  )
  select count(*) into v_missing from required_languages r left join latest p using(language)
  where p.language is null or p.status <> 'pass' or p.authoritative is not true;
  if v_missing <> 0 then raise exception 'package_state_changed'; end if;
  update orders set status = 'delivery_pending', delivery_started_at = coalesce(delivery_started_at, now()), completed_at = null
  where id = p_order_id;
end;
$$;
revoke all on function begin_hardened_delivery(uuid) from public;
grant execute on function begin_hardened_delivery(uuid) to service_role;
