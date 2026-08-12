-- Semantic-v2 cache identity. DO NOT apply automatically.
-- Existing rows remain legacy-v1 and are not invalidated by this migration.

alter table translation_chunks
  add column if not exists pipeline_version text not null default 'legacy-v1',
  add column if not exists schema_version text,
  add column if not exists structure_fingerprint text;

create index if not exists translation_chunks_versioned_lookup_idx
  on translation_chunks(order_id, lang_code, pass, pipeline_version, structure_fingerprint, chunk_index);
