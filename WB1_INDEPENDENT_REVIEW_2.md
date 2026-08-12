# BookLingua WB1 Independent Review 2

## Executive verdict

- Work Block 1: **PASS WITH REQUIRED FIXES**
- Safe for staging rehearsal: **YES AFTER LISTED FIXES**
- Merge: **NOT READY FOR MERGE**
- Work Block 2: **WAIT**

The disabled hardened-v1 foundation is materially safer after direct code review and four additional remediation commits. The known application-level gate, artifact, approval, upload, brief, cache, and validator defects found locally were fixed and covered by regression tests. It is not production-ready: the PostgreSQL RPC, constraints, RLS and storage policies have not been executed in a disposable/staging Supabase project; exact-once email delivery is not guaranteed across a provider-success/database-failure boundary; and hardened artifact generation remains deliberately unwired.

## Original findings 1–19

### 1. Order-wide package gate — VERIFIED FIXED

Evidence: `resolve_order_package_gate()` locks the order, derives the authoritative purchased language array, selects exactly the latest immutable package per language, rejects empty/duplicate language arrays, and transitions once per order. Individual callers cannot set the order status. Tests cover missing/failed/duplicate package behavior; PostgreSQL lock/concurrency semantics require staging verification.

### 2. Artifact/download binding — VERIFIED FIXED

Evidence: artifacts, validation reports and manifests share order/language/build identities; composite foreign keys prevent cross-build report binding; histories are immutable; download resolves the exact artifact ID referenced by the latest PASS manifest and verifies bucket/path, ownership, validation state, byte length and SHA-256. Tests cover stale build, wrong order/language, failed validation, ambiguous artifacts, metadata mismatch and byte tampering.

### 3. EPUB/DOCX structural validation — VERIFIED FIXED for WB1 foundation

Evidence: EPUB validation follows container → OPF → manifest → spine, resolves nested paths, treats nav/NCX separately, compares navigation sequence, and rejects missing/empty spine content. DOCX validation checks content types, package relationship, document relationships, paragraphs/styles and split runs. Tests use namespaced/nested EPUB and relationship-bearing DOCX fixtures. Remaining custom/localized heading inference and semantic similarity are WB2 concerns.

### 4. `ready_for_review` lifecycle — VERIFIED FIXED

Evidence: admin lists both review states; approval supports legacy `pending_review` and hardened `ready_for_review`; hardened approval reassembles every language package, then calls `begin_hardened_delivery()` which locks and rechecks the order before `delivery_pending`. Package/artifact inserts are blocked after delivery begins; `completed_at` is written only after email success.

### 5. Upload fail-closed — VERIFIED FIXED

Evidence: storage must succeed before metadata; metadata failure removes the orphan object; hardened checkout requires the authoritative private source record, manifest/hash, positive size/word count and saved approval. Invalid ZIP-based sources are rejected before storage.

### 6. Server-owned upload identity — VERIFIED FIXED with residual LOW risk

Evidence: the server issues a random UUID plus HMAC token; hardened scan/save/checkout/webhook verify it; paths are server-derived; storage does not upsert; supported type and 50 MB limits are enforced; translation rechecks source SHA-256. Tokens do not expire, but their entropy, signature, one-time temp-row finalization and non-overwrite storage semantics prevent practical guessing/replacement. Expiry can be added later without blocking WB1 staging.

### 7. Transactional/idempotent linkage — PARTIALLY FIXED

Evidence: `link_hardened_source_to_order()` locks the order and atomically links source, manifest, briefs, glossary/decisions, source identity and temp cleanup. Stripe session uniqueness and resumable webhook stage timestamps make retries recoverable; Inngest uses a stable event ID. Remaining risk: order creation is outside the linkage RPC, and provider email success followed by timestamp-write failure can duplicate an email on retry. This must be exercised and operationally accepted/fixed before production, but no longer permits translation without linked source.

### 8. Immutable translation briefs — VERIFIED FIXED

Evidence: append-only revisions have immutable triggers, unique revision/content identities, source/language/approval bindings and persisted fingerprints. The linkage RPC requires the exact purchased language set and real scan approval. Pass 1 and Pass 2 load the same persisted revision and validate it before use. The cache fingerprint includes brief content.

### 9. Cache isolation — VERIFIED FIXED

