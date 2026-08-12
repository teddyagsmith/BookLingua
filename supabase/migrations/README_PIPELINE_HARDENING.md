# Pipeline hardening migration order

These migrations are intentionally committed but not applied by this work block.

1. `20260812_pipeline_hardening_source.sql`
2. `20260812_pipeline_hardening_state.sql`
3. `20260812_pipeline_hardening_briefs.sql`
4. `20260812_pipeline_hardening_cache.sql`

Release contract:

1. Keep `PIPELINE_HARDENING_V1` unset. The application remains on the legacy path and does not query/write the new schema.
2. Apply these additive migrations in the listed order in an isolated staging database and verify private bucket policies.
3. Deploy the backwards-compatible application while the flag remains unset.
4. Enable `PIPELINE_HARDENING_V1=enabled` only for a controlled staging environment and create new synthetic orders there.
5. Rollback is disabling the flag; do not remove the additive schema during rollback.

Existing orders remain on legacy behavior. No existing order is backfilled or inferred into the hardened path. The historical `20250630_add_qa_blocked.sql` migration remains required by the legacy approval route and must be verified separately before deployment.
