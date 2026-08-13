# WB2 Implementation Report

## Executive verdict

WB2 now has a real, default-off semantic-v2 execution path that parses an authoritative source, validates two node-preserving model passes, persists immutable semantic state, generates and validates the customer artifact set, stores private build-bound artifacts, derives the package manifest from persisted rows, and uses the WB1 all-language gate.

Three real local-Supabase end-to-end executions (EPUB, DOCX, TXT) passed with deterministic mocked model responses at the external-model boundary. Real model behavior was not claimed. Launch Pack product/market mapping remains intentionally unwired; entitled orders fail package completeness. Therefore WB2 is **PASS WITH REQUIRED FIXES** and the full hardened staging pipeline is **NO-GO** for general release, although non-Launch-Pack synthetic package generation is proven.

## Architecture implemented

The job enters semantic-v2 only when all three conditions hold: WB1 hardening exactly enabled, `PIPELINE_VERSION=semantic-v2`, and the individual order has `pipeline_version=semantic-v2`. Missing variables and legacy orders stay on legacy-v1.

Flow: authoritative binary → semantic parser/eligibility → persisted source document → deterministic current build allocation → persisted approved brief verification → Pass 1 node contract/cache/persistence → Pass 2 using the same brief and Pass 1 identity → structured artifacts → validation reports → private immutable artifacts → authoritative package manifest → order-wide current-build gate.

`semantic_documents` stores immutable source/pass1/pass2 documents. Semantic cache identity includes pipeline version, schema, source/structure fingerprint, language, pass, and chunk index. A deterministic build UUID makes the same source/brief retry select the same build; a new source or brief revision produces a different identity.

## Semantic parsing

EPUB: follows container → OPF → manifest → spine; accepts arbitrary XML attribute order and quote style; normalizes safe relative paths; rejects package-root traversal; preserves spine order, immutable node IDs, heading levels, chapter IDs, and source locations. Nav/NCX are not content nodes.

DOCX: reuses the paragraph/run reconstruction and style-aware extraction, preserving ordered headings, paragraphs, and detected lists where available. Missing/weak styles lower confidence rather than inventing certainty.

TXT: deterministic ordered nodes with explicit `review_required` eligibility. It cannot be presented as fully eligible without the persisted per-order review approval boundary.

Known limitation: EPUB block replacement preserves package/resources/CSS/images/spine but flattens inline markup within translated textual blocks. More precise inline-span reconstruction is a required fix before broad EPUB production readiness.

## Translation contracts

Both passes require exact schema, source fingerprint, node ID set, node order, and non-empty translations. Missing, duplicate, unexpected, reordered, empty, or stale-fingerprint output fails closed. Pass 2 consumes Pass 1 text while retaining source IDs/order and the same authoritative brief.

The staging model boundary was deterministic and mocked. No external model call was made. Real Supabase build allocation, cache, persistence, artifact generation, validation, Storage, package gate, and approval infrastructure remained real.

A real integration defect was fixed: brief hashing formerly depended on JavaScript key order, while PostgreSQL JSONB canonicalizes keys. Fingerprints now use canonical JSON and have a regression test.

## Artifacts

| Artifact | Generated | Validated | Persisted | Package required | Customer eligible |
|---|---:|---:|---:|---:|---:|
| Translation brief JSON | yes | authority + non-empty | yes | yes | after approval |
| Pass 1 DOCX | yes | hardened DOCX | yes | yes | after approval |
| Review DOCX | yes | hardened DOCX | yes | yes | after approval |
| Final DOCX | DOCX/TXT | hardened DOCX | yes | by entitlement | after approval |
| Final EPUB | EPUB | hardened EPUB | yes | by entitlement | after approval |
| Chapter map DOCX | yes | hardened DOCX | yes | yes | after approval |
| Chapter map CSV | yes | non-empty + complete map | yes | yes | after approval |
| Translation notes | yes | structured schema | yes | yes | after approval |
| Pinned upload guide | yes | exact committed SHA-256 | yes | yes | after approval |
| Launch Pack | only when supplied as validated canonical JSON | schema/locale | yes when supplied | when purchased | blocked if absent |

DOCX outputs are node-structured rather than a flattened whole-book blob. Review output uses one consistent Pass 1 strikethrough/Pass 2 replacement convention. Final output has no review markup or internal IDs. Chapter maps use immutable semantic/chapter identity.

