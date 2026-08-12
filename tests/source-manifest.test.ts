import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSourceManifest, sha256 } from '../lib/source-manifest'

test('source manifest records immutable hash and ordered headings', () => {
  const binary = Buffer.from('synthetic source bytes')
  const manifest = buildSourceManifest({
    binary,
    extractedText: '# Chapter 10\n\nBody ten.\n\n# Chapter 11\n\nBody eleven.',
    format: 'epub',
    filename: 'synthetic.epub',
    wordCount: 8,
    generatedAt: '2026-08-12T00:00:00.000Z',
  })

  assert.equal(manifest.sourceHash, sha256(binary))
  assert.equal(manifest.schemaVersion, '1.0')
  assert.deepEqual(manifest.headings.map(h => h.title), ['Chapter 10', 'Chapter 11'])
  assert.equal(manifest.chapterCount, 2)
  assert.equal(manifest.blockCount, 4)
  assert.equal(manifest.parserStatus, 'reliable')
})

test('TXT manifests remain usable without pretending structure is reliable', () => {
  const manifest = buildSourceManifest({
    binary: Buffer.from('Plain text without headings.'),
    extractedText: 'Plain text without headings.',
    format: 'txt',
    filename: 'synthetic.txt',
    wordCount: 4,
  })

  assert.equal(manifest.parserStatus, 'limited')
  assert.equal(manifest.chapterCount, 0)
  assert.ok(manifest.parserConfidence > 0)
})
