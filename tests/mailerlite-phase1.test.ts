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

test('newsletter signup stores consent and attribution before syncing MailerLite', () => {
  const route = read('app/api/subscribe/route.ts')
  assert.match(route, /marketing_consent:\s*true/)
  assert.match(route, /utm_source:/)
  assert.match(route, /mailerlite_sync_status:\s*'pending'/)
  assert.match(route, /addGeneralSubscriber/)
})

test('scorecard marketing remains optional and its MailerLite result is recoverable', () => {
  const form = read('app/language-scorecard/ScorecardSignup.tsx')
  const route = read('app/api/scorecard-lead/route.ts')
  assert.doesNotMatch(form, /name="marketingConsent"[^>]*required/)
  assert.match(route, /addScorecardSubscriber/)
  assert.doesNotMatch(route, /if \(marketingConsent\)\s*{\s*try/)
  assert.match(route, /marketingConsent:\s*Boolean/)
  assert.match(route, /mailerlite_sync_status:\s*'failed'/)
})

test('scorecard is delivered by email rather than exposed immediately after signup', () => {
  const form = read('app/language-scorecard/ScorecardSignup.tsx')
  const confirmation = read('app/scorecard-sent/page.tsx')
  const delivery = read('app/api/scorecard-lead/route.ts')
  assert.match(form, /router\.push\('\/scorecard-sent'\)/)
  assert.doesNotMatch(form, /router\.push\('\/scorecard[?'\)]/)
  assert.match(confirmation, /Check your inbox/)
  assert.doesNotMatch(confirmation, /Download the scorecard/)
  assert.match(delivery, /subject:\s*'Your free BookLingua language scorecard'/)
  assert.match(delivery, /Open your scorecard/)
})
