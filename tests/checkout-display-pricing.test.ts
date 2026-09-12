import assert from 'node:assert/strict'
import test from 'node:test'
import { checkoutDisplayPricing, launchPackPrice } from '../lib/checkout-display-pricing'

test('launch pack display price follows the selected language count', () => {
  assert.equal(launchPackPrice(1), 29)
  assert.equal(launchPackPrice(2), 49)
  assert.equal(launchPackPrice(9), 49)
})

test('percentage voucher immediately updates the displayed saving and total', () => {
  const pricing = checkoutDisplayPricing({
    basePrice: 149,
    languageCount: 1,
    selectedUpsells: [],
    voucher: { type: 'percent', discount: 20 },
  })
  assert.equal(pricing.voucherDiscount, 29.8)
  assert.equal(pricing.finalTotal, 119.2)
})

test('launch pack updates the total but remains outside the voucher discount', () => {
  const pricing = checkoutDisplayPricing({
    basePrice: 149,
    languageCount: 2,
    selectedUpsells: ['launch-pack'],
    voucher: { type: 'percent', discount: 20 },
  })
  assert.equal(pricing.translationTotal, 277.14)
  assert.equal(pricing.addOnTotal, 49)
  assert.equal(pricing.voucherDiscount, 55.428)
  assert.equal(pricing.finalTotal, 270.712)
})

test('fixed voucher recalculates against the current voucherable subtotal', () => {
  const pricing = checkoutDisplayPricing({
    basePrice: 99,
    languageCount: 1,
    selectedUpsells: ['dual-format'],
    voucher: { type: 'fixed', discount: 50 },
  })
  assert.equal(pricing.voucherableSubtotal, 128)
  assert.equal(pricing.voucherDiscount, 50)
  assert.equal(pricing.finalTotal, 78)
})
