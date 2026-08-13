# Hosted Reconciliation Remediation Report

## Verdict

**READY FOR BACKUP + CONTROLLED MIGRATION**

This verdict authorizes only backup/PITR preparation, independent review, and the
explicit single-transaction incremental runner. It does not authorize deployment,
flag activation, customer processing, email, or normal `supabase db push`.

## 1. `qa_errors` migration

`202608120000_hosted_prerequisites.sql` adds nullable `public.orders.qa_errors
text` with `IF NOT EXISTS`. Existing legacy rows are not rewritten or made
invalid. The type matches the approval route and quarantined legacy migration.

## 2. Translation pass constraint

The same forward migration replaces `translation_chunks_pass_check` with an
explicit set containing legacy `sonnet`/`opus` and semantic
`semantic-pass1`/`semantic-pass2`. The hosted-shape rehearsal began with the
exported two-value constraint and passed legacy plus semantic inserts.

## 3. Pass label versus actual model

`pass` remains a backward-compatible pipeline-stage label. New non-null
`model_provider`, `model_id`, and `model_stage` columns store actual identity.
Existing rows are labelled `legacy-unknown` / `unknown-legacy`, never falsely
attributed to a current model. Semantic cache uniqueness and lookup now include
`model_id`; a material model change cannot silently reuse an older cache.

## 4–5. Authoritative model configuration

`lib/model-config.ts` is the single reviewed configuration layer:

- Pass 1 translation: `claude-sonnet-5`
- Pass 2 editorial: `claude-sonnet-5`
- normal model work: `claude-sonnet-5`
- Launch Pack: `claude-opus-5`

No real translation path remains on `claude-sonnet-4-5-20250929` or
`claude-sonnet-4-6`. Launch Pack Opus selection is unit-tested; no unnecessary
real Opus spend was incurred.

## 6–7. Historical migration quarantine

Six pre-hardening files were moved from `supabase/migrations` to
`supabase/legacy-history`. `HISTORICAL_MIGRATION_INVENTORY.md` classifies each.
The dangerous subscriber policy is corrected to `TO service_role` with an
explicit service-role predicate for clean historical reference, but it remains
excluded from hosted production. Unrelated feedback/glossary/preferences schema
and `temp_uploads.email` are not approved for this rollout.

## 8. Explicit production manifest

`production_incremental_manifest.txt` contains exactly:

1. read-only hosted preconditions
2. `202608120000_hosted_prerequisites.sql`
3. `202608120001_pipeline_hardening_source.sql`
4. `202608120002_pipeline_hardening_state.sql`
5. `202608120003_pipeline_hardening_briefs.sql`
6. `202608120004_pipeline_hardening_cache.sql`
7. `202608120005_semantic_pipeline.sql`
8. read-only postconditions

`scripts/run-production-incremental.sh` passes these exact files to `psql` with
`ON_ERROR_STOP` and `--single-transaction`. It is deliberately disconnected
from CI/deployment automation.

## 9. pgcrypto namespace

The supplied hosted export proves `pgcrypto` 1.3 exists but did not include its
namespace. The local Supabase rehearsal reports `pgcrypto:extensions`. Production
safety no longer assumes that result: the first manifest step discovers the
installed namespace and verifies `digest`; `public.booklingua_sha256` resolves
that namespace dynamically. Postconditions repeat the capability check. A
missing/moved/unusable extension therefore aborts before commit. The direct
hosted namespace query should still be archived with the backup approval record.

## 10. Exact staging baseline

The disposable baseline reproduces the supplied hosted public schema relevant to
this rollout, including absent `orders.qa_errors`, the legacy two-value pass
check, current legacy unique indexes, RLS-enabled legacy tables, service-role
policies, and private `uploads`. Only the eight manifest steps were then applied.
The reset completed successfully with no hidden shim.

## 11. Staging rerun

- manifest reset/preconditions/postconditions: PASS
- PostgreSQL schema: 8/8 PASS
- source linkage/rollback: 4/4 PASS
- current build authority: 5/5 PASS
- package gate/approval/concurrency: 9/9 PASS
- total WB1 PostgreSQL probes: 26/26 PASS
- semantic EPUB/DOCX/TXT: PASS, 8 validated artifacts each
- Launch Pack + dual-format DOCX case: PASS, 10 validated artifacts
- French/German gate: partial `gate_failed`, both `ready_for_review`, approval PASS
- retry/cache: PASS, completed retry made zero additional model calls
- buckets: `uploads`, source, and artifact all private
- anonymous bucket listing: HTTP 200 with empty `[]`; service role: HTTP 200
- hardened Storage policies and non-null cache model metadata: PASS
- legacy compatibility: PASS through legacy inserts, labels, and regression suite
- provider idempotency-key tests: PASS; no email sent

## 12. Real-model evidence

Real synthetic proof used Anthropic `claude-sonnet-5` for both passes:

- 6 successful calls
- 2,386 input tokens
- 1,436 output tokens
- estimated cost: $0.028698
- EPUB Pass 1/2, French/German flow, approval, persistence and cache retry: PASS

The first attempted request returned HTTP 400 before inference because Sonnet 5
deprecates `temperature`; token usage was zero. The obsolete parameter was
removed and regression-tested before the clean successful run.

## 13. Remaining findings

- BLOCKER: none for backup plus controlled incremental migration.
- HIGH: none in the reconciled schema path.
- MEDIUM: direct hosted `pgcrypto` namespace output should be archived, although
  namespace-independent pre/postconditions now fail safely.
- Production prerequisites: independent diff review; backup/PITR approval;
  archived precondition output; controlled maintenance window; flags and external
  delivery OFF; monitoring/rollback owner; postcondition archive; synthetic canary.

## 14. Exact production order

Use only `scripts/run-production-incremental.sh <approved connection URL>` after
the prerequisites above. Do not run individual files manually and do not use
`supabase db push`.

## 15. Pre-migration checks

The manifest fails unless: no non-rehearsal migration ledger exists; required
legacy tables exist; `qa_errors` is absent; the legacy pass check matches;
hardening objects are absent; `uploads` is private; and pgcrypto digest resolves.
Also confirm a current backup/PITR restore point and all hardening/semantic/email
flags OFF outside the named synthetic canary.

## 16. Post-migration checks

The manifest verifies nullable text `qa_errors`, all four pass labels, private
hardened buckets, and pgcrypto digest. Then archive catalog/RLS/policy/function
exports and rerun the 26 probes plus the synthetic canary before any real order.

## 17. Rollback

All manifest SQL runs in one transaction, so any precondition, DDL, or
postcondition failure rolls back the transaction. After a successful commit,
prefer flags OFF and application rollback; schema removal risks hardened history
and requires a separately reviewed restore/forward-fix decision. Backup/PITR is
mandatory before execution.

## 18. db push verdict

**Normal `supabase db push` is explicitly forbidden for this hosted project.**
Production has no authoritative Supabase migration ledger, and historical replay
is not safe.
