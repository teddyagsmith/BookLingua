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

## Safety confirmation

- Nothing deployed.
- No production database changes made.
- No customer order mutated or rerun.
- No real customer/admin email sent.
