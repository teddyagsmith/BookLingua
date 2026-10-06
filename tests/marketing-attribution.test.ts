import assert from 'node:assert/strict'
import test from 'node:test'
import { attributionFromLocation, hasCampaignAttribution, sanitizeAttribution } from '../lib/marketing-attribution'

test('extracts Meta UTM values and fbclid from the landing URL', () => {
  const attribution = attributionFromLocation(
    'https://booklingua.io/pricing?utm_source=meta&utm_medium=paid_social&utm_campaign=booklingua_author_test&utm_content=static_estimate&fbclid=abc123',
    'https://facebook.com/',
    '2026-10-06T12:00:00.000Z',
  )
  assert.equal(attribution.utm_source, 'meta')
  assert.equal(attribution.utm_medium, 'paid_social')
  assert.equal(attribution.utm_campaign, 'booklingua_author_test')
  assert.equal(attribution.utm_content, 'static_estimate')
  assert.equal(attribution.fbclid, 'abc123')
  assert.equal(attribution.referrer, 'https://facebook.com/')
  assert.equal(hasCampaignAttribution(attribution), true)
})

test('sanitizes untrusted attribution and recognizes direct traffic', () => {
  const attribution = sanitizeAttribution({ utm_source: '  meta  ', utm_campaign: 123, landing_page: 'x'.repeat(1200) })
  assert.equal(attribution.utm_source, 'meta')
  assert.equal(attribution.utm_campaign, null)
  assert.equal(attribution.landing_page?.length, 1000)
  assert.equal(hasCampaignAttribution(attribution), true)
})
