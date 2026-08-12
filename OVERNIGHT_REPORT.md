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
- Risks: Existing scanner decisions have heterogeneous choice names and may lack source context; the v1 mapper preserves what exists but cannot invent missing context. The UI still needs explicit blocking handling of a save failure before this is production-ready.
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

## Safety confirmation

- Nothing deployed.
- No production database changes made.
- No customer order mutated or rerun.
- No real customer/admin email sent.
