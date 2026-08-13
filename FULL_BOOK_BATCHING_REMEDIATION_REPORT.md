# Full-Book Semantic Batching Remediation Report

## Verdict

**READY FOR A FRESH CANARY** after a separately approved database migration and flags-isolated deployment. No production change was made during this remediation.

Reviewed range: `783b5e932a07a653252b294253b61203e9ebef43..HEAD`.

## Remediation

- Pass 1 and Pass 2 use deterministic whole-node batches bounded by expected output words (`semantic-batch-v1`, default 700 words), with at most four concurrent calls and ordered aggregation.
- Batch identity binds order, language, complete source fingerprint, pass, exact ordered node IDs, brief revision/fingerprint, model, schema and batching policy.
- Each batch validates exact IDs, uniqueness, order, source fingerprint and non-empty translations before versioned cache persistence. Retries invoke only missing identities; started calls drain before failure is surfaced.
- Aggregate validation requires the exact global ID set, order, chapter identity and source-chapter identity before semantic documents or artifacts proceed.
- Validated Launch Packs persist immediately with stable source/model/schema/template/entitlement identity and canonical content hash; whole-job retries reuse them.
- Immutable model telemetry records successful and failed calls, provider/model, order/language/stage/batch, attempt, stable request identity, provider request ID, tokens, cache status, error class, UTC timestamp and documented cost estimate.
- Terminal cleanup marks every current `building` language build `failed` and writes one deterministic durable failure audit event, idempotently.
- DOCX output metadata is normalized for byte-stable retries. EPUB reconstruction now mirrors parser selection for empty layout blocks and repacks data-descriptor source archives into readable EPUBs with `mimetype` first.

## Mandatory real-model staging proof

Disposable loopback Supabase order: `95000000-0000-0000-0000-000000000003`.

- Source: `Bride of the Hollow King` EPUB, SHA-256 `5049f9eec33d167c03d211fc9bdf8678e2c47bc32e529e5b480d8d23e0d731da`.
- Source nodes: 1,760.
- French Pass 1: 57 batches; Pass 2: 65 batches; both 1,760 unique ordered nodes.
- German Pass 1: 57 batches; Pass 2: 59 batches; both 1,760 unique ordered nodes.
- Real Sonnet 5: 239 attempts, 238 successful and one captured truncated-JSON failure; 525,270 input and 598,570 output tokens; estimated `$7.03624` using `anthropic-2026-08-13` pricing.
- Real Opus 5: two successful Launch Pack calls, one per language; 4,202 input and 13,697 output tokens; estimated `$0.363435`.
- Largest observed call: 2,864 input + 3,065 output tokens, below the configured 4,096 proof output limit.
- Real failure/retry: a French middle batch returned truncated JSON; the run failed closed, recorded usage, retained completed batches, and resumed only missing work.
- Launch Packs: exactly one persisted valid canonical pack for France/French and Germany/German; no replay on retry.
- Artifacts: 10 authoritative artifacts per language (20 total), including Pass 1, Review DOCX, final EPUB/DOCX, notes, chapter-map DOCX/CSV, upload guide, brief and Launch Pack. Every artifact passed validation and retained its hash on completed retry.
- Gate: French-only state remained `gate_failed`; both authoritative PASS packages produced `ready_for_review`.
- Internal review: mocked/intercepted send exactly once with stable idempotency; completed retry produced no duplicate event or email.
- Completed retry: zero new Sonnet/Opus calls and identical artifact hashes.
- Proof window: `2026-08-13T22:19:54.295Z`–`2026-08-13T22:42:55.026Z` for the resumed final process; earlier deliberately interrupted work is included in the immutable telemetry totals.

Evidence: `/Users/gilbert/BookLingua-Backups/20260813T184935Z/canary-remediation/full-book-staging-proof.json`

Evidence SHA-256: `40425c6158473ecfdab0ffbf25f4c600eb5a1c0011cba2699b41e2b1818a1347`

## Failure and regression proof

- Terminal cleanup was exercised before Pass 1, mid-Pass 1, between passes and during artifact assembly. Every current build became `failed`; repeated cleanup produced exactly one audit event per stage.
- Unit/regression suite: 70/70 PASS.
- TypeScript: PASS.
- Production build: PASS (known Next.js 14.2 `serverExternalPackages` warning only).
- Migration verifier: PASS — seven unique active migrations; original hosted manifest remains exactly eight steps; new batching manifest exactly three steps.
- `git diff --check`: PASS.
- Local migration/postconditions: PASS, including RLS, immutable triggers and service-role-only cleanup RPC.

## Exact future production procedure (not run)

1. Independently approve the final remote SHA and take/restore-rehearse a fresh production logical backup.
2. Confirm legacy/default `PIPELINE_VERSION`, `HARDENED_EXTERNAL_DELIVERY=OFF`, and no semantic canary IDs.
3. Run read-only catalog reconciliation and `supabase/deployment/production_batching_incremental_preconditions.sql`.
4. With Homebrew `libpq` on `PATH`, run only:

   `bash scripts/run-production-batching-incremental.sh "$BOOKLINGUA_PROD_DB_URL"`

5. Archive the log, independently rerun `production_batching_incremental_postconditions.sql`, and verify legacy postconditions.
6. Deploy the exact reviewed SHA with semantic-v2 globally OFF and external delivery OFF; run legacy smoke tests.
7. Prepare a brand-new synthetic canary UUID. Do not reuse either failed production canary.

`supabase db push` remains forbidden.

## Remaining findings

BLOCKER: none.

HIGH: none.

MEDIUM: none.

LOW/warning: the existing Next.js 14.2 unrecognized `serverExternalPackages` build warning remains unrelated to this remediation.
