# Customer Package V1 Acceptance

Version: `customer-package-v1`  
Pipeline: `semantic-v2`  
Accepted release basis: BookLingua hardened-pipeline branch through the final normalized branded-header approval.

## Frozen customer contract

Customer Package V1 freezes the accepted behaviour and presentation of:

- Final DOCX and EPUB
- Review DOCX
- Translation Notes DOCX
- Chapter Map DOCX
- researched Launch Pack DOCX
- How to Use Your Translations + Upload Guide DOCX
- shared 60 mm, aspect-safe, visibly centred BookLingua document header
- customer-facing filenames and download page
- customer artifact allowlist and internal-only artifact blocking
- explicit title authority
- Launch Pack source/fact grounding
- all-language aggregate package gate
- current-build authority and immutable artifact verification

No redesign or content change is permitted under this version. Any future contract or presentation change requires a new package version and acceptance record.

## Production operating contract

- Only orders created after the production cutover are stamped `pipeline_version=semantic-v2` and `customer_package_version=customer-package-v1`.
- Existing and in-flight orders retain their recorded pipeline/version and are never silently migrated or retriggered.
- A package may automatically reach `ready_for_review`, but this state does not authorize customer downloads or customer email.
- Customer delivery requires the explicit authenticated admin action **Approve & Send to Customer**, after showing and confirming the current customer email and languages.
- Approval reassembles every current language manifest and fails closed for missing, failed, incomplete, or stale builds.
- Customer-scoped downloads remain blocked until authoritative approval starts delivery.
- Delivery uses a deterministic database delivery event and provider idempotency key; repeated or concurrent approval cannot create a second customer delivery.

## Release checks

The release is accepted only when `npm test`, `npx tsc --noEmit`, `npm run build`, `npm run verify:migrations`, and `git diff --check` pass; production backup/restore rehearsal and controlled migration reconciliation pass; the deployed SHA matches the reviewed SHA; and the production smoke checks pass.
