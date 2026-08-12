# BookLingua Pipeline Hardening — Work Block 1

## Executive summary

Work is being performed on an isolated branch based directly on the live production commit. No production systems are being mutated.

## Branch

`booklingua/pipeline-hardening-v2`

## Task log

### A1–A2 — Preserve original binaries and source-manifest foundation

- Status: COMPLETE
- Files changed:
  - `app/api/upload/route.ts`
  - `app/api/checkout/route.ts`
  - `app/api/webhook/route.ts`
  - `lib/source-binary.ts`
  - `lib/source-manifest.ts`
  - `lib/link-source-upload.ts`
  - `lib/translate-job.ts`
  - `supabase/migrations/20260812_pipeline_hardening_source.sql`
  - `tests/source-manifest.test.ts`
  - `package.json`, `package-lock.json`
- Implementation: New EPUB, DOCX and TXT uploads retain the exact binary in private Supabase Storage, SHA-256, filename/format/size, extracted text and a versioned manifest. Checkout links the storage path and manifest to the order. The translation job deterministically retrieves the binary when present. TXT remains supported with explicitly limited parser confidence.
- Tests:
  - `npx tsx --test tests/source-manifest.test.ts` — 2 passed, 0 failed
  - `npx tsc --noEmit` — passed
  - `npm run build` — passed (existing Next.js `serverExternalPackages` warning)
  - `git diff --check` — passed
- Risks: Deployment requires the new migration first. Existing orders are not migrated and continue without binary metadata. DOCX manifest structure remains low-confidence until binary parsing in later semantic work.
- Teddy review: Confirm private `uploads` bucket retention/policies before deployment.

## Migrations created but not applied

1. `20260812_pipeline_hardening_source.sql`
2. `20260812_pipeline_hardening_state.sql`
3. `20260812_pipeline_hardening_briefs.sql`
4. `20260812_pipeline_hardening_cache.sql`

### A3–A5 — Status correctness, terminal failure handling and normalized state schema

- Status: COMPLETE
- Files changed:
  - `lib/order-status.ts`
  - `lib/pipeline-events.ts`
  - `lib/translate-job.ts`
  - `app/admin/page.tsx`
  - `supabase/migrations/20260812_pipeline_hardening_state.sql`
  - `supabase/migrations/README_PIPELINE_HARDENING.md`
  - `tests/order-status.test.ts`
- Implementation: Central status type includes `qa_blocked`, `gate_failed` and `ready_for_review`; admin renders those states. Moving to `pending_review` clears rather than sets `completed_at`. Inngest now has an explicit three-retry policy and terminal `onFailure` handler that stores a concise redacted failure, timestamp, stage and an admin-alert-required pipeline event. Normalized tables were added for pipeline events, validation reports, artifacts and package manifests.
- Tests:
  - `npx tsx --test tests/source-manifest.test.ts tests/order-status.test.ts` — 4 passed, 0 failed
  - `npx tsc --noEmit` — passed
  - `npm run build` — passed (existing Next.js config warning)
  - `git diff --check` — passed
- Risks: Failure persistence depends on the unapplied state migration. The handler deliberately records an alert requirement but does not send real email; canonical manifest-based alert rendering is B7.
- Teddy review: Confirm desired naming transition between current `pending_review` and future `ready_for_review` before enabling the hardened package path.

### A6 + B4 foundation — Intentional test suite and binary artifact validators

- Status: COMPLETE
- Files changed:
  - `package.json`
  - `.github/workflows/ci.yml`
  - `lib/artifact-validation-v2.ts`
  - `tests/artifact-validation.test.ts`
- Implementation: `npm test` now discovers only intentional TypeScript tests and does not execute root diagnostic scripts. CI runs tests, type checking and production build on non-main pushes/PRs. A structured validator opens actual EPUB/DOCX ZIP bytes and hard-fails corrupt/empty packages, leaked markers, visible markdown, missing/duplicate chapter sequences, duplicate headings and substantial duplicate content.
- Tests:
  - `npm test` — 8 passed, 0 failed
  - Synthetic coverage includes good EPUB/DOCX, missing chapter, duplicate chapter number, marker leak, visible markdown, duplicate substantial content and corrupt/empty packages.
  - `npx tsc --noEmit` — passed
  - `npm run build` — passed (existing Next.js config warning)
  - `git diff --check` — passed
