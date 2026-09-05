import test from 'node:test'
import assert from 'node:assert/strict'
import { buildTranslationBrief, renderTranslationBriefPrompt, translationBriefFingerprint } from '../lib/translation-brief'

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
  assert.match(pass1Prompt, /READER REGISTER/)
})

test('German self-help defaults formal and fiction defaults informal with an author override',()=>{
  const base={language:'de',sourceManifestFingerprint:'source',approvedAt:'2026-08-13T00:00:00.000Z',decisions:[]}
  assert.equal(buildTranslationBrief({...base,genre:'Self-Help'}).readerRegister,'formal_sie')
  assert.equal(buildTranslationBrief({...base,genre:'Romance'}).readerRegister,'informal_du')
  assert.equal(buildTranslationBrief({...base,genre:'Romance',readerRegister:'formal_sie'}).readerRegister,'formal_sie')
})

test('brief fingerprint is stable across PostgreSQL JSONB key reordering', () => {
  const brief = buildTranslationBrief({ language: 'fr', sourceManifestFingerprint: 'source', approvedAt: '2026-08-13T00:00:00.000Z', decisions: [{ term: 'Moonroot', decision: 'keep' }] })
  const reordered: any = { items: brief.items.map(item => ({ targetInstruction:item.targetInstruction, authorDecision:item.authorDecision, sourceTerm:item.sourceTerm, id:item.id })), readerRegister:brief.readerRegister, approvalSource:brief.approvalSource, schemaVersion:brief.schemaVersion, approvedAt:brief.approvedAt, sourceManifestFingerprint:brief.sourceManifestFingerprint, revision:brief.revision, language:brief.language }
  assert.equal(translationBriefFingerprint(reordered), translationBriefFingerprint(brief))
})
