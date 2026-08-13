# BookLingua Production-readiness Review

## OVERALL VERDICT: READY WITH REQUIRED FIXES

The hardening branch is suitable for independent review and, after the listed code fixes and hosted SQL reconciliation, a controlled **flags-OFF** rollout. It is not safe to enable semantic-v2 for a production canary or real order yet. No production mutation, migration, deployment, flag change, customer-data inspection, or email occurred during this review.

## 1. Independent code-review findings

Reviewed commit `596f9717` and the complete diff from production baseline `040dfa034b836af9fe6a935163d3570793bd0c7a`.

### Verified strengths

- Stable semantic IDs originate from source structure; model output must return the exact ID set and order, non-empty text, schema version, and source fingerprint.
- Pass 2 consumes Pass 1 nodes and the same authoritative persisted brief revision.
- Cache identity separates order, language, pass, pipeline version, schema and structure fingerprint; legacy and semantic rows cannot collide after migration.
- Current build allocation is transactionally serialized per order/language. Stale builds cannot gate, approve, or download.
- Artifacts bind order/language/build/type, validation report, private storage path, hash and byte size. Hardened download re-hashes exact stored bytes.
- Package gate recomputes authority from persisted rows and requires every purchased language/current build.
- Legacy-v1 and semantic-v2 require separate default-off environment capability plus explicit `orders.pipeline_version='semantic-v2'`.
- Completed-build retry now returns the immutable persisted PASS package rather than regenerating nondeterministic DOCX ZIP bytes.

### Fix made during this review

The download route permitted hardened `ready_for_review` downloads before approval and rejected the post-approval `delivery_pending` state. It now permits legacy `pending_review`, hardened `delivery_pending`, and `completed`; `ready_for_review` is rejected. Regression coverage was added.

## 2. Findings by severity

### BLOCKER

None for merging reviewed code or deploying it with all new flags OFF.

### HIGH — required before semantic-v2 production canary

1. **Entitled Launch Pack is not wired into the real semantic job.** `runSemanticPipeline` can validate/persist an optional supplied pack, but `translate-job.ts` never supplies one. Entitled orders correctly fail closed but cannot complete.
2. **Dual-format generation is incomplete.** Package rules require EPUB and DOCX for the entitlement, while the semantic pipeline generates only the source-format final. Dual-format orders correctly fail closed but cannot complete.
3. **External email is not provider-idempotent.** Provider success followed by DB finalization failure can resend delivery email. Hardened confirmation/admin emails have the same window. The installed Resend v3 client does not provide the required proven idempotency contract.
4. **Hosted catalog reconciliation is incomplete at SQL-catalog level.** Available production credentials exposed PostgREST schema and Storage configuration read-only, but not `supabase_migrations.schema_migrations`, `pg_policy`, `pg_constraint`, `pg_indexes`, extensions, or function definitions. Migration application must not proceed without an archived read-only SQL result for those objects.

### MEDIUM

- `pipeline_events.language` is NOT NULL while terminal failure recording may omit language; event persistence then logs and continues. Order failure state is still written, but observability can be lost.
- EPUB inline element structure is preserved, but translated words are proportionally redistributed across inline text slots rather than linguistically aligned to emphasis boundaries.
- Package manifests include `generatedAt`; immutable retry comparison is safe only because completed packages are now reused before regeneration.

## 3. Production schema reconciliation (read-only)

Target verified: `rtpoizdvgqwazizdqmyw.supabase.co`. Only metadata/configuration was requested; no customer table rows or storage objects were read.

Observed through PostgREST OpenAPI:

- Legacy tables present: `orders`, `files`, `temp_uploads`, `translation_chunks`, `email_subscribers`.
- Hardening tables absent, as expected before deployment: `pipeline_events`, `validation_reports`, `artifacts`, `package_manifests`, `order_language_builds`, `delivery_events`, `translation_briefs`, `semantic_documents`.
- Hardening RPCs absent. Existing exposed RPCs were `cleanup_temp_uploads` and `rls_auto_enable`.
- `orders` lacks hardening columns including `pipeline_version`, source linkage, failure/delivery state.
- `temp_uploads` lacks authoritative source binary fields.
- `translation_chunks` lacks version/schema/fingerprint columns.

This confirms production has not received WB1/WB2 schema. It does not prove the internal migration ledger or catalog constraints.

## 4. Migration compatibility verdict

The new migrations are additive and rebuilt cleanly in disposable Supabase. Production surface evidence supports the expected prerequisites: existing base tables and `orders.languages` are present. However, the following must be proven by read-only SQL before migration:

- `orders.languages` is JSONB; `orders.qa_errors` exists.
- Existing `translation_chunks` unique constraint/index has the expected identity/name or an approved reconciliation is prepared.
- `pgcrypto`/`extensions.digest` capability exists.
- No conflicting table, function, trigger, constraint, index, policy or bucket object exists outside the PostgREST schema cache.
- Hosted migration ledger treatment for duplicate historical `20250630` is explicitly archived without rewriting applied history.

Verdict: **compatible in staging; production migration approval pending catalog/ledger reconciliation**.

## 5. RLS and Storage reconciliation

Production Storage metadata shows one bucket, `uploads`, with `public=false`. The two hardened private buckets do not yet exist, as expected. No object content was accessed.