- Risks: EPUB TOC-to-heading validation and expected-chapter linkage require package/source manifests in later B work. DOCX heading detection currently uses Word heading styles, deliberately avoiding speculative visual inference.
- Teddy review: None required for the test-discovery boundary; validator thresholds should be reviewed before enabling a hard live gate.

### C1–C3 — Durable per-language translation brief

- Status: COMPLETE for new hardened orders
- Files changed:
  - `lib/translation-brief.ts`
  - `lib/link-source-upload.ts`
  - `app/api/save-glossary/route.ts`
  - `app/api/checkout/route.ts`
  - `app/api/webhook/route.ts`
  - `lib/translate-job.ts`
  - `supabase/migrations/20260812_pipeline_hardening_briefs.sql`
  - `tests/translation-brief.test.ts`
- Implementation: Author decisions are mapped to an immutable v1 brief for every selected target language, tied to the source SHA-256 and approval timestamp. New source-manifest orders fail closed if a language brief is missing. The exact same rendered brief and fingerprint are explicitly included in both Pass 1 and Pass 2. Legacy orders without a source manifest retain the current glossary fallback.
- Tests:
  - `npm test` — 10 passed, 0 failed
  - `npx tsc --noEmit` — passed
  - `npm run build` — passed (existing Next.js config warning)
  - `git diff --check` — passed
- Risks: Existing scanner decisions have heterogeneous choice names and may lack source context; the v1 mapper preserves what exists but cannot invent missing context. The UI now blocks progression on save failure, but checkout/session expiry behavior still needs an end-to-end browser test.
- Teddy review: Confirm whether an empty author decision set should count as an approved empty brief (current behavior) or require an explicit “no special decisions” acknowledgement.

### D1–D6 — Disabled semantic-v2 groundwork and chapter map

- Status: COMPLETE as isolated groundwork; NOT wired into live execution
- Files changed:
  - `lib/semantic-document.ts`
  - `lib/semantic-parser.ts`
  - `lib/node-translation-contract.ts`
  - `lib/chapter-map.ts`
  - `supabase/migrations/20260812_pipeline_hardening_cache.sql`
  - `tests/semantic-v2.test.ts`
- Implementation: Versioned semantic nodes carry stable ID, chapter ID, heading level, immutable source chapter number, source/translated text, order and source location. Synthetic EPUB spine, DOCX segment and TXT parsers produce ordered nodes. Pass 1/Pass 2 node output must return the exact unique ID set in order before text can merge. Cache identity distinguishes `legacy-v1` from `semantic-v2` with schema/structure fingerprints. Chapter maps render CSV and DOCX from semantic IDs.
- Version boundary: Semantic v2 is disabled unless `PIPELINE_VERSION=semantic-v2`; no production job reads this flag or enters the node path yet.
- Tests:
  - `npm test` — 13 passed, 0 failed
  - Synthetic EPUB/DOCX/TXT stable IDs and Chapter 10/11 identity passed.
  - Missing, duplicate and reordered model node IDs fail.
  - Semantic chapter-map CSV/DOCX generation passed.
  - `npx tsc --noEmit` — passed
  - `npm run build` — passed (existing Next.js config warning)
  - `git diff --check` — passed
- Risks: EPUB parser deliberately requires a valid OPF spine and does not silently alphabetize. DOCX confidence inherits current segment heuristics. Model-call wiring, retry behavior and semantic builders remain future reviewed work.
- Teddy review: Decide the confidence threshold for automatic semantic-v2 eligibility; low-confidence files should block or require explicit review rather than fall back silently.

### B1–B2, B4–B8 foundations — Deterministic package contracts and emails

- Status: COMPLETE as reusable hardened-path components; B3 job integration remains NEEDS_REVIEW
- Files changed:
  - `lib/package-manifest.ts`
  - `lib/artifact-store.ts`
  - `lib/package-gate.ts`
  - `lib/email-templates.ts`
  - `lib/review-contract.ts`
  - `app/api/download/[orderId]/[lang]/route.ts`
  - `tests/package-manifest.test.ts`
