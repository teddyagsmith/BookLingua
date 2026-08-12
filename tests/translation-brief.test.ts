import test from 'node:test'
import assert from 'node:assert/strict'
import { buildTranslationBrief, renderTranslationBriefPrompt } from '../lib/translation-brief'

test('brief is versioned per language and tied to the source fingerprint', () => {
  const brief = buildTranslationBrief({
    language: 'fr',
    sourceManifestFingerprint: 'abc123',
    approvedAt: '2026-08-12T00:00:00.000Z',
    decisions: [
      { term: 'Moonroot', type: 'invented_term', decision: 'keep' },
      { term: 'miles', type: 'measurement', decision: 'replace', replacement: 'kilomètres' },
    ],
  })
  assert.equal(brief.schemaVersion, '1.0')
  assert.equal(brief.language, 'fr')
  assert.equal(brief.sourceManifestFingerprint, 'abc123')
  assert.equal(brief.items.length, 2)
})

test('the same immutable brief renders explicit instructions for both model passes', () => {
  const brief = buildTranslationBrief({
    language: 'fr', sourceManifestFingerprint: 'abc123', approvedAt: '2026-08-12T00:00:00.000Z',
    decisions: [{ term: 'Moonroot', decision: 'keep' }],
  })
  const pass1Prompt = renderTranslationBriefPrompt(brief)
  const pass2Prompt = renderTranslationBriefPrompt(brief)
  assert.equal(pass1Prompt, pass2Prompt)
  assert.match(pass1Prompt, /Moonroot/)
  assert.match(pass1Prompt, /abc123/)
})
