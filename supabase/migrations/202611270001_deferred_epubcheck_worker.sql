-- EPUBCheck requires Java, which is deliberately unavailable in Vercel's
-- runtime.  A pending result permits internal review only; delivery continues
-- to require a matching EPUBCheck 5.1.0 PASS recorded by the Java worker.

create table if not exists epubcheck_results (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  language text not null,
  build_id uuid not null,
  artifact_id uuid not null,
  artifact_sha256 text not null,
  validator_version text not null check (validator_version = '5.1.0'),
  passed boolean not null,
  errors jsonb not null default '[]'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  output text not null default '',
  created_at timestamptz not null default now(),
  unique (artifact_id),
  foreign key (artifact_id, order_id, language, build_id)
    references artifacts(id, order_id, language, build_id)
);

create index if not exists epubcheck_results_artifact_pass_idx
  on epubcheck_results(artifact_id, artifact_sha256, passed);

alter table epubcheck_results enable row level security;
drop policy if exists "Service role manages EPUBCheck results" on epubcheck_results;
create policy "Service role manages EPUBCheck results" on epubcheck_results
  for all using (auth.role() = 'service_role');

create or replace function prevent_epubcheck_result_mutation()
returns trigger language plpgsql set search_path = public as $$
begin raise exception 'epubcheck_results_are_immutable'; end;
$$;
drop trigger if exists epubcheck_results_immutable on epubcheck_results;
create trigger epubcheck_results_immutable before update or delete on epubcheck_results
for each row execute function prevent_epubcheck_result_mutation();

