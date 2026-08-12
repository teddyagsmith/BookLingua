import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import path from 'path'
import { createHash } from 'crypto'
import { issueUploadIdentity, verifyUploadIdentity } from '../lib/upload-identity'
import { downloadOriginalBinary } from '../lib/source-binary'
import { buildTranslationBrief, assertTranslationBriefForSource, translationBriefFingerprint } from '../lib/translation-brief'
import { evaluatePackageManifest, PackageManifestV1 } from '../lib/package-manifest'

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

test('migrations encode atomic all-language gate, immutable briefs, versioned cache and private storage', () => {
  const migrations = path.join(process.cwd(), 'supabase/migrations')
  const state = fs.readFileSync(path.join(migrations, '20260812_pipeline_hardening_state.sql'), 'utf8')
  const briefs = fs.readFileSync(path.join(migrations, '20260812_pipeline_hardening_briefs.sql'), 'utf8')
  const cache = fs.readFileSync(path.join(migrations, '20260812_pipeline_hardening_cache.sql'), 'utf8')
  const source = fs.readFileSync(path.join(migrations, '20260812_pipeline_hardening_source.sql'), 'utf8')
  assert.match(state, /select languages[\s\S]*for update/i)
  assert.match(state, /unnest\(v_languages\)/)
  assert.match(state, /build_id uuid not null/)
  assert.match(briefs, /before update or delete/)
  assert.match(briefs, /link_hardened_source_to_order/)
  assert.match(cache, /translation_chunks_versioned_identity_key/)
  assert.match(source, /booklingua-private-sources/)
  assert.match(source, /public\)\s*values[\s\S]*false/i)
})

test('hardened behavior defaults disabled and admin supports both review states', () => {
  const capability = fs.readFileSync(path.join(process.cwd(), 'lib/pipeline-capabilities.ts'), 'utf8')
  const admin = fs.readFileSync(path.join(process.cwd(), 'app/admin/page.tsx'), 'utf8')
  const approve = fs.readFileSync(path.join(process.cwd(), 'app/api/admin/orders/[orderId]/approve/route.ts'), 'utf8')
  assert.match(capability, /=== 'enabled'/)
  assert.match(admin, /pending_review', 'ready_for_review/)
  assert.match(approve, /pending_review', 'ready_for_review/)
})
