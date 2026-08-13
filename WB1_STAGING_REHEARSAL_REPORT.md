# BookLingua WB1 Staging Rehearsal Report

## Executive verdict

- **WB1 staging gate: NO-GO**
- **Ready to merge WB1 groundwork: NO**
- **Ready to begin WB2: NO**
- **Ready for production enablement: NO**

Real local Supabase testing found and fixed two blockers: the RPCs treated the
production `orders.languages` JSONB column as `text[]`, and the package gate
trusted caller-supplied PASS manifests. The branch is materially safer, but an
explicit current-build identity is still absent. A delayed valid package from
an older build is indistinguishable from the intended current build, so stale
artifacts can become the row selected by gate/approval/download queries. This
must be fixed and rehearsed before merge or WB2.

## Environment and isolation

- Branch start: `booklingua/pipeline-hardening-v2` at `f159b113447ade985f788caa63bd997a849d66f5`.
- Supabase CLI: `2.75.0`.
- Local Supabase Postgres: `17.6`.
- Docker engine: `29.5.2`, via Colima `0.10.3`.
- API: `http://127.0.0.1:54321`.
- Database: `127.0.0.1:54322`.
- Studio: `http://127.0.0.1:54323`.
- Mailpit: `http://127.0.0.1:54324`.
- Credentials came only from `~/Desktop/BookLingua-local-staging.env` (mode 600).
- `PIPELINE_HARDENING_V1=false` during migration/baseline tests; `enabled` only
  in the local Next process for synthetic upload tests.
- No Supabase project ref was linked. The production ref was absent from the
  process environment. Every tested endpoint was loopback. Production was not
  contacted.
- Optional local analytics/vector services were excluded due a Colima socket
  mount incompatibility. Postgres, REST, Auth, Storage, Realtime, Studio and
  Mailpit were healthy.

## Migration history audit

### Observed defects

1. The repository cannot recreate BookLingua from zero. Incremental migrations
   assume pre-existing `orders`, `files`, `temp_uploads`, `translation_chunks`
   and Storage schema/buckets. `002_feedback_glossaries_preferences.sql` fails
   first on a clean database because `orders` does not exist.
2. `20250416_add_welcome_sequence.sql` runs before the migrations that create
   `email_subscribers` (`20260401`/`20260421`).
3. `20250630_add_pipeline_version.sql` and
   `20250630_add_qa_blocked.sql` share the same migration version. Supabase
   records only the numeric prefix and rejects the second with a duplicate
   `schema_migrations` primary key.
4. The four original WB1 files all shared version `20260812`, making normal
   deployment/reset reject three of four files and making their stated order
   unenforceable.
5. The original migration set omitted the production creation migration for
   `translation_chunks`.

### Remediation performed

- Renamed the four unapplied WB1 migrations to unique ordered versions:
  `202608120001` source, `202608120002` state, `202608120003` briefs,
  `202608120004` cache.
- Updated `README_PIPELINE_HARDENING.md` with the from-zero limitation, exact
  prerequisites and a live-ledger reconciliation requirement.
- Did not rewrite the already-deployed duplicate `20250630` history. Local
  testing used explicitly documented temporary filenames plus the uncommitted
  local baseline fixture.

### Remaining release risk

Production migration ledger/schema reconciliation is mandatory. The WB1 files
are now repeatably ordered, but the repository as a whole is still not a valid
clean-reset source. That is a release blocker until a verified baseline contract
or snapshot is approved; fabricating historical migrations is not safe.

## Test matrix

