# BookLingua Final Pre-production Staging Report

## OVERALL VERDICT: PASS WITH REQUIRED PRODUCTION PREREQUISITES

The disabled semantic-v2 pipeline has now passed a real Anthropic two-pass proof and the complete disposable-Supabase regression matrix. It is ready for independent code/production-readiness review. It is **not ready for production enablement**.

## 1. Scope and safety

- Branch: `booklingua/pipeline-hardening-v2`
- Starting head: `7cf36d22e6e137de1132271290eb09454736d08b`
- Production baseline: `040dfa034b836af9fe6a935163d3570793bd0c7a`
- Supabase: loopback-only disposable instance at `127.0.0.1`
- Model credential: existing BookLingua Anthropic key, explicitly authorised by Teddy for this bounded staging proof on 2026-08-13
- Data: synthetic Moonroot EPUB/TXT fixtures only
- No production Supabase contact, customer order/data, customer manuscript, deployment, merge, feature activation, or email

## 2. Real model proof

- Provider/model: Anthropic / `claude-sonnet-4-5-20250929`
- EPUB French: Pass 1 PASS; Pass 2 PASS; package PASS
- Two-language TXT: French Pass 1/2 PASS; German Pass 1/2 PASS
- Exact node IDs/order and source fingerprints were enforced by the semantic-v2 contract.
- The same persisted approved brief and source fingerprint were used by both passes.
- While only French was complete, order state was `gate_failed`; after German completed it became `ready_for_review`; hardened approval then succeeded.
- A completed EPUB pipeline retry used both cached translations, retained the same build ID, and made zero additional model calls.

### Usage/cost audit

Clean successful run, measured directly from Anthropic response usage fields:

- Before: 0 calls; 0 input tokens; 0 output tokens; $0.000000 attributable run cost
- After: 6 calls; 1,717 input tokens; 1,257 output tokens
- Estimated API cost at Sonnet 4.5 list rates ($3/M input, $15/M output): **$0.024006**
- Emergency cutoff: $5; not approached

An initial attempt made two small calls before exposing the retry defect below. Its response counters were held only in process memory and were lost when the process failed, so its exact cost cannot truthfully be reconstructed. It was bounded by the same tiny fixture and $5 cutoff. The clean successful run above is exact; total session cost is therefore $0.024006 plus those two unmetered small calls.

## 3. Defect found and fixed

The first real retry proved that regenerated DOCX ZIP bytes were nondeterministic and therefore conflicted with the already persisted immutable artifact. The pipeline now detects an already-completed PASS package for the same authoritative build and returns its persisted manifest after validating/reusing cached semantic state. It never regenerates or replaces immutable completed artifacts. The clean proof then passed with the same build ID and no retry model call.

## 4. Controlled adversarial coverage

Permanent contract tests reject missing, duplicate, unexpected, reordered, empty, and stale-fingerprint node output. Cache keys include pipeline version, schema version, pass, language, order, and structure fingerprint. These malformed cases remain controlled boundary injections; they were not induced by asking the live model to misbehave.

## 5. Real disposable-Supabase rerun

- Clean bootstrap solely from committed assets: PASS
- Active migration versions unique and ordered: 11/11 PASS
- Schema/constraint probe: 8/8 PASS
- Source linkage/rollback probe: 4/4 PASS
- Authoritative build probe: 5/5 PASS
- Package gate/approval probe: 9/9 PASS
- Total WB1 SQL evidence: 26/26 PASS
- Semantic EPUB package: PASS, 8 validated artifacts
- Semantic DOCX package: PASS, 8 validated artifacts
- Semantic TXT package: PASS, 8 validated artifacts
- Mocked-boundary French/German E2E: partial gate closed, both complete ready, approval event created
- Real-model French/German E2E: PASS
- Private Storage/RLS rerun: anonymous listing exposed 0 objects while service-role listing saw the six synthetic order prefixes; no policy or storage migration changed in this block.

## 6. Validation

- `npm test`: 45 passed, 0 failed
- `npx tsc --noEmit`: PASS
- `npm run build`: PASS (existing Next.js warning only)
- `npm run verify:migrations`: PASS
- `git diff --check`: PASS

## 7. Remaining findings

### BLOCKER/HIGH for staging

None.

### MEDIUM

- EPUB inline formatting preserves structure, attributes, links and anchors, but translated words are allocated proportionally across inline text slots rather than linguistically aligned to emphasis boundaries.
- Anthropic account-level before/after billing totals are not exposed by the application SDK; per-response token metering is authoritative for the clean run, while the two-call aborted attempt is not exactly recoverable.

### Mandatory production prerequisites

1. Independent review of this final change and the full hardening diff.
2. Read-only hosted migration-ledger/capability reconciliation.
3. Production RLS/private-storage policy verification without manuscript exposure.
4. Controlled migrations and deployment with all new flags default OFF.
5. External delivery email idempotency strategy; hardened external delivery remains disabled.
6. Monitoring, rollback rehearsal, and a final synthetic canary before any customer activation.

## 8. Final verdicts

- Real-model semantic proof: **PASS**
- Multi-language semantic E2E: **PASS**
- WB1 regression: **PASS**
- WB2 final implementation: **PASS**
- Full hardened staging pipeline: **GO**
- Legacy regression: **PASS**
- Ready for independent production-readiness review: **YES**
- Ready to merge: **NO — independent review required first**
- Ready to deploy with flags OFF: **NO — hosted prerequisites/review required first**
- Ready for production enablement: **NO**

## 9. Exact next action

Independently review the commit added by this block and the complete diff from `040dfa034b836af9fe6a935163d3570793bd0c7a`. If accepted, perform and archive the hosted read-only migration/capability and RLS/storage reconciliation, then prepare a flags-OFF deployment/canary plan. Do not enable semantic-v2 or external delivery during that review.
