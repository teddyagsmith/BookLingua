-- Semantic-v2 cache identity. DO NOT apply automatically.
-- Existing rows remain legacy-v1 and are not invalidated by this migration.

alter table translation_chunks
  add column if not exists pipeline_version text not null default 'legacy-v1',
  add column if not exists schema_version text not null default '1.0',
  add column if not exists structure_fingerprint text not null default 'legacy';

create index if not exists translation_chunks_versioned_lookup_idx
  on translation_chunks(order_id, lang_code, pass, pipeline_version, structure_fingerprint, chunk_index);

-- Replace the legacy conflict identity so legacy and semantic rows can coexist.
alter table translation_chunks
  drop constraint if exists translation_chunks_order_id_lang_code_chunk_index_pass_key;
drop index if exists translation_chunks_order_id_lang_code_chunk_index_pass_key;
alter table translation_chunks
  drop constraint if exists translation_chunks_versioned_identity_key;
alter table translation_chunks
  add constraint translation_chunks_versioned_identity_key unique(
    order_id, lang_code, chunk_index, pass,
    pipeline_version, schema_version, structure_fingerprint
  );
