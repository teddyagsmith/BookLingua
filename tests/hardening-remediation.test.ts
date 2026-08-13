import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import path from 'path'
import { createHash } from 'crypto'
import { issueUploadIdentity, verifyUploadIdentity } from '../lib/upload-identity'
import { downloadOriginalBinary } from '../lib/source-binary'
import { buildTranslationBrief, assertTranslationBriefForSource, translationBriefFingerprint } from '../lib/translation-brief'
import { evaluatePackageManifest, PackageManifestV1 } from '../lib/package-manifest'
import { selectManifestArtifact, verifyStoredArtifact } from '../lib/hardened-artifact'
import { ARTIFACT_BUCKET } from '../lib/artifact-store'
import { assertSupportedSourcePackage } from '../lib/source-upload-validation'
import AdmZip from 'adm-zip'
import { assertHardenedUploadReady } from '../lib/hardened-upload'

process.env.STRIPE_WEBHOOK_SECRET ||= 'synthetic-test-secret'

test('server-issued upload identities reject malformed, guessed and cross-session tokens', () => {
  const first = issueUploadIdentity(); const second = issueUploadIdentity()
  assert.equal(verifyUploadIdentity(first.uploadId, first.uploadToken), true)
  assert.equal(verifyUploadIdentity(first.uploadId, second.uploadToken), false)
  assert.equal(verifyUploadIdentity('../customer', first.uploadToken), false)
})

test('source retrieval verifies persisted SHA-256', async () => {
  const bytes = Buffer.from('synthetic manuscript')
  const supabase: any = { storage: { from: () => ({ download: async () => ({ data: new Blob([bytes]), error: null }) }) } }
  await assert.doesNotReject(downloadOriginalBinary(supabase, 'safe/path', createHash('sha256').update(bytes).digest('hex'), 'private'))
  await assert.rejects(downloadOriginalBinary(supabase, 'safe/path', 'bad-hash', 'private'), /hash mismatch/)
})

test('hardened upload package preflight rejects malformed EPUB and DOCX containers', () => {
  assert.throws(() => assertSupportedSourcePackage('epub', Buffer.from('not a zip')), /readable ZIP/)
  const weak: any = new AdmZip(); weak.addFile('word/document.xml', Buffer.from('<document/>'))
  assert.throws(() => assertSupportedSourcePackage('docx', weak.toBuffer()), /required package parts/)
  const epub: any = new AdmZip(); epub.addFile('META-INF/container.xml', Buffer.from('<container/>')); epub.addFile('OPS/book.opf', Buffer.from('<package/>'))
  assert.doesNotThrow(() => assertSupportedSourcePackage('epub', epub.toBuffer()))
})

test('checkout preflight binds private source metadata, manifest, approval and session identity', () => {
  const ready: any = { session_id: 'session-a', file_format: '.epub', word_count: 1000, source_storage_path: 'session-a/original.epub', source_storage_bucket: 'booklingua-private-sources', source_sha256: 'a'.repeat(64), source_size_bytes: 500, source_manifest: { sourceHash: 'a'.repeat(64) }, glossary_saved_at: '2026-08-12T12:00:00.000Z' }
  assert.doesNotThrow(() => assertHardenedUploadReady(ready, 'session-a'))
  assert.throws(() => assertHardenedUploadReady({ ...ready, session_id: 'session-b' }, 'session-a'), /missing/)
  assert.throws(() => assertHardenedUploadReady({ ...ready, source_manifest: { sourceHash: 'b'.repeat(64) } }, 'session-a'), /not bound/)
  assert.throws(() => assertHardenedUploadReady({ ...ready, glossary_saved_at: null }, 'session-a'), /not approved/)
})

test('brief validation rejects wrong source, language and altered persisted content', () => {
  const brief = buildTranslationBrief({ language: 'fr', sourceManifestFingerprint: 'source-a', approvedAt: '2026-08-12T00:00:00.000Z', decisions: [], revision: 1 })
  assert.doesNotThrow(() => assertTranslationBriefForSource(brief, 'fr', 'source-a'))
  assert.throws(() => assertTranslationBriefForSource(brief, 'de', 'source-a'), /language/)
  assert.throws(() => assertTranslationBriefForSource(brief, 'fr', 'source-b'), /different source/)
  const fingerprint = translationBriefFingerprint(brief)
  assert.notEqual(translationBriefFingerprint({ ...brief, items: [{ id: 'x', sourceTerm: 'term', authorDecision: 'keep', targetInstruction: 'Keep' }] }), fingerprint)
})

test('a package cannot pass with duplicate, stale-build or caller-only artifacts', () => {
  const types = ['translation_brief','pass1_docx','review_docx','translation_notes','chapter_map_docx','chapter_map_csv','upload_guide','final_epub'] as const
  const artifacts = types.map((type, index) => ({ id: `a${index}`, buildId: 'build-a', type, required: true, filename: `${type}.bin`, storageBucket: 'private', storagePath: `${type}`, sha256: 'abc', sizeBytes: 10, validationStatus: 'pass' as const }))
  const manifest: PackageManifestV1 = { schemaVersion: '1.0', orderId: 'o', language: 'fr', buildId: 'build-a', status: 'building', entitlements: { sourceFormat: 'epub', launchPack: false, dualFormat: false }, artifacts, errors: [], generatedAt: 'now' }
  assert.equal(evaluatePackageManifest(manifest).status, 'pass')
  assert.equal(evaluatePackageManifest({ ...manifest, artifacts: [...artifacts, artifacts[0]] }).status, 'fail')
  assert.equal(evaluatePackageManifest({ ...manifest, artifacts: artifacts.map(a => ({ ...a, buildId: 'stale' })) }).status, 'fail')
})