Evidence: the cache unique identity includes pipeline version, schema version and structure/brief fingerprint; every hardened read/write supplies them; existing rows default to `legacy-v1`. Semantic-v2 remains disabled.

### 10. Validator false negatives — VERIFIED FIXED for WB1 foundation

Evidence: split-run markers/markdown, empty recognized chapters, duplicate Roman/Arabic chapter identities, malformed relationships/spines and obvious substantial duplication are covered. Semantic/localized heading judgment remains explicitly outside WB1.

### 11. Storage privacy — PARTIALLY FIXED

Evidence: migrations create private source/artifact buckets and service-role-only object policies; hardened application code uses no public URL and downloads through authenticated server routes. Actual Supabase bucket/policy state is unverified until staging migrations run.

### 12. Deployment-order coupling — VERIFIED FIXED

Evidence: `PIPELINE_HARDENING_V1` activates only for the exact value `enabled`; default/unset preserves legacy reads and writes. New hardened schema paths are capability-gated. Migrations are additive and documented schema-first. Legacy approval still has its pre-existing `qa_errors` dependency, which must be verified in staging schema inventory.

### 13. Failure durability — PARTIALLY FIXED

Evidence: terminal failure state is idempotent, sanitized and visible in admin/stats. Persistence failures are surfaced for retry. A durable external alert/outbox is still absent and remains out of WB1 scope.

### 14. Source manifest claims — VERIFIED FIXED

Evidence: v1 structure fields are advisory and confidence-labelled; TXT and weak DOCX/EPUB inference are not treated as canonical proof.

### 15. Customer package wiring — DEFERRED TO WB2

The assets/contracts remain explicitly non-production and are not wired into the live job.

### 16. Package manifest authority — VERIFIED FIXED

Evidence: manifests are assembled from persisted order entitlements, artifact rows and authoritative passed validation relations. Exactly one qualifying artifact per required type/build is required. Caller metadata cannot manufacture PASS.

### 17. Incomplete customer assets — DEFERRED TO WB2

Chapter map, guide, Launch Pack, notes and canonical email groundwork remain disabled/unwired as required.

### 18. Migration domains/history — VERIFIED FIXED for WB1

Evidence: domain checks, immutable history triggers, build IDs, composite uniqueness/FKs, timestamps and lookup indexes were added. Low-risk additional enum normalization can wait until staging feedback.

### 19. Deeper semantic-v2 validation — DEFERRED TO WB2

Semantic-v2 is disabled. Only the cache-isolation prerequisite was completed.

## New findings and remediation

### HIGH — Hardened pre-deploy sessions were rejected on the legacy path — FIXED

- Path: checkout, webhook, scan and glossary routes.
- Scenario: application deployed with flag OFF while a customer held a legacy session without a signed upload token.
- Fix: token enforcement is strictly capability-gated; absent flag preserves production behavior.

### HIGH — Failed validation relation could be interpreted as PASS — FIXED

- Path: `lib/package-manifest.ts`.
- Scenario: Supabase returned a one-to-one relation as an array; truthiness allowed a failed report to inherit the artifact row's PASS status.
- Fix: require exactly one relation whose `passed` value is strictly `true`.

### HIGH — Brief changes could reuse stale translation chunks — FIXED

- Path: `lib/translate-job.ts`.
- Scenario: all hardened legacy-v1 chunks used a constant structure fingerprint.
- Fix: both passes use the immutable brief content fingerprint in cache identity.

### HIGH — Approval/package mutation race — FIXED

- Path: state migration and approval route.
- Scenario: a manifest could change after application revalidation but before/during delivery.
- Fix: atomic `begin_hardened_delivery()`, order lock, delivery state, and insert guards freeze package history during delivery.

### HIGH — Scanner failure could become an approved empty brief — FIXED

- Path: `app/page.tsx`.
- Scenario: a failed free scan advanced checkout; empty decisions were saved as if reviewed.
- Fix: hardened uploads record scan completion and cannot continue after scan failure.

### HIGH — Checkout trusted client source attributes — FIXED

- Path: checkout route and `lib/hardened-upload.ts`.
- Scenario: client could alter format/word count or proceed after source/brief loss.
- Fix: checkout loads and validates authoritative temp metadata, uses its format/word count, and rejects malformed/duplicate language sets.

