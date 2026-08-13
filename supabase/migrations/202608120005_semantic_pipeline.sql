-- WB2 semantic-v2 persistence. Additive and inactive unless explicitly selected.
alter table orders add column if not exists pipeline_version text not null default 'legacy-v1'
  check (pipeline_version in ('legacy-v1','semantic-v2'));
alter table orders add column if not exists semantic_structure_approved boolean not null default false;

create table if not exists semantic_documents (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  language text,
  build_id uuid,
  pass text not null check (pass in ('source','pass1','pass2')),
  schema_version text not null,
  source_hash text not null,
  structure_fingerprint text not null,
  eligibility text not null check (eligibility in ('eligible','review_required','unsupported')),
  document jsonb not null,
  created_at timestamptz not null default now(),
  check ((pass='source' and language is null and build_id is null) or (pass<>'source' and language is not null and build_id is not null)),
  unique(order_id, language, build_id, pass),
  foreign key(build_id, order_id, language) references order_language_builds(id, order_id, language)
);
create unique index if not exists semantic_documents_one_source_idx on semantic_documents(order_id) where pass='source';

create or replace function prevent_semantic_document_mutation()
returns trigger language plpgsql set search_path=public as $$ begin raise exception 'semantic_documents_are_immutable'; end $$;
drop trigger if exists semantic_documents_immutable on semantic_documents;
create trigger semantic_documents_immutable before update or delete on semantic_documents
for each row execute function prevent_semantic_document_mutation();
alter table semantic_documents enable row level security;
drop policy if exists "Service role manages semantic documents" on semantic_documents;
create policy "Service role manages semantic documents" on semantic_documents for all using (auth.role()='service_role');
create index if not exists semantic_documents_build_lookup_idx on semantic_documents(order_id,language,build_id,pass);
