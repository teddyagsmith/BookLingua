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

## Safety confirmation

- Nothing deployed.
- No production database changes made.
- No customer order mutated or rerun.
- No real customer/admin email sent.
