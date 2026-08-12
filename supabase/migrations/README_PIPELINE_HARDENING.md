# Pipeline hardening migration order

These migrations are intentionally committed but not applied by this work block.

1. `20260812_pipeline_hardening_source.sql`
2. `20260812_pipeline_hardening_state.sql`
3. `20260812_pipeline_hardening_briefs.sql`
4. `20260812_pipeline_hardening_cache.sql`

Deploy application code that writes the new columns/tables only after the migrations have been verified in a non-production environment and then applied to production. Existing orders remain on legacy behavior unless explicitly versioned into the hardened path.
