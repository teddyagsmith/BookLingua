import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

test('MailerLite Phase 1 uses the BookLingua groups and preserves unsubscribes', () => {
  const client = read('lib/mailerlite.ts')
  assert.match(client, /201489262774846513/)
  assert.match(client, /201489278095590589/)
  assert.doesNotMatch(client, /status:\s*['"]active['"]/)
  assert.match(client, /BOOKLINGUA_MAILERLITE_API_KEY/)
})

test('newsletter signup stores locally before syncing MailerLite', () => {
  const route = read('app/api/subscribe/route.ts')
  assert.match(route, /from\('email_subscribers'\)/)
  assert.match(route, /subscribed_at:\s*now/)
  assert.match(route, /addGeneralSubscriber/)
})

test('scorecard marketing remains optional and its MailerLite result is recoverable', () => {
  const form = read('app/language-scorecard/ScorecardSignup.tsx')
  const route = read('app/api/scorecard-lead/route.ts')
  assert.doesNotMatch(form, /name="marketingConsent"[^>]*required/)
  assert.match(route, /addScorecardSubscriber/)
  assert.doesNotMatch(route, /if \(marketingConsent\)\s*{\s*try/)
  assert.match(route, /marketingConsent:\s*Boolean/)
  assert.match(route, /MailerLite scorecard sync failed/)
  assert.match(route, /utmMedium/)
  assert.match(route, /utmCampaign/)
  assert.match(route, /utmContent/)
})

test('MailerLite subscriber sync preserves all UTM attribution fields', () => {
  const client = read('lib/mailerlite.ts')
  assert.match(client, /utm_source: input\.utmSource/)
  assert.match(client, /utm_medium: input\.utmMedium/)
  assert.match(client, /utm_campaign: input\.utmCampaign/)
  assert.match(client, /utm_content: input\.utmContent/)
})

test('scorecard is available immediately and also delivered by follow-up email', () => {
  const form = read('app/language-scorecard/ScorecardSignup.tsx')
  const delivery = read('app/api/scorecard-lead/route.ts')
  assert.match(form, /router\.push\('\/scorecard\?source=website_signup'\)/)
  assert.match(form, /fbq\?\.\('track', 'Lead', \{ content_name: 'Language scorecard' \}\)/)
  assert.match(delivery, /subject:\s*'Your free BookLingua language scorecard'/)
  assert.match(delivery, /Open your scorecard/)
})
