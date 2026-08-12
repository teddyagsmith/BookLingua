-- Pipeline hardening v2: retain immutable source-binary metadata before checkout.
-- DO NOT apply automatically. Apply before deploying code that writes these fields.

alter table temp_uploads
  add column if not exists source_storage_path text,
  add column if not exists source_sha256 text,
  add column if not exists source_size_bytes bigint,
  add column if not exists source_manifest jsonb;

comment on column temp_uploads.source_storage_path is
  'Private Supabase Storage path for the exact uploaded source binary.';
comment on column temp_uploads.source_sha256 is
  'SHA-256 digest of the exact uploaded source binary.';
comment on column temp_uploads.source_manifest is
  'Versioned pre-translation source manifest for new pipeline runs.';
