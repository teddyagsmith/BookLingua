# Work Block 1 Remediation Report

## Executive summary

This remediation keeps the legacy production path as the default and places all hardened-schema behavior behind `PIPELINE_HARDENING_V1=enabled`. Semantic-v2 remains disabled and is not called by the production job. The work repairs the most dangerous gate, artifact identity, download, upload identity, cache identity, brief immutability, status and validator-foundation defects found by the independent review.

The remediation is not represented as production-ready. Source/order creation is still not one database transaction, the validators remain a structural foundation rather than semantic proof, and no hardened package generation is wired into the live translation job.

## Independent-review findings 1–19

1. **FIXED** — `resolve_order_package_gate()` locks the order, evaluates every purchased language and performs one idempotent order-wide transition. Application code no longer writes the order status sequentially.
2. **FIXED** — build IDs bind reports, artifacts and manifests. Artifact validation state is persisted. Hardened downloads resolve a PASS manifest's exact artifact, require the matching report to pass, and verify byte length and SHA-256 before serving.
3. **FIXED (WB1 foundation)** — EPUB validation reads container/OPF/manifest/spine and separates nav/NCX. DOCX validation reconstructs paragraphs across runs and checks package structure. Realistic package fixtures now include navigation and relationships.
4. **FIXED** — admin and approval explicitly support both legacy `pending_review` and hardened `ready_for_review`. Hardened approval reassembles every language package from authoritative rows and fails closed.
5. **FIXED** — upload returns failure when storage or temp persistence fails and attempts safe orphan cleanup.
6. **FIXED** — the server issues a signed UUID upload identity, finalized paths do not overwrite, size/type limits are enforced, scan/save/checkout/webhook validate ownership, and translation verifies stored source bytes against SHA-256.
7. **PARTIALLY FIXED** — source/manifest/brief/temp cleanup is one locked, idempotent RPC transaction and webhook retries resume incomplete linkage. Stripe session uniqueness prevents duplicate orders. Order creation itself remains outside the linkage RPC, so a failed free-order or paid-order linkage can temporarily leave a pending order requiring webhook retry/admin visibility.
8. **FIXED** — briefs are append-only revisions protected by an update/delete trigger, carry content/source fingerprints and approval provenance, and are checked before both passes. No synthetic approval timestamp is generated.
9. **FIXED** — cache rows have a versioned unique identity; legacy reads/writes specify legacy identity only when the hardened schema capability is enabled. The disabled semantic contract has a distinct identity.
10. **PARTIALLY FIXED** — structural false negatives addressed include split DOCX runs, split markers/markdown, empty chapter bodies, Roman/Arabic identity normalization, package structure and obvious near-duplicates. Sophisticated prose similarity and semantic chapter inference remain intentionally deferred.
11. **FIXED IN CODE/MIGRATION, NOT APPLIED** — hardened sources/artifacts use new explicitly private buckets with service-role-only object policies. Hardened downloads use server-authenticated retrieval, not public URLs. Policies require staging verification.
12. **FIXED** — hardened schema reads/writes default off. Additive-schema-first rollout and flag/rollback order are documented. Legacy translations do not query the brief table when the capability is disabled. The historical `qa_errors` migration remains explicitly required.
13. **PARTIALLY FIXED** — terminal writes are idempotent, failures are thrown rather than silently swallowed, blocked states are visible in admin stats, and persisted summaries use allow-listed codes rather than raw model/manuscript excerpts. A durable external alert/outbox remains outside this block.
14. **FIXED** — source manifest v1 declares `structureAuthority: advisory`; zero/missing headings are not promoted to canonical proof.
15. **DEFERRED TO WB2** — semantic review/Pass 1 builders and notes integration were explicitly out of this remediation scope.
16. **FIXED** — manifests are assembled from authoritative order entitlement, artifact and validation-report rows for one order/language/build. Exactly one qualifying artifact per required type is required.
17. **DEFERRED TO WB2** — incomplete chapter-map, Launch Pack, notes, upload-guide and canonical-email generation remains unwired. The hardening capability is disabled by default and no live-completeness claim is made.
18. **FIXED WHERE LOW-RISK** — build identity, status checks, immutable history, lookup indexes and uniqueness constraints were added. Free-form stage names remain to avoid an incompatible enum rollout.
19. **DEFERRED TO WB2** — deeper semantic-v2 parser/output validation remains disabled and out of scope; cache separation prerequisite is complete.

## Schema changes — none applied

Modified unapplied migrations:

1. `20260812_pipeline_hardening_source.sql`
   - source bucket metadata and `orders.source_linked_at`
   - private source/artifact buckets and service-role policies
2. `20260812_pipeline_hardening_state.sql`
   - build-bound validation/artifact/package rows
   - authoritative validation status and lookup indexes
   - transactional all-language `resolve_order_package_gate()` RPC
3. `20260812_pipeline_hardening_briefs.sql`
   - immutable revisioned briefs with content fingerprint/provenance
   - `link_hardened_source_to_order()` transactional/idempotent RPC
4. `20260812_pipeline_hardening_cache.sql`
   - version/schema/structure cache identity and unique constraint

No migration was applied.

## Behavioral compatibility

- **Legacy orders:** `PIPELINE_HARDENING_V1` is unset by default. Legacy cache queries, dynamic downloads, `pending_review`, glossary storage and approval remain available. Existing completed orders are not forced through package manifests.
- **Hardened orders:** require the explicit flag, migrated schema, signed upload identity, linked source hash, approved immutable language briefs, build-bound artifacts/reports/manifests and an all-language PASS before `ready_for_review`.
- **Deployment order:** verify/apply additive migrations in staging first; deploy code with the flag unset; enable only in controlled staging. Never enable the flag before schema and private-bucket policy verification.
- **Rollback:** disable `PIPELINE_HARDENING_V1`; leave additive tables/columns in place. Existing legacy orders remain unaffected.

## Remaining risks

- Order creation and source linkage are not a single transaction; linkage is transactional and retryable, but an incomplete pending order can exist between operations.
- Hardened artifact/package generation is still not wired into `translate-job.ts`; the default-disabled path is groundwork only.
- Validator v1.1 is structural. It does not make semantic judgements, handle every custom DOCX style, or prove literary completeness.
- Private storage policies and SQL RPC behavior have not been executed against a staging Supabase project.
- The tests use local fakes/static migration assertions rather than a real Supabase/Postgres/Inngest environment.
- Canonical customer package/email generation and real failure alerts remain unwired by design.

## Validation results

- `npm test`: 28 passed, 0 failed
- `npx tsc --noEmit`: passed
- `npm run build`: passed; existing Next.js warning about `serverExternalPackages` and stale Browserslist data remains
- `git diff --check 040dfa034b836af9fe6a935163d3570793bd0c7a..HEAD`: passed
- Full branch diff against production base inspected; no semantic-v2 activation or production package generation was introduced

## Safety confirmation

- Nothing deployed or merged
- No migrations applied
- No production/customer rows or files changed
- No customer translation rerun
- No real customer/admin email sent
- Semantic-v2 remains disabled

## Final self-assessment

**WB1 REMEDIATION INCOMPLETE — DO NOT REVIEW FOR STAGING**

The branch is ready for another code review of the remediation commits, but not for staging approval. The next decision should be whether to finish atomic order creation/linkage and add database-backed migration/RPC integration tests within WB1 before a formal staging-readiness review.
