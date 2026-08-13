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

The production migrations remain forward-only increments over the existing
hosted schema. Historical files with the already-deployed duplicate `20250630`
identity live in `supabase/legacy-history/` and are deliberately excluded from
normal `supabase db push`; their production ledger must not be rewritten.

Disposable staging and CI use the separate, explicit baseline at
`supabase/bootstrap/00000000000000_disposable_baseline.sql`. It is a capability
baseline, not a claim to reconstruct production history, and must never be
applied to hosted production. Run `npm run staging:reset` to build a clean local
stack entirely from committed assets. Run `npm run verify:migrations` in CI to
reject duplicate active versions or missing prerequisites.

Release contract:

1. Keep `PIPELINE_HARDENING_V1` unset. The application remains on the legacy path and does not query/write the new schema.
2. Apply these additive migrations in the listed order in an isolated staging database and verify private bucket policies.
3. Deploy the backwards-compatible application while the flag remains unset.
4. Enable `PIPELINE_HARDENING_V1=enabled` only for a controlled staging environment and create new synthetic orders there.
5. Rollback is disabling the flag; do not remove the additive schema during rollback.

Existing orders remain on legacy behavior. No existing order is backfilled or
inferred into the hardened path. Before production rollout, compare the hosted
ledger read-only with `supabase/legacy-history/`, verify the legacy
`qa_errors` capability, and record an approved reconciliation. That verification
is a production prerequisite, not permission to repair historical migration IDs.