## Launch Pack

The repository contains legacy/manual generation approaches but no sufficiently proven canonical entitlement-to-market rule that can be safely inferred. WB2 accepts and validates a supplied canonical Launch Pack, but the translation job does not invent or generate one. A purchased Launch Pack that is absent prevents package PASS. Required product fix: approve one locale/market mapping and canonical generator/input contract, then wire it to the runner.

## Package gate and delivery

All artifacts are tied to order/language/current build, SHA-256, byte length, validation report, and private object path. Package authority remains database-derived. The WB1 multi-language matrix still passes: missing/failed/stale language packages cannot make the order reviewable.

Approval/download continue to use current approved builds and fail hash/size/object checks. External hardened delivery remains separately disabled; no real email was sent.

## Staging evidence

Real Supabase:

- Clean repository-only reset applied 11 unique active migrations plus the disposable baseline/history mapping.
- WB1 probes after WB2: schema 8/8, linkage 4/4, build identity 5/5, gate/approval 9/9.
- Real semantic EPUB package: PASS, 8 authoritative artifacts.
- Real semantic DOCX package: PASS, 8 authoritative artifacts.
- Real semantic TXT package with explicit structure review: PASS, 8 authoritative artifacts.
- Storage writes, database constraints, RLS, validation rows, manifests, and gate were real.

Real file generation: semantic Pass 1/Review/Final DOCX, translated EPUB, chapter-map DOCX/CSV, notes, brief and pinned guide were generated as real bytes and passed their applicable validators.

Mocked: external model responses only. No real model evidence is claimed.

## Legacy compatibility and feature flags

Legacy-v1 remains default for environment and order. Semantic-v2 requires exact explicit environment and per-order selection. Semantic-v2 cache identities cannot collide with legacy-v1. Historical orders are not backfilled. The full 44-test suite and all WB1 real probes passed after WB2 changes.

## Security/privacy

Hardened source and artifact buckets remain private. Artifact access remains application-mediated and build/manifest-bound. No source text is written into safe failure messages by the new runner. Production was not contacted and no customer data was used.

## Tests

- Starting count: 39.
- Ending count: 44 passed, 0 failed.
- TypeScript: PASS.
- Build: PASS (existing Next.js/Browserslist warnings only).
- Migration verifier: PASS; 11 active versions unique and ordered.
- WB1 real probes: 26/26 PASS.
- WB2 real E2E: EPUB PASS; DOCX PASS; TXT PASS, each with 8 persisted artifacts.

## Remaining issues

BLOCKER: none for continued disabled development.

HIGH / required before final production-readiness review:

1. Approve and wire the canonical Launch Pack locale/market generator contract; entitled packages currently block safely.
2. Preserve trustworthy inline EPUB markup rather than flattening each translated block.
3. Exercise the semantic job with a real test-model credential and adversarial response/retry behavior; current E2E mocks only the provider.
4. Add a dedicated multi-language semantic E2E (WB1 proves the real gate, but the current WB2 runner evidence is one language per source format).

MEDIUM:

- Translation notes currently render author-approved brief decisions; richer editorial notes require a separately validated structured model output.
- Full DOCX list/style fidelity is limited by trustworthy source styles and Mammoth extraction.
- Artifact retry is fail-closed on changed bytes; deterministic ZIP/DOCX byte reproducibility or persisted-byte reuse should be tightened for provider-success/late-step retries.

Production prerequisites: hosted migration-ledger/capability reconciliation; exact staging deployment rehearsal; external-delivery provider idempotency/outbox; independent review of WB2; all flags off during schema/application deployment.

## Final verdicts

- WB2 implementation: **PASS WITH REQUIRED FIXES**
- Full hardened staging pipeline: **NO-GO**
- Legacy regression: **PASS**
- Ready for final production-readiness review: **NO**
- Ready for production enablement: **NO**

## Exact next action

Independently review the WB2 commits, then resolve the four HIGH items in order: canonical Launch Pack contract, EPUB inline preservation, real test-model rehearsal, and multi-language semantic E2E. Repeat the repository-only Supabase reset, WB1 probes, and complete WB2 matrix before requesting production-readiness review.
