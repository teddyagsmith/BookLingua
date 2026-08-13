# Pipeline hardening migration order

These migrations are intentionally committed but not applied by this work block.

1. `202608120001_pipeline_hardening_source.sql`
2. `202608120002_pipeline_hardening_state.sql`
3. `202608120003_pipeline_hardening_briefs.sql`
4. `202608120004_pipeline_hardening_cache.sql`

These use distinct migration versions because Supabase records only the numeric
prefix. The earlier repository history contains duplicate version
`20250630`; do not rewrite that already-deployed history. Before production,
compare the live migration ledger and schema, mark/reconcile the historical
files explicitly, then apply these four new additive migrations in order.

This repository is not a from-zero schema source. In particular, the checked-in
migrations assume that `orders`, `files`, `temp_uploads`, `translation_chunks`,
and Supabase Storage already exist. A fresh `supabase db reset` therefore needs
an independently verified baseline schema snapshot; local shims are rehearsal
fixtures only and must never be deployed.

Release contract:

1. Keep `PIPELINE_HARDENING_V1` unset. The application remains on the legacy path and does not query/write the new schema.
2. Apply these additive migrations in the listed order in an isolated staging database and verify private bucket policies.
3. Deploy the backwards-compatible application while the flag remains unset.
4. Enable `PIPELINE_HARDENING_V1=enabled` only for a controlled staging environment and create new synthetic orders there.
5. Rollback is disabling the flag; do not remove the additive schema during rollback.

Existing orders remain on legacy behavior. No existing order is backfilled or inferred into the hardened path. The historical `20250630_add_qa_blocked.sql` migration remains required by the legacy approval route and must be verified separately before deployment.
