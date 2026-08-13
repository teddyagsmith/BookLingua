# WB1 Final Blocker Report

## Executive result

The final WB1 blocker rehearsal completed against the disposable local Supabase stack only. Production was not contacted. The authoritative current-build race is closed at the database and application boundaries, the repository now has a repeatable disposable bootstrap plus a safe forward-only hosted contract, and hardened external email is fail-closed and disabled by default.

## 1. Authoritative build identity

`order_language_builds` is the server-owned history for `order_id + language`. A partial unique index permits exactly one current build. `begin_order_language_build` locks the order/language, allocates a monotonically increasing generation, atomically supersedes the previous build, and treats the same build ID as an idempotent retry. Validation reports and package manifests have composite foreign keys to the same build/order/language identity. Historical artifacts, reports, and manifests remain immutable.

The package gate, approval RPC, artifact persistence, approval route, and download route resolve only the current build. The order row lock serializes build supersession against gate and approval. Once approval starts, build creation and artifact/manifest insertion fail closed. Downloads first resolve the current build and then the manifest bound to it.

Real PostgreSQL evidence:

- Build A then B, followed by delayed A PASS: A remained superseded and non-authoritative.
- stale PASS/current FAIL resolved `gate_failed`.
- stale FAIL/current PASS resolved `ready_for_review`.
- identical build retry returned the original generation with `created=false`.
- simultaneous distinct build allocation serialized to generations 1 and 2, with exactly one current row.
- cross-language report/build linkage failed by foreign key.
- fabricated and wrong-language manifests could not manufacture package authority.

Stale-build verdict: **PASS — delayed historical builds cannot become authoritative.**

## 2. Migration baseline and history

Original defects were an incomplete from-zero baseline, dependencies on absent `translation_chunks` and other production tables, and duplicate active `20250630` migration versions. The four WB1 migrations already use unique ordered versions.

Chosen strategy: hybrid forward contract.

- `supabase/bootstrap/00000000000000_disposable_baseline.sql` is a committed capability baseline for disposable staging/CI only. It is explicitly forbidden for hosted production.
- The two already-deployed duplicate `20250630` files are preserved byte-for-byte under `supabase/legacy-history/` and excluded from normal active migration deployment. Disposable bootstrap maps them to deterministic local-only versions.
- `scripts/verify-migration-contract.mjs` rejects duplicate active versions, missing WB1 migrations, and missing baseline capabilities.
- `scripts/reset-disposable-supabase.sh` rebuilds local Supabase using only committed assets; no manual shim is required.
- `supabase/deployment/verify_wb1_prerequisites.sql` is a read-only hosted capability assertion.

Observed clean bootstrap: 13 deterministic migration entries applied; all WB1 tables, RPCs, policies, and private buckets existed; schema/linkage/build/gate probes passed. `npm run verify:migrations` reports 10 unique active versions.

Production history is deliberately not fabricated or rewritten. Before deployment, an authorized read-only comparison of the hosted migration ledger and `qa_errors` capability must be archived. This is a production rollout prerequisite, not a remaining WB1 design blocker.

Migration-history verdict: **PASS for repository-controlled staging/CI and safe forward rollout contract; hosted ledger verification remains a production prerequisite.**

## 3. Delivery idempotency

Hardened approval creates one deterministic `delivery_events` row bound to the exact current build map. A unique event key prevents duplicate logical delivery events and approval does not set `completed_at` or claim that email was sent.

The provider send path requires the separate exact value `HARDENED_EXTERNAL_DELIVERY=enabled`. It is disabled by default and approval returns `externalDelivery: pending_disabled`, `emailSent: false`. `PIPELINE_HARDENING_V1` alone cannot activate external delivery.

Resend v3 still cannot prove exactly-once provider delivery across provider-success/DB-finalize failure. Therefore the classification is: **SAFE DEFERRED — EXTERNAL DELIVERY DISABLED**. Provider upgrade/idempotency or a claim/lease outbox worker is required before production delivery enablement.

## 4. Real staging evidence

| Area | Observed result | Verdict |
|---|---|---|
| Clean bootstrap | committed baseline + deterministic historical mapping + active migrations; 13 applied entries | PASS |
| Schema constraints | 8/8 invalid/valid probes | PASS |
| Source linkage | 4/4 including rollback and conflicting retry | PASS |
| Build identity | 5/5 plus simultaneous allocation | PASS |
| Package gate | 7/7 including missing/FAIL/multi-language/stale build/fabrication | PASS |
| RPC concurrency | concurrent build allocations serialized; earlier source/gate concurrency repeated on same local stack | PASS |
| RLS/Storage | public and anon-key reads denied; service-role upload/read HTTP 200; both hardened buckets private | PASS |
| Uploads | real TXT/DOCX/EPUB succeeded; malformed/spoofed rejected in the staging rehearsal; unchanged paths regression-tested | PASS |
| Approval | current manifests only; transaction creates deterministic pending delivery event; build start blocked after approval begins | PASS |
| Download | current-build lookup plus persisted hash/size/object verification; stale and tampered records rejected | PASS |
| Legacy | flag default remains off; legacy pending-review and fallback paths remain separate | PASS |

No model API or real external email was invoked.

## 5. Tests and validation

- Starting automated count: 36.
- Ending automated count: 39 passed, 0 failed.
- Real SQL probes: schema 8/8; linkage 4/4; build identity 5/5; gate 7/7.
- `npm run verify:migrations`: PASS.
- `npx tsc --noEmit`: PASS.
- `npm run build`: PASS (pre-existing Next.js config and Browserslist warnings only).
- `git diff --check`: PASS.

## 6. Remaining findings

WB1 blockers: none found after remediation and rerun.

Production prerequisites:

1. Read-only hosted migration-ledger/capability verification and an archived reconciliation approval.
2. Apply additive migrations with all hardening and hardened delivery flags off, then repeat synthetic staging checks.
3. Do not enable external delivery until provider-level idempotency or a durable claim/lease sender is independently verified.

WB2 deferred: semantic-v2 implementation, full product deliverable builders, Launch Pack production generation, external delivery worker/provider contract.

Low residual risk: local Supabase cannot prove hosted platform-version differences; the existing legacy email path is outside this hardened-delivery gate.

## Final verdicts

- WB1 staging gate: **GO**
- Ready to merge WB1 groundwork: **YES AFTER LISTED FIXES** — the only listed fix is independent review of these commits; hosted ledger verification is required before migration/deployment, not before code review.
- Ready to begin WB2: **YES**
- Ready for production enablement: **NO**
- External delivery email: **SAFE DEFERRED — EXTERNAL DELIVERY DISABLED**

## Exact next action

Independently review the final remediation commits and report. If accepted, begin WB2 on the still-disabled architecture. Separately, before any production migration, run the read-only prerequisite and migration-ledger reconciliation against production, archive the result, and rehearse the exact additive migration sequence with both hardening flags off.