- Implementation: Package completeness is entitlement-aware and cannot pass without every required validated artifact. Immutable storage paths include artifact hashes. Gate resolution persists the manifest and resolves to `ready_for_review` or `gate_failed`. Canonical review email says PASS or FAIL with exact reasons; customer email refuses failed/incomplete packages. Pass 1 and Review DOCX are separate builders. Review meaning is fixed: yellow strikethrough is Pass 1, following yellow is Pass 2. Hardened downloads prefer stored validated bytes; legacy orders retain dynamic generation.
- Tests:
  - `npm test` — 17 passed, 0 failed
  - Package missing chapter map and purchased Launch Pack fail completeness.
  - Review PASS/FAIL rendering and customer fail-closed behavior passed.
  - Separate Pass 1/Review DOCX generation passed.
  - `npx tsc --noEmit` — passed
  - `npm run build` — passed (existing Next.js config warning)
  - `git diff --check` — passed
- Risks: Existing order approval remains the legacy path. The hardened package builder is not yet invoked from `translate-job.ts`; activating it before semantic structure/builder parity is reviewed would be unsafe.
- Teddy review: B3 prebuild integration should be enabled only after choosing the semantic eligibility threshold and validating builders against a synthetic end-to-end book fixture.

### B9 + E1–E3 — Versioned product assets and structured schemas

- Status: COMPLETE for schema/validation groundwork; Launch Pack generation integration NEEDS_REVIEW
- Files changed:
  - `public/assets/BookLingua_Author_Upload_Guide_v1.docx`
  - `lib/upload-guide.ts`
  - `lib/launch-pack-schema.ts`
  - `lib/launch-strategy.ts`
  - `lib/translation-notes.ts`
  - `tests/product-assets.test.ts`
  - `app/page.tsx`
- Implementation: The existing guide is now a versioned production asset with a pinned SHA-256. Launch Packs have a canonical v1 schema and deterministic entitlement/locale/completeness checks. Translation notes have a validated v1 schema, legacy migration parser and human renderer. Package completeness already requires these assets as applicable. The scanner UI now refuses to advance if glossary/brief choices fail to save.
- Tests:
  - `npm test` — 20 passed, 0 failed
  - Launch Pack entitlement/locale/required sections passed.
  - Legacy-to-structured translation notes and renderer passed.
  - Upload guide asset existence/hash passed.
  - `npx tsc --noEmit` — passed
  - `npm run build` — passed (existing Next.js config warning)
  - `git diff --check` — passed
- Risks: `lib/launch-strategy.ts` still has limited legacy market configuration and is not invoked by the production job. It would be unsafe to claim automated Launch Pack delivery yet.
- NEEDS_REVIEW: Choose the canonical market mapping and whether to port the richer manual Launch Pack generator before wiring generation. No new marketing content was invented.

## Commit list

1. `838a6554` — preserve source binaries and manifests
2. `168103fe` — record pipeline failures and statuses
3. `4c3e0f7c` — add artifact regression infrastructure
4. `170cc5b6` — persist per-language translation briefs
5. `86307e09` — add disabled semantic-v2 contracts
6. `9fef8bf9` — add hardened package contracts
7. `3692ae58` — version customer package assets

All commits are on `booklingua/pipeline-hardening-v2`, based directly on live production commit `040dfa034b836af9fe6a935163d3570793bd0c7a`. The Hollow King rebuild commit is not an ancestor of this branch.

## Tasks completed

- A1–A6: completed as compatible application/migration/test groundwork.
- B1, B2, B4–B9: reusable components completed; stored-artifact download compatibility added.
- C1–C3: completed for new source-manifest/hardened orders with legacy fallback.
- D1–D6: completed as disabled semantic-v2 groundwork only.
- E1–E3: schemas, validation and completeness rules completed; Launch Pack generation remains unwired.

## Tasks blocked or intentionally not completed

### B3 — Full prebuild integration into the translation job

- Status: NEEDS_REVIEW, not implemented.
- Reason: The current live translation still produces flattened text, while trustworthy prebuilt EPUB/DOCX artifacts require the semantic eligibility threshold and builder parity to be agreed first. Wiring partial prebuild now would risk presenting heuristic artifacts as hardened output.
- Safe progress completed: immutable artifact storage, binary validators, package manifest/gate, stored-download lookup, Pass 1/Review builders and tests.

### B4 — EPUB TOC/heading parity beyond deterministic chapter sequence

- Status: PARTIAL / NEEDS_REVIEW.
- Current validator checks actual ZIP readability, content files, headings/chapter sequence, duplication, markers, markdown and emptiness. Full nav/NCX-to-spine-to-heading parity is not yet implemented.

