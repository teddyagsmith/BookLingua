VERDICT:
READY FOR FRESH CANARY

# Hollow Bride canary remediation

Reviewed base: `6a53842c39bb2eff192fccbe7b1203d7978d2ba5`

Remediation code commit: `8ee0f397` (`fix Hollow Bride canary remediation paths`)

The failed production canary `c7552a0c-2121-4866-8e53-20f710c2ec9e` was not retriggered, edited, or reused. No production code, schema, flag, order, or email state was changed during this remediation.

## 1. Launch Pack parsing root cause and fix

Root cause: `lib/launch-strategy.ts` assumed `response.content[0]` was text. Claude Opus 5 can return a `thinking` block before its text block, so the production canary threw `Unexpected response type` before semantic translation began.

Fix:

- Inspect every returned content block and select the first non-empty block whose type is exactly `text`.
- Never concatenate thinking, tool, or other non-text blocks.
- Fail closed when no non-empty text block exists.
- Parse JSON strictly; malformed/truncated output remains a hard failure.
- Preserve `toCanonicalLaunchPack()` and all entitlement, schema, locale, market, Amazon-domain, currency, keyword, category, and content validators.
- Increase `max_tokens` from 4,000 to 8,192. Real staging showed that Opus thinking plus the canonical pack could truncate JSON at the old ceiling. This does not weaken validation.

Regression cases passed: text first; thinking then text; multiple non-text blocks then text; no text; empty text; malformed JSON; unsupported locale.

## 2. Real Opus proof

PASS. A synthetic French Launch Pack was generated with the actual configured `claude-opus-5` model and supported adaptive high-effort thinking.

Observed block order: `thinking`, `text`.

The corrected parser selected only the text block and produced a canonical validated pack with:

- schema `2.0`
- locale `fr`
- market `France`
- Amazon domain `amazon.fr`
- currency `EUR`

Evidence: `/Users/gilbert/BookLingua-Backups/20260813T184935Z/canary-remediation/real-opus-launch-proof-high.log`

## 3. Launch Pack usage/cost metadata

Each production Launch Pack attempt now emits a distinct `pipeline_events` record containing, where supplied by Anthropic:

- provider
- actual response model ID
- input and output tokens
- Inngest/function attempt number
- success/failure
- stage and stable request identity
- safe error identity on failure

The successful real Opus proof recorded:

- provider: `anthropic`
- model: `claude-opus-5`
- attempt: 1
- input tokens: 1,267
- output tokens: 6,248 (includes model thinking/output accounting exposed by Anthropic)
- success: true

This is sufficient for an auditable cost calculation using the Anthropic price in force at execution time. No API credential is stored or logged. Failed attempts are recorded separately and remain distinguishable.

## 4. Semantic finalization root cause and fix

Root cause: the semantic-v2 branch returned immediately after its per-language loop. It therefore never performed an explicit aggregate handoff or internal review notification.

Fix: `finalizeSemanticOrder()` is a separate semantic finalization helper. It:

1. Calls the committed `resolve_order_package_gate()` database function.
2. Remains closed unless every required current package is authoritative and PASS.
3. Loads the exact current PASS manifests for all purchased languages.
4. Re-evaluates each manifest before composing review output.
5. Creates a deterministic internal-review event derived from the order and current build set.
6. Uses a stable provider idempotency key.
7. Marks the logical review event complete only after the intercepted/provider send succeeds.

Semantic-v2 returns after this explicit helper and never falls through into legacy artifact generation. External customer delivery remains separate and still requires the hardened approval/delivery path and `HARDENED_EXTERNAL_DELIVERY`.

## 5. Multi-language aggregation proof

PASS against disposable PostgreSQL rebuilt from committed assets.

- French current package: PASS.
- French-only aggregate resolution: `gate_failed`; no review event/email.
- German current package: PASS.
- French + German aggregate resolution: `ready_for_review`.
- Both packages contained all ten entitled artifacts (Launch Pack plus dual EPUB/DOCX).
- One aggregate internal-review event was created.

The real Sonnet cache records contain exactly four model-stage identities:

- French Pass 1: `claude-sonnet-5`, translation
- French Pass 2: `claude-sonnet-5`, editorial
- German Pass 1: `claude-sonnet-5`, translation
- German Pass 2: `claude-sonnet-5`, editorial

## 6. Internal review email and idempotency

PASS with an intercepted provider; no real email was sent.

- Subject: `PASS — INTERNAL REVIEW — Moonroot Synthetic — fr, de`
- Includes every validated artifact, SHA-256, language, validation result, admin link, and signed artifact link.
- Includes Launch Packs, chapter maps, upload guides, Pass 1, review DOCX, final EPUB/DOCX, notes, and briefs.
- Stable idempotency key: `internal-review/<deterministic-event-uuid>`.
- Logical sends after initial finalization: 1.
- Logical sends after retry: still 1.
- Internal review events after retry: still 1.
- Real Resend was not invoked.

Review-stage downloads now accept `ready_for_review` only for an exact current authoritative manifest/artifact. Requested artifact types are allowlisted; stored bytes are re-hashed and checked before serving.

## 7. Retry/cache proof

