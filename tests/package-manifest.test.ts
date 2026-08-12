import test from 'node:test'
import assert from 'node:assert/strict'
import { PackageArtifact, PackageManifestV1, evaluatePackageManifest } from '../lib/package-manifest'
import { renderCustomerDeliveryEmail, renderReviewEmail } from '../lib/email-templates'
import { buildPass1Docx, buildReviewContractDocx, REVIEW_LEGEND } from '../lib/review-contract'

function artifact(type: PackageArtifact['type']): PackageArtifact {
  return { id: `id-${type}`, buildId: 'build-1', type, required: true, filename: `${type}.bin`, storageBucket: 'book-files', storagePath: `path/${type}`, sha256: 'abc', sizeBytes: 10, validationStatus: 'pass' }
}

function manifest(types: PackageArtifact['type'][]): PackageManifestV1 {
  return { schemaVersion: '1.0', orderId: 'synthetic', language: 'fr', buildId: 'build-1', status: 'building', entitlements: { sourceFormat: 'epub', launchPack: false, dualFormat: false }, artifacts: types.map(artifact), errors: [], generatedAt: '2026-08-12T00:00:00Z' }
}

const requiredEpub = ['translation_brief', 'pass1_docx', 'review_docx', 'translation_notes', 'chapter_map_docx', 'chapter_map_csv', 'upload_guide', 'final_epub'] as PackageArtifact['type'][]

test('missing promised or purchased artifact makes package fail', () => {
  assert.equal(evaluatePackageManifest(manifest(requiredEpub)).status, 'pass')
  const missing = evaluatePackageManifest(manifest(requiredEpub.filter(type => type !== 'chapter_map_csv')))
  assert.equal(missing.status, 'fail')
  assert.match(missing.errors.join(' '), /chapter_map_csv/)
  const launch = manifest(requiredEpub)
  launch.entitlements.launchPack = true
  assert.match(evaluatePackageManifest(launch).errors.join(' '), /launch_pack/)
})

test('review email states PASS or exact FAIL reasons', () => {
  assert.match(renderReviewEmail({ bookTitle: 'Synthetic', adminUrl: 'https://example.test/admin', manifest: manifest(requiredEpub) }).subject, /^PASS/)
  const failed = renderReviewEmail({ bookTitle: 'Synthetic', adminUrl: 'https://example.test/admin', manifest: manifest([]) })
  assert.match(failed.subject, /^FAIL/)
  assert.match(failed.html, /Missing required artifact/)
})

test('customer email refuses failed packages and never invents links', () => {
  assert.throws(() => renderCustomerDeliveryEmail({ authorName: 'Author', bookTitle: 'Synthetic', manifest: manifest([]), artifactUrls: {} }), /failed package/)
  assert.throws(() => renderCustomerDeliveryEmail({ authorName: 'Author', bookTitle: 'Synthetic', manifest: manifest(requiredEpub), artifactUrls: {} }), /Missing delivery URL/)
})

test('Pass 1 and deterministic Review DOCX are separate artifacts with one legend', async () => {
  const pass1 = await buildPass1Docx('First pass text.', 'Synthetic', 'French')
  const review = await buildReviewContractDocx('Before [[ORIGINAL: old words]]new words after.', 'Synthetic', 'French')
  assert.ok(pass1.length > 0)
  assert.ok(review.length > 0)
  assert.match(REVIEW_LEGEND, /Pass 1/)
  assert.notDeepEqual(pass1, review)
})
