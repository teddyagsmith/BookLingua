-- Pipeline hardening v2: immutable per-language translation briefs.
-- DO NOT apply automatically. Apply after the source and state migrations.

alter table temp_uploads
  add column if not exists glossary_saved_at timestamptz;

create table if not exists translation_briefs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  language text not null,
  schema_version text not null,
  source_manifest_fingerprint text not null,
  approved_at timestamptz not null,
  brief jsonb not null,
  created_at timestamptz not null default now(),
  unique(order_id, language, schema_version)
);

alter table translation_briefs enable row level security;
create policy "Service role manages translation briefs" on translation_briefs
  for all using (auth.role() = 'service_role');