### E1 — Production Launch Pack generation

- Status: NEEDS_REVIEW, not wired.
- Reason: The tracked generator and richer manual generator diverge, and the tracked market map does not cover all current locale variants. Schema/entitlement validation is ready; choosing/porting the canonical generator requires product review.

### Real admin alert dispatch

- Status: PREPARED, not sent/wired.
- Terminal failures persist an `adminAlertRequired` event. Canonical PASS/FAIL email rendering exists. No real email dispatch was added because the work block prohibited sending email and manifest-based job integration remains under review.

## NEEDS_REVIEW decisions

1. Parser-confidence threshold for automatic semantic-v2 eligibility.
2. Whether an explicitly approved empty translation brief is sufficient.
3. Canonical Launch Pack implementation and complete locale/market mapping.
4. Final status naming: retain `pending_review` externally or transition hardened packages to `ready_for_review`.
5. Artifact-validator thresholds, especially substantial duplication and heading rules.
6. EPUB nav/NCX parity requirements and treatment of EPUBs without a valid navigation document.
7. Whether TXT packages require both final DOCX and source-like TXT output.

## Feature flags and version boundaries

- Source manifest schema: `1.0`.
- Translation brief schema: `1.0`.
- Artifact validator: `1.0`.
- Package manifest: `1.0`.
- Review contract: `1.0`.
- Email templates: `1.0`.
- Translation notes: `1.0`.
- Launch Pack: `1.0`.
- Semantic document/node batches: `2.0`.
- `SEMANTIC_V2_ENABLED` is true only for `PIPELINE_VERSION=semantic-v2`; no production job enters that path in this branch.
- Translation cache migration defaults existing/current rows to `legacy-v1`; semantic-v2 uses a schema and structure fingerprint. No cache was invalidated.
- Orders without a source manifest remain legacy-compatible.

## Known risks

1. New application writes require all four migrations to exist first.
2. Supabase `uploads` and `book-files` privacy, retention and download policies require environment verification.
3. Upload/session/checkout behavior needs a non-production browser test after migrations.
4. DOCX semantic confidence inherits the existing style/heuristic extractor.
5. Hardened package components are intentionally not yet an end-to-end Inngest path.
6. The legacy approval QA path remains broken as documented in the audit; this branch does not pretend the new package gate has replaced it.
7. `npm install` reports existing dependency vulnerabilities; no broad dependency upgrade was attempted because it is outside this work block and could be breaking.
8. Next.js 14.2 still warns that `serverExternalPackages` is unrecognized in `next.config.js`.

## Recommended review and deployment sequence

1. Review commits independently in the order listed above.
2. Run CI and repeat tests in a clean Node 20 checkout without production environment values.
3. Review SQL, then apply migrations in order to a staging Supabase project only.
4. Verify private storage buckets/policies and exercise synthetic EPUB/DOCX/TXT upload → checkout linking in staging.
5. Review translation-brief UI and prompt snapshots; confirm both passes use the same fingerprint.
6. Review semantic parser confidence on synthetic and licensed internal fixtures; choose the eligibility threshold.
7. Implement/approve B3 in a new commit: semantic builders, actual-byte validation, manifest persistence and atomic gate.
8. Add full EPUB navigation parity tests before enabling the hard package gate.
9. Choose and wire the canonical Launch Pack generator behind the hardened path.
10. Perform a staging-only end-to-end order with email transport mocked/sandboxed.
11. Only after Teddy review: apply production migrations, deploy the compatible groundwork with semantic-v2 still disabled, and monitor.
12. Enable hardened/semantic-v2 only for explicitly versioned new orders after artifact parity passes; never mix legacy and v2 chunks.

## Final validation results

- `npm test` — PASS: 20 tests, 0 failures.
- `npx tsc --noEmit` — PASS.
- `npm run build` — PASS: compiled, type/lint checks passed, 32/32 static pages generated.
- `git diff --check` — PASS.
- Full branch diff from production `git diff 040dfa...HEAD --check` — PASS.
- Existing warnings only:
  - Next.js 14.2 does not recognize `serverExternalPackages` in `next.config.js`.
  - Browserslist data is six months old.
- No customer fixture/content was used; all regression inputs are synthetic.

## Safety confirmation

- Nothing deployed.
- No production database changes made.
- No customer order mutated or rerun.
- No real customer/admin email sent.