### HIGH — Missing source on webhook did not stop processing — FIXED

- Path: webhook route.
- Scenario: paid order continued to emails/translation after temp source was unavailable.
- Fix: hardened webhook fails closed, resumes from recorded stages, and uses stable Inngest event identity.

### MEDIUM — External email exactly-once boundary — REQUIRED FIX BEFORE PRODUCTION

- Path: webhook and approval email sends.
- Scenario: provider accepts an email, then database timestamp/update fails; retry may send a duplicate.
- Required: use provider-supported idempotency keys or a transactional outbox with stable message identity. WB1 staging may proceed with synthetic inboxes, but production enablement must wait.

## Changes made overnight

- `483b39f8` — authoritative build/report/artifact/manifest identities; atomic delivery lifecycle; hardened download verification.
- `d706b7d4` — namespace/path-aware EPUB validation and structural DOCX validation with realistic fixtures.
- `fcb9acae` — hardened upload/scan/brief/cache/linkage boundaries and advisory source integrity checks.
- `d96e6d39` — fail-closed checkout/webhook linkage and resumable external processing stages.

## Schema changes (not applied)

- `20260812_pipeline_hardening_source.sql` — private buckets/policies, source identity, webhook stage timestamps.
- `20260812_pipeline_hardening_state.sql` — composite build identities/FKs, immutable histories, delivery guards, atomic gate/delivery RPCs.
- `20260812_pipeline_hardening_briefs.sql` — immutable approved briefs and atomic source/decision linkage validation.
- `20260812_pipeline_hardening_cache.sql` — versioned cache identity and legacy coexistence.

No migration was applied.

## Test results

- Starting tests: 28.
- Ending tests: 36.
- Remediation failures encountered: TypeScript initially rejected local AdmZip test typings and ES target iteration; corrected without weakening checks.
- Final `npm test`: **36 passed, 0 failed**.
- Final `npx tsc --noEmit`: **PASS**.
- Final `npm run build`: **PASS**. Existing warnings remain for `serverExternalPackages` on Next 14.2 and stale Browserslist data.
- Final `git diff --check 040dfa...HEAD`: **PASS**.
- Pre-existing untracked/manual files were not added or modified.

Unit tests do not prove PostgreSQL transaction, lock, RLS or storage-policy behavior. Those claims require the staging rehearsal below.

## Staging prerequisites

1. Independently review these four commits and all four migrations.
2. Use a disposable/staging Supabase project with a backup/reset plan; never production.
3. Keep `PIPELINE_HARDENING_V1` unset and apply migrations in order: source → state → briefs → cache.
4. Verify functions, grants, RLS, private buckets and service-role-only policies directly in PostgreSQL/Supabase.
5. Exercise concurrent `resolve_order_package_gate()` calls for two languages and prove missing/failed/duplicate manifests cannot yield readiness.
6. Verify immutable triggers and composite report/artifact/build FKs with adversarial SQL.
7. Confirm legacy synthetic orders work with no source manifest or brief while the flag remains OFF.
8. Enable the flag only in staging and create new synthetic EPUB, DOCX and TXT orders, including multi-language and failed-source cases.
9. Validate source hash mismatch, webhook retry/partial failure, brief immutability and cache coexistence.
10. Build synthetic stored artifacts; test failed/stale/tampered/cross-order downloads and approval after package mutation.
11. Verify `ready_for_review`, `delivery_pending`, completed timestamps and legacy `pending_review` approval.
12. Use non-customer test inboxes to observe retry duplicates; decide/implement email idempotency before production activation.
13. Roll back application flag first (unset); additive schema can remain. Do not attempt destructive migration rollback during rehearsal.

## Remaining risks

- SQL/RPC concurrency and policy behavior are code-reviewed but not database-executed.
- Email sends are not exactly-once across provider/database failures.
- Paid order creation remains outside the linkage RPC, though retries are recoverable and translation cannot start without linkage.
- Hardened package generation is not wired; this branch is foundation only.
- Semantic-v2 and customer package assets remain disabled.

## Exact next action

Obtain an independent review of commits `483b39f8..d96e6d39`. If accepted, perform the ordered rehearsal in a disposable staging Supabase project with the feature flag OFF during migration and only synthetic data. Do not begin WB2, merge, or enable production until staging evidence and email-idempotency disposition are reviewed.