| Area | Test | Expected | Actual | Result/evidence |
|---|---|---|---|---|
| Isolation | Endpoints/project ref/env | Local only | Local only; no link/ref | PASS |
| Migration | Four WB1 migrations | Ordered real Postgres apply | Applied source→state→briefs→cache | PASS after rename |
| Migration | Full clean reset | Repeatable | Fails without local baseline and historical version workaround | FAIL/BLOCKER |
| Legacy OFF | Legacy order without source/brief | Inserts/reads | Real DB accepted order/file/cache | PASS |
| Legacy OFF | Additive schema/status queries | No schema regression | Real REST/service queries worked | PASS |
| Cache | legacy-v1 and semantic-v2 identity coexist | 3 distinct rows | 3 rows; exact duplicate rejected | PASS |
| Brief | Mutation/delete | Rejected | Immutable trigger raised | PASS |
| Artifact FK | Cross-language report | Rejected | FK violation | PASS |
| Artifact check | Zero-byte artifact | Rejected | Check violation | PASS |
| Package authority | Empty caller PASS | Cannot gate | Persisted only as non-authoritative history; gate_failed | PASS after fix |
| Gate | FR pass, DE missing | gate_failed | gate_failed | PASS |
| Gate | FR pass, DE fail | gate_failed | gate_failed | PASS |
| Gate | FR pass, DE pass | ready_for_review | ready_for_review | PASS |
| Gate | FR/DE pass, ES missing | gate_failed | gate_failed | PASS |
| Gate | Latest wrong-language fabricated PASS | gate_failed | gate_failed | PASS after fix |
| Gate concurrency | Two simultaneous gate RPCs | Same atomic state | Both ready_for_review; final state ready_for_review | PASS |
| Source link | Valid atomic link | 2 files, 1 brief, temp removed | Exact result | PASS |
| Source retry | Same source after cleanup | Idempotent | Returned success, no duplicate rows | PASS |
| Source retry | Different source ID | Reject | `order_already_linked_to_other_source` | PASS after fix |
| Source rollback | Bad second brief | No partial rows | 0 files, 0 briefs, temp retained | PASS |
| Source concurrency | Two simultaneous identical links | One logical result | Both returned; 2 files, 1 brief, 0 temp | PASS |
| Storage | Bucket flags | Private | source/artifact/uploads all private | PASS |
| Storage | Anonymous public/guessed URL | Deny | HTTP 400 | PASS |
| Storage | Authenticated unauthorized read/sign | Deny | HTTP 400 / no rows | PASS |
| Storage | Service upload/read/sign | Allow | HTTP 200 and exact bytes | PASS |
| Upload ON | Valid TXT | Store bytes + metadata | HTTP 200; hash/size/path agree | PASS |
| Upload ON | Valid real DOCX | Accept | HTTP 200, 2,205 words | PASS |
| Upload ON | Valid realistic EPUB | Accept | HTTP 200, spine content extracted | PASS |
| Upload ON | Unsupported PDF | Reject | HTTP 400 | PASS |
| Upload ON | Malformed/spoofed DOCX | Reject | Rejected; changed response from 500 to 400 | PASS after fix |
| Upload | New upload identity | Non-reused | Distinct signed UUIDs | PASS |
| Validators | Realistic EPUB/DOCX variants | Required failures/pass | 10 validator tests pass | PASS |
| Build freshness | Identify current vs delayed stale build | Explicit identity | No current-build record; timestamp/UUID ordering only | FAIL/BLOCKER |
| Approval | Revalidate authoritative manifests | Fail closed | SQL begin-delivery now recomputes authority | PARTIAL |
| Email | Exactly-once external delivery | Safe retry | Resend v3 has no idempotency contract | NOT FIXED |
| Rollback | Flag OFF after additive schema | Legacy remains available | Capability boundary and legacy DB rows pass | PASS conceptually/local |

## PostgreSQL and RPC findings

### Fixed in rehearsal

1. **BLOCKER — JSONB/array mismatch.** `resolve_order_package_gate`,
   `begin_hardened_delivery` and `link_hardened_source_to_order` selected JSONB
   languages into `text[]`; real calls failed with `malformed array literal`.
   They now use JSONB and `jsonb_array_elements_text`.
2. **BLOCKER — manufactured PASS.** An empty `{}` manifest with status PASS
   moved an order to review. New `is_authoritative_package_manifest()` binds
   order/language/build, required artifact types, exact persisted artifact
   metadata and passed validation rows. Gate and delivery recompute it.
3. **HIGH — conflicting idempotent retry.** A missing temp row returned success
   for any already-linked order, even a different source ID. Retry success is
   now limited to the same persisted `source_upload_id`.

### Actual concurrency evidence