test('artifact verification rejects stale ownership, failed report, metadata and byte tampering', () => {
  const bytes = Buffer.from('validated synthetic artifact')
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  const artifact: any = { id: 'artifact-1', buildId: 'build-a', type: 'final_epub', required: true, filename: 'book.epub', storageBucket: ARTIFACT_BUCKET, storagePath: 'o/fr/build-a/final_epub/book.epub', sha256, sizeBytes: bytes.length, validationStatus: 'pass', validationReportId: 'report-1' }
  const record: any = { id: 'artifact-1', order_id: 'o', language: 'fr', build_id: 'build-a', artifact_type: 'final_epub', storage_bucket: ARTIFACT_BUCKET, storage_path: artifact.storagePath, filename: artifact.filename, sha256, size_bytes: bytes.length, validation_status: 'pass', validation_reports: [{ passed: true }] }
  const verify = (overrides: any = {}, changedBytes = bytes) => verifyStoredArtifact({ manifestArtifact: artifact, record: { ...record, ...overrides }, orderId: 'o', language: 'fr', buildId: 'build-a', type: 'final_epub', bytes: changedBytes })
  assert.doesNotThrow(() => verify())
  assert.throws(() => verify({ order_id: 'other' }), /ownership/)
  assert.throws(() => verify({ language: 'de' }), /ownership/)
  assert.throws(() => verify({ build_id: 'stale' }), /ownership/)
  assert.throws(() => verify({ validation_reports: [{ passed: false }] }), /validation/)
  assert.throws(() => verify({ size_bytes: bytes.length + 1 }), /metadata/)
  assert.throws(() => verify({}, Buffer.from('tampered')), /integrity/)
})

test('manifest artifact selection rejects failed and ambiguous manifests', () => {
  const base: any = { id: 'a', buildId: 'b', type: 'review_docx', required: true, filename: 'r.docx', storageBucket: ARTIFACT_BUCKET, storagePath: 'p', sha256: 'h', sizeBytes: 1, validationStatus: 'pass' }
  const manifest: any = { schemaVersion: '1.0', orderId: 'o', language: 'fr', buildId: 'b', status: 'pass', entitlements: { sourceFormat: 'docx', launchPack: false, dualFormat: false }, artifacts: [base], errors: [], generatedAt: 'now' }
  assert.equal(selectManifestArtifact(manifest, 'review_docx').id, 'a')
  assert.throws(() => selectManifestArtifact({ ...manifest, status: 'fail' }, 'review_docx'), /not passed/)
  assert.throws(() => selectManifestArtifact({ ...manifest, artifacts: [base, { ...base, id: 'a2' }] }, 'review_docx'), /ambiguous/)
})

test('migrations encode atomic all-language gate, immutable briefs, versioned cache and private storage', () => {
  const migrations = path.join(process.cwd(), 'supabase/migrations')
  const state = fs.readFileSync(path.join(migrations, '202608120002_pipeline_hardening_state.sql'), 'utf8')
  const briefs = fs.readFileSync(path.join(migrations, '202608120003_pipeline_hardening_briefs.sql'), 'utf8')
  const cache = fs.readFileSync(path.join(migrations, '202608120004_pipeline_hardening_cache.sql'), 'utf8')
  const source = fs.readFileSync(path.join(migrations, '202608120001_pipeline_hardening_source.sql'), 'utf8')
  assert.match(state, /select languages[\s\S]*for update/i)
  assert.match(state, /jsonb_array_elements_text\(v_languages\)/)
  assert.match(state, /for update/)
  assert.match(state, /begin_hardened_delivery/)
  assert.match(state, /foreign key\(validation_report_id, order_id, language, build_id\)/)
  assert.match(state, /build_id uuid not null/)
  assert.match(briefs, /before update or delete/)
  assert.match(briefs, /link_hardened_source_to_order/)
  assert.match(state, /jsonb_array_elements_text\(v_languages\)/)
  assert.match(briefs, /jsonb_array_elements_text\(v_languages\)/)
  assert.match(state, /is_authoritative_package_manifest/)
  assert.match(briefs, /source_upload_id = p_session_id/)
  assert.match(cache, /translation_chunks_versioned_identity_key/)
  assert.match(source, /booklingua-private-sources/)
  assert.match(source, /public\)\s*values[\s\S]*false/i)
  assert.match(source, /translation_requested_at/)
})

test('hardened behavior defaults disabled and admin supports both review states', () => {
  const capability = fs.readFileSync(path.join(process.cwd(), 'lib/pipeline-capabilities.ts'), 'utf8')
  const admin = fs.readFileSync(path.join(process.cwd(), 'app/admin/page.tsx'), 'utf8')
  const approve = fs.readFileSync(path.join(process.cwd(), 'app/api/admin/orders/[orderId]/approve/route.ts'), 'utf8')
  assert.match(capability, /=== 'enabled'/)
  assert.match(admin, /pending_review', 'ready_for_review/)
  assert.match(approve, /pending_review', 'ready_for_review/)
})