PASS.

- The production job checks for a current authoritative PASS package before Launch Pack or Sonnet calls.
- Completed packages return as cached and do not call Opus or Sonnet again.
- Repeated finalization reused the deterministic review event and did not invoke the intercepted email provider again.
- Artifact inventory remained 20 rows (10 French, 10 German).
- Artifact SHA-256 values were unchanged.
- Translation cache identities remained four rows (two passes × two languages).

Evidence: `/Users/gilbert/BookLingua-Backups/20260813T184935Z/canary-remediation/finalization-resume.log`

## 8. Full staging results

PASS:

- Disposable Supabase rebuilt entirely from committed assets.
- WB1 real PostgreSQL probes: 26/26 PASS.
- EPUB semantic package: PASS.
- DOCX semantic package: PASS.
- TXT semantic package: PASS.
- Launch Pack + dual-format DOCX fixture: PASS (10 artifacts).
- Real French/German Sonnet packages: PASS (20 artifacts total).
- Real Opus thinking-before-text proof: PASS.
- Multi-language aggregate gate: PASS.
- Internal email interception/idempotency: PASS.
- Completed retry/cache/hash reuse: PASS.
- RLS: enabled on all eight hardening/semantic tables checked.
- Storage: `uploads`, `booklingua-private-sources`, and `booklingua-private-artifacts` all private.
- Legacy compatibility: PASS in unit/regression suite.
- Migration verifier: PASS; six active versions, exact eight-step hosted manifest.

Evidence directory: `/Users/gilbert/BookLingua-Backups/20260813T184935Z/canary-remediation/`

## 9. Tests and checks

- `npm test`: 56/56 PASS.
- `npx tsc --noEmit`: PASS.
- `npm run build`: PASS.
- Migration verifier: PASS.
- `git diff --check`: PASS.
- Independent review of the complete `6a53842c..8ee0f397` code diff: PASS.

Build warning only: the pre-existing Next.js 14.2 `serverExternalPackages` configuration warning remains. It did not fail compilation or the production build and is unrelated to this remediation.

## 10. Commits added

1. `8ee0f397` — `fix Hollow Bride canary remediation paths`
2. Report-only commit recorded after this document is committed.

## 11. Remaining findings

- BLOCKER: none.
- HIGH: none.
- MEDIUM: none in the fresh-canary path.
- LOW/non-blocking: the pre-existing Next.js configuration warning noted above.

## 12. Exact new production deployment procedure

Do not deploy until Teddy explicitly approves the new commit range.

1. Independently review `6a53842c39bb2eff192fccbe7b1203d7978d2ba5..<final-report-SHA>`.
2. Confirm local and remote branch resolve to the approved final SHA.
3. Run and archive:

   ```bash
   npm test
   npx tsc --noEmit
   npm run build
   npm run verify:migrations
   git diff --check 6a53842c39bb2eff192fccbe7b1203d7978d2ba5..<final-report-SHA>
   ```

4. Confirm production configuration remains:

   - `PIPELINE_VERSION` legacy/default (semantic-v2 globally OFF)
   - `HARDENED_EXTERNAL_DELIVERY` OFF/unset
   - no fresh canary ID configured yet

5. Deploy the exact approved SHA to Vercel production without a merge-generated code change.
6. Verify the deployed Git SHA, health endpoint, Inngest registration, and legacy read-only/synthetic smoke routes.
7. Confirm zero new runtime errors and that an unrelated legacy synthetic order remains on the legacy path.
8. Do not run `supabase db push`; this remediation contains no database migration.
9. Do not create, trigger, or email a fresh canary until separately approved.

## 13. Exact fresh-canary procedure

Only after a separate explicit approval:

1. Create a new synthetic production order with a new UUID. Do not reuse or mutate `c7552a0c-2121-4866-8e53-20f710c2ec9e`.
2. Bind a private synthetic EPUB source and approved French/German briefs to its exact source hash.
3. Entitle Launch Pack and dual-format EPUB + DOCX.
4. Set only:

   - `PIPELINE_HARDENING_V1=enabled`
   - `SEMANTIC_V2_CANARY_ORDER_IDS=<new-synthetic-order-uuid>`

5. Keep global `PIPELINE_VERSION` legacy/default and `HARDENED_EXTERNAL_DELIVERY` OFF.
6. Deploy the configuration at the exact reviewed remediation SHA and prove only the new UUID qualifies.
7. Record Anthropic usage/cost baseline immediately before triggering.
8. Trigger the reviewed admin endpoint exactly once.
9. Monitor French then German package state. Confirm French-only remains closed and only both authoritative PASS packages reach `ready_for_review`.
10. Verify model/attempt/token events, semantic IDs, chapter order, all 20 artifact rows and hashes, one internal review event, and one Gilly/Teddy review email.
11. Perform one completed-build retry. Confirm zero new model attempts, unchanged hashes, one review event, and no duplicate email.
12. Record Anthropic usage/cost after the run and archive the delta.
13. Stop at internal review. Do not approve or deliver to a customer.
14. Confirm external delivery remained OFF, then report PASS/FAIL before changing any further flag.

No fresh canary was created or started.