- Two simultaneous identical linkage calls both completed without duplicate or
  partial rows: exactly 2 source files, 1 brief, 0 temp rows.
- Two simultaneous order-gate calls both returned `ready_for_review`; the final
  order state was `ready_for_review`.
- The order row lock serialized gate state changes. Mid-link exceptions rolled
  back all writes.

### Unresolved blocker

No table/function records the active/current build for each order-language.
Queries use `created_at DESC, id DESC`. This cannot prove that a later-arriving
manifest belongs to the current build. The exact fix should introduce an
explicit immutable/transactional order-language run/build identity and make
artifact inserts, package authority, approval and download join through it.

## RLS and Storage findings

Migration definition and observed behavior agree:

- `booklingua-private-sources` and `booklingua-private-artifacts` are private.
- The only hardened object policies target `service_role` and the exact bucket.
- Anonymous and ordinary authenticated users could neither fetch guessed paths
  nor create signed URLs. Hardened RLS tables returned no rows.
- Service role could upload, download and sign an exact object.
- Hardened code contains no public-URL generation and customer delivery remains
  application-mediated.

Verdict: **PASS in local Supabase**. Hosted staging/production policy inventory
must still be compared after migration; local proof is not proof of live state.

## Translation brief and cache integrity

- First revision linkage, exact language/source/approval binding, immutable old
  revisions, rollback, and concurrent idempotency passed in real Postgres.
- Application loaders recompute the SHA-256 content fingerprint and reject an
  altered brief; both model passes call the same loader/fingerprint path.
- The database validates fingerprint shape/bindings but does not recompute the
  JavaScript canonical JSON hash. This is acceptable only because model loading
  fails closed; retain as a documented boundary.
- legacy-v1 and semantic-v2-shaped cache rows coexist under distinct composite
  uniqueness. Semantic-v2 was never enabled.

## Artifact/validation/manifest chain

Real FK/check tests proved report→artifact order/language/build binding,
positive size, unique artifact identity and immutable history. The new SQL
authority function proved caller metadata alone cannot yield PASS. Application
tests additionally reject wrong hash, byte size, storage path, order, language,
build, failed report and mutated bytes. Missing/mutated object checks are made
at mediated download time.

The chain remains blocked by the missing current-build identity described above.

## Realistic EPUB/DOCX validation

The 36-test suite includes realistic namespaced/nested EPUB container/OPF/
manifest/spine/nav/NCX cases, Chapter 1–12/10–11 identity, broken href/spine,
malformed nav, duplicates, empty chapters and corrupt ZIPs. DOCX cases include
content types, root/document relationships, styles, headings, split runs,
split markers/markdown, empty/duplicate chapters and corrupt packages. All 10
validator tests passed. Local HTTP upload also accepted a real DOCX and a
synthetic valid nested EPUB. Localized/custom visual heading inference remains
a WB2 semantic limitation, not claimed as solved.

## Hardening-ON and lifecycle boundary

The local application with `PIPELINE_HARDENING_V1=enabled` successfully stored
valid TXT/DOCX/EPUB binaries and authoritative metadata in private Storage.
No external model was called. Full upload→translation→builder→approval→email
cannot run because hardened artifact generation is intentionally not wired in
WB1, and approval directly invokes external Resend rather than a Mailpit adapter.
No email was sent.

Legacy compatibility remains capability-gated, but a real complete legacy
approval/download HTTP rehearsal was not safely possible without invoking the
existing email path. This is partially verified, not overstated.

## Email idempotency

Classification: **production blocker; acceptable only while hardened delivery
remains disabled**. Provider success followed by DB failure can duplicate mail.
Recommended minimum is a durable delivery ledger/outbox with deterministic event
ID and claim/send/finalize semantics, plus provider idempotency if a supported
SDK/API version is adopted. Do not enable production delivery before this is
resolved and rehearsed. No broad email subsystem was added in WB1.

## Original findings 1–19

