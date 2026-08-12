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

create trigger translation_briefs_immutable
before update or delete on translation_briefs
for each row execute function prevent_translation_brief_mutation();

alter table translation_briefs enable row level security;
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
begin
  perform pg_advisory_xact_lock(hashtext(p_order_id::text));
  select * into v_upload from temp_uploads where session_id = p_session_id::text for update;
  if not found then
    if exists(select 1 from orders where id = p_order_id and source_linked_at is not null) then return; end if;
    raise exception 'source_upload_not_found';
  end if;
  if v_upload.source_storage_path is null or v_upload.source_sha256 is null or v_upload.source_manifest is null then
    raise exception 'source_upload_incomplete';
  end if;
  if v_upload.glossary_saved_at is null then raise exception 'translation_brief_not_approved'; end if;

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

  for v_brief in select value from jsonb_array_elements(p_briefs)
  loop
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

  update orders set source_linked_at = coalesce(source_linked_at, now()) where id = p_order_id;
  delete from temp_uploads where session_id = p_session_id::text;
end;
$$;

revoke all on function link_hardened_source_to_order(uuid, uuid, jsonb) from public;
grant execute on function link_hardened_source_to_order(uuid, uuid, jsonb) to service_role;