-- Review may continue when the only incomplete item is a final EPUB whose
-- local validation report explicitly says that Java was unavailable.  This is
-- intentionally narrower than the delivery authority below.
create or replace function is_reviewable_package_manifest(p_manifest_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  with selected as (
    select p.*, o.file_format, o.upsells
    from package_manifests p join orders o on o.id=p.order_id
    join order_language_builds b on b.id=p.build_id and b.order_id=p.order_id and b.language=p.language
    where p.id=p_manifest_id and b.is_current
  ), required_types as (
    select unnest(array['translation_brief','pass1_docx','review_docx','translation_notes','chapter_map_docx','chapter_map_csv','upload_guide']::text[]) artifact_type
    union all select 'final_epub' from selected where replace(file_format,'.','')='epub' or coalesce(upsells,'[]'::jsonb) ? 'dual-format'
    union all select 'final_docx' from selected where replace(file_format,'.','') in ('docx','txt') or coalesce(upsells,'[]'::jsonb) ? 'dual-format'
    union all select 'launch_pack' from selected where coalesce(upsells,'[]'::jsonb) ? 'launch-pack'
  ), manifest_items as (
    select item from selected s cross join lateral jsonb_array_elements(case when jsonb_typeof(s.manifest->'artifacts')='array' then s.manifest->'artifacts' else '[]'::jsonb end) item
  ), authoritative_items as (
    select mi.item,a.artifact_type
    from manifest_items mi join selected s on true
    join artifacts a on a.id::text=mi.item->>'id' and a.order_id=s.order_id and a.language=s.language and a.build_id=s.build_id
      and a.artifact_type=mi.item->>'type' and a.storage_bucket=mi.item->>'storageBucket' and a.storage_path=mi.item->>'storagePath'
      and a.sha256=mi.item->>'sha256' and a.size_bytes::text=mi.item->>'sizeBytes'
    join validation_reports vr on vr.id=a.validation_report_id and vr.order_id=a.order_id and vr.language=a.language and vr.build_id=a.build_id
    where (a.validation_status='pass' and vr.passed=true)
       or (a.artifact_type='final_epub' and a.validation_status='pending' and vr.passed=false and vr.metrics->'epubCheck'->>'status'='pending')
  )
  select coalesce((select s.status='pass' and s.manifest->>'orderId'=s.order_id::text and s.manifest->>'language'=s.language
    and s.manifest->>'buildId'=s.build_id::text and s.manifest->>'status'='pass' and jsonb_typeof(s.manifest->'errors')='array'
    and jsonb_array_length(s.manifest->'errors')=0 and (select count(*) from manifest_items)=(select count(*) from authoritative_items)
    and not exists (select 1 from required_types r where (select count(*) from authoritative_items a where a.artifact_type=r.artifact_type)<>1)
  from selected s),false);
$$;
revoke all on function is_reviewable_package_manifest(uuid) from public;
grant execute on function is_reviewable_package_manifest(uuid) to service_role;

-- Preserve the existing name because all delivery code already calls it.  Its
-- final-EPUB branch now accepts a pending artifact only after an immutable,
-- hash-bound Java worker result has passed.
create or replace function is_authoritative_package_manifest(p_manifest_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  with selected as (
    select p.*,o.file_format,o.upsells from package_manifests p join orders o on o.id=p.order_id
    join order_language_builds b on b.id=p.build_id and b.order_id=p.order_id and b.language=p.language where p.id=p_manifest_id and b.is_current
  ), required_types as (
    select unnest(array['translation_brief','pass1_docx','review_docx','translation_notes','chapter_map_docx','chapter_map_csv','upload_guide']::text[]) artifact_type
    union all select 'final_epub' from selected where replace(file_format,'.','')='epub' or coalesce(upsells,'[]'::jsonb) ? 'dual-format'
    union all select 'final_docx' from selected where replace(file_format,'.','') in ('docx','txt') or coalesce(upsells,'[]'::jsonb) ? 'dual-format'
    union all select 'launch_pack' from selected where coalesce(upsells,'[]'::jsonb) ? 'launch-pack'
  ), manifest_items as (
    select item from selected s cross join lateral jsonb_array_elements(case when jsonb_typeof(s.manifest->'artifacts')='array' then s.manifest->'artifacts' else '[]'::jsonb end) item
  ), authoritative_items as (
    select mi.item,a.artifact_type from manifest_items mi join selected s on true
    join artifacts a on a.id::text=mi.item->>'id' and a.order_id=s.order_id and a.language=s.language and a.build_id=s.build_id
      and a.artifact_type=mi.item->>'type' and a.storage_bucket=mi.item->>'storageBucket' and a.storage_path=mi.item->>'storagePath'
      and a.sha256=mi.item->>'sha256' and a.size_bytes::text=mi.item->>'sizeBytes'
    join validation_reports vr on vr.id=a.validation_report_id and vr.order_id=a.order_id and vr.language=a.language and vr.build_id=a.build_id
    where (a.validation_status='pass' and vr.passed=true)
       or (a.artifact_type='final_epub' and a.validation_status='pending' and exists (
         select 1 from epubcheck_results er where er.artifact_id=a.id and er.order_id=a.order_id and er.language=a.language and er.build_id=a.build_id
           and er.artifact_sha256=a.sha256 and er.validator_version='5.1.0' and er.passed=true
       ))
  )
  select coalesce((select s.status='pass' and s.manifest->>'orderId'=s.order_id::text and s.manifest->>'language'=s.language
    and s.manifest->>'buildId'=s.build_id::text and s.manifest->>'status'='pass' and jsonb_typeof(s.manifest->'errors')='array'
    and jsonb_array_length(s.manifest->'errors')=0 and (select count(*) from manifest_items)=(select count(*) from authoritative_items)
    and not exists (select 1 from required_types r where (select count(*) from authoritative_items a where a.artifact_type=r.artifact_type)<>1)
  from selected s),false);
$$;
revoke all on function is_authoritative_package_manifest(uuid) from public;
grant execute on function is_authoritative_package_manifest(uuid) to service_role;

create or replace function resolve_order_package_gate(p_order_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_languages jsonb; v_missing_or_failed integer; v_status text;
begin
  select languages into v_languages from orders where id=p_order_id for update;
  if v_languages is null then raise exception 'order_not_found'; end if;
  with required_languages as (select jsonb_array_elements_text(v_languages) language), latest_packages as (
    select distinct on (p.language) p.language,p.status,is_reviewable_package_manifest(p.id) as reviewable
    from package_manifests p join order_language_builds b on b.id=p.build_id and b.order_id=p.order_id and b.language=p.language
    where p.order_id=p_order_id and b.is_current order by p.language,p.created_at desc,p.id desc
  ) select count(*) into v_missing_or_failed from required_languages r left join latest_packages p using(language)
    where p.language is null or p.status<>'pass' or p.reviewable is not true;
  if jsonb_typeof(v_languages)<>'array' or jsonb_array_length(v_languages)=0 or jsonb_array_length(v_languages)<>(select count(distinct language) from jsonb_array_elements_text(v_languages) u(language)) then raise exception 'invalid_order_languages'; end if;
  if (select status from orders where id=p_order_id) in ('delivery_pending','completed') then raise exception 'order_delivery_already_started'; end if;
  v_status:=case when v_missing_or_failed=0 then 'ready_for_review' else 'gate_failed' end;
  update orders set status=v_status,completed_at=null where id=p_order_id;
  return v_status;
end;
$$;
revoke all on function resolve_order_package_gate(uuid) from public;
grant execute on function resolve_order_package_gate(uuid) to service_role;