1. Package gate: **PARTIALLY VERIFIED** — atomic/all-language passes; current-build blocker remains.
2. Artifact/download binding: **PARTIALLY VERIFIED** — authority/tamper checks pass; current-build blocker remains.
3. EPUB/DOCX validation: **VERIFIED FIXED IN STAGING** for WB1 structural scope.
4. Approval lifecycle: **PARTIALLY VERIFIED** — SQL authority passes; external-email route not end-to-end tested.
5. Upload fail-closed: **VERIFIED FIXED IN STAGING**.
6. Upload identity: **VERIFIED FIXED IN STAGING** with prior low token-expiry residual.
7. Transactional linkage: **PARTIALLY VERIFIED** — RPC/concurrency fixed; order creation remains outside RPC.
8. Immutable briefs: **VERIFIED FIXED IN STAGING**.
9. Cache isolation: **VERIFIED FIXED IN STAGING**.
10. Validator false negatives: **VERIFIED FIXED IN STAGING** for structural scope.
11. Storage privacy: **VERIFIED FIXED IN STAGING** locally.
12. Deployment boundary: **PARTIALLY VERIFIED** — flag behavior passes; migration history remains blocker.
13. Failure durability: **PARTIALLY VERIFIED**; no durable external alert/outbox.
14. Source-manifest claims: **VERIFIED FIXED IN STAGING** for integrity/advisory scope.
15. Customer package wiring: **DEFERRED TO WB2**.
16. Package authority: **VERIFIED FIXED IN STAGING** after rehearsal remediation, subject to current-build fix.
17. Customer assets: **DEFERRED TO WB2**.
18. Migration domains/history: **NOT FIXED** overall; WB1 versions fixed, historical baseline/duplicate remains.
19. Semantic-v2: **DEFERRED TO WB2** and remained disabled.

## New findings

- **BLOCKER:** no explicit current build/run identity per order-language.
- **BLOCKER:** repository migration history cannot reproduce a clean database or
  deploy deterministically without ledger reconciliation/baseline contract.
- **HIGH (fixed):** JSONB languages crashed hardened RPCs.
- **HIGH (fixed):** caller-supplied empty PASS could make order reviewable.
- **HIGH (fixed):** conflicting source retry incorrectly returned success.
- **MEDIUM (fixed):** malformed ZIP uploads returned generic HTTP 500; now 400.
- **HIGH / production blocker:** delivery email lacks exactly-once semantics.

## Fixes made during rehearsal

- Unique ordered WB1 migration versions and deployment-prerequisite documentation.
- JSONB-correct gate/delivery/linkage RPCs.
- Database-authoritative package verification used by gate and delivery.
- Same-source-only idempotent linkage retry.
- Malformed hardened source packages return HTTP 400.
- Reusable real-Supabase staging probes for schema, linkage and gate behavior.

## Validation

- `npm test`: **36 passed, 0 failed**.
- `npx tsc --noEmit`: **PASS**.
- `npm run build`: **PASS** (existing Next config and Browserslist warnings).
- `git diff --check`: **PASS**.
- Real SQL probe assertions: schema 8/8, linkage 4/4, package matrix 5/5.
- Concurrency: source linkage PASS; package gate PASS.
- No production data, production API, real model, real customer or real email was used.

## Rollback and production prerequisites

Schema-first with the flag OFF preserved synthetic legacy rows. Application
rollback to flag OFF is viable because migrations are additive; hardened-only
rows remain unused. Migration history, immutable rows and Storage objects are
not automatically rolled back and must not be destructively removed.

Before merge:

1. Add explicit current order-language build/run identity and use it in artifact
   persistence, authority, gate, approval and download.
2. Add real concurrent stale/current PASS/FAIL regression tests.
3. Reconcile the production Supabase migration ledger and approve a baseline
   prerequisite contract/snapshot; prove a clean rehearsal without ad hoc names.
4. Re-run the entire SQL/RLS/Storage matrix.
5. Independently review the rehearsal commits.

Before production enablement, additionally implement/rehearse exactly-once
delivery and complete the later package-builder/customer-deliverables wiring.

## Exact next action

Remediate the explicit current-build identity and migration-ledger/baseline
contract on this WB1 branch, then repeat the disposable Supabase rehearsal.
Do not merge and do not begin WB2 yet.
