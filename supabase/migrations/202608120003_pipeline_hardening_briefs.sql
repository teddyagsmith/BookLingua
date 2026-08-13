-- Pipeline hardening v2: immutable per-language translation briefs.
-- DO NOT apply automatically. Apply after the source and state migrations.

alter table temp_uploads
  add column if not exists glossary_saved_at timestamptz;

create table if not exists translation_briefs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  language text not null,
  schema_version text not null,
  revision integer not null check (revision > 0),
  source_manifest_fingerprint text not null,
  content_fingerprint text not null,
  approved_at timestamptz not null,
  approval_source text not null check (approval_source in ('author_scan', 'legacy_import', 'admin')),
  brief jsonb not null,
  created_at timestamptz not null default now(),
  unique(order_id, language, schema_version, revision),
  unique(order_id, language, content_fingerprint)
);

create index if not exists translation_briefs_active_lookup_idx
  on translation_briefs(order_id, language, schema_version, revision desc);

create or replace function prevent_translation_brief_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'translation_briefs_are_immutable';
end;
$$;

drop trigger if exists translation_briefs_immutable on translation_briefs;
create trigger translation_briefs_immutable
before update or delete on translation_briefs
for each row execute function prevent_translation_brief_mutation();

alter table translation_briefs enable row level security;
drop policy if exists "Service role manages translation briefs" on translation_briefs;
create policy "Service role manages translation briefs" on translation_briefs
  for all using (auth.role() = 'service_role');

-- Atomically link an already-created order to its finalized temporary source.
-- The advisory lock and existence checks make Stripe webhook retries idempotent.
create or replace function link_hardened_source_to_order(
  p_order_id uuid,
  p_session_id uuid,
  p_briefs jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_upload temp_uploads%rowtype;
  v_brief jsonb;
  v_languages jsonb;
begin
  perform pg_advisory_xact_lock(hashtext(p_order_id::text));
  select languages into v_languages from orders where id = p_order_id for update;
  if v_languages is null then raise exception 'order_not_found'; end if;
  select * into v_upload from temp_uploads where session_id = p_session_id::text for update;
  if not found then
    if exists(select 1 from orders where id = p_order_id
      and source_linked_at is not null and source_upload_id = p_session_id) then return; end if;
    if exists(select 1 from orders where id = p_order_id and source_linked_at is not null) then
      raise exception 'order_already_linked_to_other_source';
    end if;
    raise exception 'source_upload_not_found';
  end if;
  if v_upload.source_storage_path is null or v_upload.source_storage_bucket <> 'booklingua-private-sources'
    or v_upload.source_sha256 is null or v_upload.source_size_bytes <= 0 or v_upload.source_manifest is null then
    raise exception 'source_upload_incomplete';
  end if;
  if v_upload.glossary_saved_at is null then raise exception 'translation_brief_not_approved'; end if;
  if v_upload.source_manifest->>'sourceHash' <> v_upload.source_sha256 then raise exception 'source_manifest_hash_mismatch'; end if;
  if (select file_format from orders where id = p_order_id) <> v_upload.file_format then raise exception 'source_format_mismatch'; end if;
  if jsonb_typeof(p_briefs) <> 'array'
    or jsonb_typeof(v_languages) <> 'array'
    or jsonb_array_length(p_briefs) <> jsonb_array_length(v_languages)
    or (select count(distinct value->>'language') from jsonb_array_elements(p_briefs)) <> jsonb_array_length(v_languages)
    or exists(select 1 from jsonb_array_elements_text(v_languages) language where not exists(
      select 1 from jsonb_array_elements(p_briefs) b where b->>'language' = language
    )) then raise exception 'translation_brief_language_set_mismatch'; end if;

  if not exists(select 1 from files where order_id = p_order_id and type = 'original') then
    insert into files(order_id, type, language, content, file_url, original_content)
    values (p_order_id, 'original', 'en', v_upload.content, v_upload.source_storage_path,
      jsonb_build_object('filename', v_upload.file_name, 'format', v_upload.file_format,
        'sha256', v_upload.source_sha256, 'sizeBytes', v_upload.source_size_bytes,
        'storageBucket', v_upload.source_storage_bucket)::text);
  end if;
  if not exists(select 1 from files where order_id = p_order_id and type = 'source_manifest') then
    insert into files(order_id, type, language, content)
    values (p_order_id, 'source_manifest', 'en', v_upload.source_manifest::text);
  end if;
  if v_upload.glossary_decisions is not null and not exists(select 1 from files where order_id = p_order_id and type = 'glossary') then
    insert into files(order_id, type, language, content) values(p_order_id, 'glossary', 'en', v_upload.glossary_decisions::text);
  end if;
  if v_upload.cultural_terms is not null and not exists(select 1 from files where order_id = p_order_id and type = 'cultural_terms') then
    insert into files(order_id, type, language, content) values(p_order_id, 'cultural_terms', 'en', v_upload.cultural_terms::text);
  end if;

  for v_brief in select value from jsonb_array_elements(p_briefs)
  loop
    if v_brief->>'source_manifest_fingerprint' <> v_upload.source_sha256
      or v_brief->>'schema_version' <> '1.0'
      or coalesce((v_brief->>'revision')::integer, 0) <> 1
      or v_brief->>'approval_source' <> 'author_scan'
      or v_brief->>'content_fingerprint' !~ '^[0-9a-f]{64}$'
      or v_brief->>'approved_at' is null
      or (v_brief->>'approved_at')::timestamptz <> v_upload.glossary_saved_at
      or v_brief->'brief'->>'language' <> v_brief->>'language'
      or v_brief->'brief'->>'sourceManifestFingerprint' <> v_upload.source_sha256
      or v_brief->'brief'->>'approvedAt' is null
      or v_brief->'brief'->>'schemaVersion' <> '1.0'
      or (v_brief->'brief'->>'revision')::integer <> 1
      or v_brief->'brief'->>'approvalSource' <> 'author_scan'
      then raise exception 'translation_brief_binding_invalid'; end if;
    insert into translation_briefs(
      order_id, language, schema_version, revision, source_manifest_fingerprint,
      content_fingerprint, approved_at, approval_source, brief
    ) values (
      p_order_id, v_brief->>'language', v_brief->>'schema_version',
      (v_brief->>'revision')::integer, v_brief->>'source_manifest_fingerprint',
      v_brief->>'content_fingerprint', (v_brief->>'approved_at')::timestamptz,
      v_brief->>'approval_source', v_brief->'brief'
    ) on conflict (order_id, language, content_fingerprint) do nothing;
  end loop;

  update orders set source_linked_at = coalesce(source_linked_at, now()), source_upload_id = coalesce(source_upload_id, p_session_id)
  where id = p_order_id and (source_upload_id is null or source_upload_id = p_session_id);
  if not found then raise exception 'order_already_linked_to_other_source'; end if;
  delete from temp_uploads where session_id = p_session_id::text;
end;
$$;

revoke all on function link_hardened_source_to_order(uuid, uuid, jsonb) from public;
grant execute on function link_hardened_source_to_order(uuid, uuid, jsonb) to service_role;
