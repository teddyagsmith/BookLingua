import test from 'node:test'
import assert from 'node:assert/strict'
import { estimateModelCostUsd, MODEL_PRICING_VERSION } from '../lib/model-pricing'

test('documented Sonnet 5 and Opus 5 token pricing is centralized and deterministic', () => {
  assert.deepEqual(estimateModelCostUsd('claude-sonnet-5', 1_000_000, 1_000_000), { cost: 12, pricingVersion: MODEL_PRICING_VERSION })
  assert.deepEqual(estimateModelCostUsd('claude-opus-5', 1_000_000, 1_000_000), { cost: 30, pricingVersion: MODEL_PRICING_VERSION })
  assert.equal(estimateModelCostUsd('unknown', 1, 1), null)
})
