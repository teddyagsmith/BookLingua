# BookLingua Final HIGH-item Remediation

## OVERALL VERDICT: READY WITH REQUIRED FIXES

All four code HIGH items are resolved and the disposable staging matrix passes. Controlled flags-OFF deployment remains gated on hosted read-only SQL reconciliation, backup/rollback approval and independent review. Production was not mutated, migrated, deployed, enabled or emailed.

## 1. Launch Pack

The real semantic job now invokes the existing Launch Strategy generator for entitled orders, converts output through canonical schema v2, validates exact locale/market/Amazon domain/currency and required sections, then passes immutable JSON bytes into artifact validation/storage and the package manifest. Unsupported/wrong/malformed/missing packs fail closed. No pricing or substantive product rules changed.

Staging included a French entitled fixture; its validated package contained 10 artifacts (the normal eight plus Launch Pack and the second final format).

## 2. Dual format

Semantic-v2 now builds EPUB and DOCX independently from the same authoritative Pass 2 semantic document. EPUB sources preserve their package; DOCX/TXT sources use a deterministic semantic EPUB package builder. Both exact bytes receive independent validation reports, hashes and immutable artifact rows. Entitled package PASS requires both.

## 3. External email idempotency

Resend was upgraded from v3 to v6.19.0, whose email API supports native `Idempotency-Key`. Hardened confirmation, admin-order notification and customer delivery use stable logical keys derived from order/delivery-event identity. Provider-success followed by DB-finalization failure therefore retries the same provider request instead of creating a second send. Existing DB stage/event state remains the durable application ledger. External hardened delivery stays default OFF.

Permanent tests verify every hardened send site supplies the deterministic key. No real email was sent.

## 4. Order-scoped canary

`semanticV2AllowedForOrder` requires `orders.pipeline_version='semantic-v2'` and either the global semantic capability or explicit membership in `SEMANTIC_V2_CANARY_ORDER_IDS`. Thus the global semantic flag may remain OFF while exactly named synthetic orders enter v2. Legacy orders never qualify, and semantic cache identity remains version-separated. Nothing was enabled.

## 5. Complete staging rerun

- Clean Supabase rebuild solely from committed assets: PASS
- WB1 PostgreSQL matrix: 26/26 PASS
- Private Storage/RLS: prior real checks preserved; migrations unchanged
- EPUB/DOCX/TXT semantic packages: PASS (8 artifacts each)
- Launch Pack + dual-format DOCX-source package: PASS (10 artifacts)
- French/German multi-language gate/approval: PASS
- Real Anthropic EPUB and French/German Pass 1/2: PASS
- Retry/cache: PASS; completed retry made no additional model call
- Approval/download boundary: approved delivery-pending only; PASS
- Legacy compatibility: PASS

Real-model rerun: Claude Sonnet 4.5, 6 calls, 1,727 input tokens, 1,257 output tokens, estimated $0.024036. Synthetic data and local Supabase only.

## 6. Regression totals

- `npm test`: 50 PASS, 0 FAIL
- TypeScript: PASS
- Next.js build: PASS
- Migration verifier: 11 unique ordered active versions, PASS
- `git diff --check`: PASS

## 7. Hosted reconciliation

Prepared `supabase/deployment/production_readiness_catalog.sql`. It starts a read-only transaction, queries only catalog/migration/policy/bucket metadata, never application rows or object contents, and rolls back. Run it in the production Supabase SQL editor, download/archive results, and compare them with the five incremental migrations. Existing REST credentials cannot execute arbitrary catalog SQL, so the script was not run.

## 8. Remaining items

### BLOCKER/HIGH

None in code for a controlled flags-OFF rollout.

### Required before migrations/canary

- Archive and approve hosted catalog/ledger/RLS results.
- Verify backup/PITR, monitoring and rollback ownership.
- Independently review this commit and full hardening diff.
- Keep external delivery OFF during canary despite provider idempotency, then test through an approved captured address before customer use.

### MEDIUM

- EPUB inline emphasis placement remains structurally preserved but proportionally allocated rather than linguistically aligned.
- `pipeline_events.language` may lose a language-less terminal observability event; order failure still persists.

## 9. Safety verdicts

- Safe to merge: **YES AFTER INDEPENDENT REVIEW**
- Safe to apply migrations: **NO — hosted SQL reconciliation/backup required**
- Safe to deploy flags OFF: **YES AFTER review and reconciliation**
- Safe to run synthetic production canary: **YES AFTER migrations, order-scoped configuration verification, and rollback gate**
- Safe to enable first real new v2 order: **NO — synthetic production canary must pass first**

## 10. Exact next action

Run `supabase/deployment/production_readiness_catalog.sql` in the production Supabase SQL editor as read-only, archive its output, independently review this commit, and compare catalog evidence to migrations. If clean, approve backup plus the documented flags-OFF migration/deployment sequence; do not enable a real order until an order-scoped synthetic production canary passes.
