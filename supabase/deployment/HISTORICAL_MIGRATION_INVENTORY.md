# Historical migration quarantine

Hosted production has no `supabase_migrations.schema_migrations` ledger. Normal
`supabase db push` is therefore forbidden. Only
`production_incremental_manifest.txt` is approved for a controlled migration.

## Already represented by hosted state; do not replay

- `20250416_add_welcome_sequence.sql`
- `20260401_email_subscribers.sql`
- `20260421_email_subscribers.sql`
- `20260805_temp_uploads_cultural_terms.sql`
- `20250630_add_pipeline_version.sql` (legacy-history identity only)
- `20250630_add_qa_blocked.sql` (superseded by the forward prerequisite)

The subscriber create-policy file is retained only as corrected clean-bootstrap
history. Its policy is explicitly scoped `TO service_role`; it is excluded from
hosted production.

## Not represented and not approved for this rollout

- `002_feedback_glossaries_preferences.sql` creates and seeds unrelated product
  tables.
- `20260403_temp_uploads_email.sql` adds a column absent from the supplied hosted
  catalog and unrelated to pipeline hardening.

## Approved production-only forward path

The eight entries in `production_incremental_manifest.txt`, in exact order.
They are additive hardening prerequisites, WB1/WB2 schema, and read-only
pre/postconditions. No historical file above is included.