PostgREST/service-role metadata does not expose policy definitions. Therefore current `pg_policy` state and Storage policies remain unverified. Before migration, archive existing policy definitions; after migration, verify both hardened buckets are private and only the intended service-role policies apply. Do not conduct cross-customer object tests in production.

## 6. Email-idempotency verdict

**Production-blocking for enabling external hardened delivery.** A durable logical `delivery_events.event_key` prevents duplicate logical events but does not prevent duplicate provider sends when provider acceptance succeeds and DB `sent` finalization fails.

Smallest safe remediation proposal:

1. Keep `HARDENED_EXTERNAL_DELIVERY` default OFF.
2. Add a separate default-off flag for hardened checkout confirmation/admin sends, or keep canary orders on a local/captured adapter.
3. Upgrade to a provider/SDK contract with a documented idempotency key and use deterministic event keys for every email, then test provider-success/DB-failure retries.
4. If provider idempotency cannot be proven, implement a reviewed transactional outbox/leased sender; do not claim exactly-once delivery.

## 7. Legacy/v2 isolation verdict

**PASS with flags OFF.** Missing variables do not activate hardening, semantic-v2, or external delivery. Existing orders default to legacy-v1 and are not backfilled. Keep every existing/in-progress order on legacy permanently unless an explicit separately reviewed migration is designed.

## 8. Exact migration/deployment sequence

1. Take and verify a Supabase database backup/PITR restore point; inventory Storage buckets/policies.
2. Run and archive read-only hosted catalog queries for migration ledger, prerequisites, extensions, constraints, indexes, functions, triggers and policies.
3. Resolve the four HIGH items or formally exclude unsupported entitlements from canary selection; email sends must remain disabled.
4. Re-run tests/build and disposable reset from the exact release SHA.
5. Merge only after independent review approval.
6. Apply production incremental migrations in order: `202608120001` source, `202608120002` state, `202608120003` briefs, `202608120004` cache, `202608120005` semantic. Never apply the disposable baseline or rewrite legacy migration IDs.
7. After each migration, run read-only capability assertions and stop on any divergence.
8. Deploy application with `PIPELINE_HARDENING_V1`, `PIPELINE_VERSION`, and `HARDENED_EXTERNAL_DELIVERY` unset/OFF.
9. Smoke-test legacy public/admin paths without mutating a customer order.
10. Run a synthetic production canary only after the pre-canary gates below pass.

## 9. Synthetic production-canary plan

- Use a new synthetic author, tiny synthetic manuscript, one supported language, no Launch Pack/dual-format, and a zero-charge/internal Stripe-safe workflow approved for production testing.
- First enable hardening/semantic only in a genuinely order-scoped canary mechanism. Current environment flags are deployment-wide; if per-order routing cannot be guaranteed, do not enable in production.
- Keep external email disabled. Route any rendering inspection to a non-external capture path.
- Verify source hash/linkage, brief, Pass 1/2 identities, current build, all artifacts, manifest, gate, human approval, delivery-pending state and authorised download.
- Delete nothing afterward; retain synthetic audit records clearly labelled.

## 10. Monitoring and rollback

Monitor: error rate, webhook retries, duplicate events, provider/model failures, source/brief hash failures, stale-build rejection, artifact validation, gate status by language, approval failures, download integrity failures, Storage errors, latency and model cost.

Rollback triggers: any customer-data exposure, legacy regression, duplicate external side effect, unexpected production schema drift, stale build becoming current, false PASS, invalid download, material error spike, or abnormal model cost.

Rollback procedure: immediately disable semantic/hardening/external-delivery flags; stop new canary routing and Inngest canary events; preserve additive schema and evidence; do not down-migrate immutable data; verify legacy orders still run; diagnose before another attempt. Restore from backup only for demonstrated destructive schema/data damage.

## 11. Pre-deploy checklist

- [ ] Independent diff review approved
- [ ] Launch Pack and dual-format integration fixed/tested or excluded by enforced canary eligibility
- [ ] Email idempotency resolved or every external hardened send disabled
- [ ] Hosted ledger/catalog/policy/extension report archived
- [ ] Backup/PITR and restore procedure verified
- [ ] Exact release SHA tests, typecheck, build, migration verifier and disposable reset pass
- [ ] All flags confirmed OFF in production configuration
- [ ] Rollback owner, commands, monitoring and stop authority assigned

## 12. Post-deploy checklist (flags OFF)

- [ ] App health and legacy checkout/upload/webhook/admin/download smoke checks pass
- [ ] No legacy order queried hardening-only state
- [ ] Migration tables/RPCs/indexes/constraints/triggers exist as expected
- [ ] Hardened buckets private; intended policies only
- [ ] No unexpected logs, events, email, Inngest job or model call
- [ ] Snapshot monitoring baseline recorded before canary

## 13. Safety decisions

- Safe to merge: **YES AFTER REQUIRED CODE FIXES AND INDEPENDENT APPROVAL**
- Safe to apply production migrations: **NO — hosted catalog/ledger reconciliation required**
- Safe to deploy with flags OFF: **YES AFTER fixes, reconciliation, backup and review**
- Safe to run synthetic production canary: **NO — needs order-scoped activation and HIGH items addressed/excluded**
- Safe to enable first new real order: **NO**
- Safe to fully enable: **NO**

## 14. Final validation

Recorded after the review commit: `npm test`, `npx tsc --noEmit`, `npm run build`, `npm run verify:migrations`, and `git diff --check`.
