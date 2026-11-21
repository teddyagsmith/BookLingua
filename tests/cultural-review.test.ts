import test from 'node:test'
import assert from 'node:assert/strict'
import { prioritiseReviewTerms, splitManuscriptForReview } from '../lib/cultural-term-extractor'

test('whole-manuscript review splits every word into bounded sections', () => {
  const source = Array.from({ length: 25_001 }, (_, index) => `word${index + 1}`).join(' ')
  const chunks = splitManuscriptForReview(source, 12_000)

  assert.equal(chunks.length, 3)
  assert.equal(chunks[0].split(/\s+/).length, 12_000)
  assert.equal(chunks[1].split(/\s+/).length, 12_000)
  assert.equal(chunks[2].split(/\s+/).length, 1_001)
  assert.equal(chunks.join(' ').split(/\s+/).length, 25_001)
})

test('review prioritisation deduplicates and favours recurring terms', () => {
  const terms: any[] = [
    { term: 'Blackmere', contexts: ['At Blackmere.'], category: 'place_name', whyItMatters: 'place', recommendation: 'Keep.' },
    { term: 'Sheriff', contexts: ['The sheriff arrived.'], category: 'title_honorific', whyItMatters: 'office', recommendation: 'Keep.' },
    { term: 'Blackmere', contexts: ['Back to Blackmere.', 'Blackmere was silent.'], category: 'place_name', whyItMatters: 'place', recommendation: 'Keep.' },
  ]
  const prioritised = prioritiseReviewTerms(terms, 2)

  assert.deepEqual(prioritised.map(term => term.term), ['Blackmere', 'Sheriff'])
  assert.equal(prioritised[0].contexts.length, 2)
})
