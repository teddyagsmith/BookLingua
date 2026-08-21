import assert from 'node:assert/strict'
import test from 'node:test'
import { BUNDLE_DISCOUNT_PCT, bundleDiscountPercent } from '../lib/bundle-pricing'

test('bundle discounts protect proofreading margin and cap at six languages', () => {
  assert.deepEqual(BUNDLE_DISCOUNT_PCT, { 1: 0, 2: 7, 3: 10, 4: 12, 5: 15, 6: 20 })
  assert.deepEqual([1, 2, 3, 4, 5, 6, 9].map(bundleDiscountPercent), [0, 7, 10, 12, 15, 20, 20])
})
