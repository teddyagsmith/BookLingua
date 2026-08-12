-- Pipeline hardening v2: retain immutable source-binary metadata before checkout.
-- DO NOT apply automatically. Apply before deploying code that writes these fields.

alter table temp_uploads
  add column if not exists source_storage_path text,
  add column if not exists source_storage_bucket text,
  add column if not exists source_sha256 text,
  add column if not exists source_size_bytes bigint,
  add column if not exists source_manifest jsonb;

alter table orders
  add column if not exists source_linked_at timestamptz,
  add column if not exists source_upload_id uuid unique,
  add column if not exists webhook_completed_at timestamptz,
  add column if not exists confirmation_sent_at timestamptz,
  add column if not exists admin_notification_sent_at timestamptz,
  add column if not exists translation_requested_at timestamptz;

comment on column temp_uploads.source_storage_path is
  'Private Supabase Storage path for the exact uploaded source binary.';

insert into storage.buckets(id, name, public)
values ('booklingua-private-sources', 'booklingua-private-sources', false),
       ('booklingua-private-artifacts', 'booklingua-private-artifacts', false)
on conflict (id) do update set public = false;

drop policy if exists "Service role manages hardened source objects" on storage.objects;
create policy "Service role manages hardened source objects" on storage.objects
  for all to service_role using (bucket_id = 'booklingua-private-sources')
  with check (bucket_id = 'booklingua-private-sources');
drop policy if exists "Service role manages hardened artifact objects" on storage.objects;
create policy "Service role manages hardened artifact objects" on storage.objects
  for all to service_role using (bucket_id = 'booklingua-private-artifacts')
  with check (bucket_id = 'booklingua-private-artifacts');
comment on column temp_uploads.source_sha256 is
  'SHA-256 digest of the exact uploaded source binary.';
comment on column temp_uploads.source_manifest is
  'Versioned pre-translation source manifest for new pipeline runs.';
