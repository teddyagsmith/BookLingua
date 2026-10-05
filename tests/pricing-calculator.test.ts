import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateTranslationPrice, pricingTierForWordCount, WORD_TIERS } from '../lib/pricing'
import { parseWordCount } from '../components/PricingCalculator'

test('calculator word-count input accepts commas and spaces but rejects invalid values', () => {
  assert.equal(parseWordCount('72,450'), 72_450)
  assert.equal(parseWordCount(' 72 450 '), 72_450)
  assert.equal(parseWordCount(''), null)
  assert.equal(parseWordCount('0'), null)
  assert.equal(parseWordCount('-12'), null)
  assert.equal(parseWordCount('12k'), null)
})

test('word-count boundaries map to the unchanged pricing bands', () => {
  assert.equal(pricingTierForWordCount(1)?.basePrice, 99)
  assert.equal(pricingTierForWordCount(40_000)?.basePrice, 99)
  assert.equal(pricingTierForWordCount(40_001)?.basePrice, 149)
  assert.equal(pricingTierForWordCount(80_000)?.basePrice, 149)
  assert.equal(pricingTierForWordCount(80_001)?.basePrice, 199)
  assert.equal(pricingTierForWordCount(150_000)?.basePrice, 199)
  assert.equal(pricingTierForWordCount(150_001), null)
  assert.equal(pricingTierForWordCount(0), null)
  assert.equal(pricingTierForWordCount(-1), null)
  assert.equal(pricingTierForWordCount(Number.NaN), null)
})

test('language-count discounts and totals are exact through and beyond six languages', () => {
  const expected = [0, 7, 10, 12, 15, 20, 20]
  expected.forEach((discountPercent, index) => {
    assert.equal(calculateTranslationPrice(72_450, index + 1)?.discountPercent, discountPercent)
  })
  assert.equal(calculateTranslationPrice(72_450, 0), null)
})

test('specified 72,450-word, three-language example totals $402.30', () => {
  assert.deepEqual(calculateTranslationPrice(72_450, 3), {
    tier: WORD_TIERS.medium,
    languageCount: 3,
    subtotal: 447,
    discountPercent: 10,
    discountAmount: 44.7,
    total: 402.3,
  })
})
