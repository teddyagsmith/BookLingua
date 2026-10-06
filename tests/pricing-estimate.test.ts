import test from 'node:test'
import assert from 'node:assert/strict'
import { estimateDetails, parseEstimateRequest } from '../lib/pricing-estimate'

test('estimate requests validate, normalise, and calculate prices server-side', () => {
  const request = parseEstimateRequest({ email: ' Reader@Example.com ', wordCount: 72_450, languages: ['de', 'fr', 'it'], marketingConsent: true, utm: { utm_campaign: 'autumn_ads' } })
  assert.ok(request)
  assert.equal(request.email, 'reader@example.com')
  assert.equal(request.marketingConsent, true)
  assert.equal(request.utm.utm_campaign, 'autumn_ads')
  assert.equal(estimateDetails(request).price.total, 402.3)
})

test('estimate requests reject invalid email, price inputs, and languages', () => {
  assert.equal(parseEstimateRequest({ email: 'bad', wordCount: 1000, languages: ['de'] }), null)
  assert.equal(parseEstimateRequest({ email: 'a@b.com', wordCount: 150001, languages: ['de'] }), null)
  assert.equal(parseEstimateRequest({ email: 'a@b.com', wordCount: 1000, languages: ['unknown'] }), null)
  assert.equal(parseEstimateRequest({ email: 'a@b.com', wordCount: 1000, languages: ['de', 'de'] }), null)
})

test('estimate requests retain persisted first-touch attribution', () => {
  const request = parseEstimateRequest({
    email: 'reader@example.com', wordCount: 50_000, languages: ['de'],
    utm: { utm_source: 'meta', utm_medium: 'paid_social', utm_campaign: 'booklingua_author_test', utm_content: 'static_estimate' },
  })
  assert.equal(request?.utm.utm_source, 'meta')
  assert.equal(request?.utm.utm_campaign, 'booklingua_author_test')
  assert.equal(request?.utm.utm_content, 'static_estimate')
})
