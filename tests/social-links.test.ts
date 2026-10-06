import assert from 'node:assert/strict'
import test from 'node:test'
import { BOOKLINGUA_FACEBOOK_URL, FACEBOOK_FOLLOW_EMAIL_HTML } from '../lib/social-links'

test('BookLingua Facebook CTA uses the official page URL', () => {
  assert.equal(BOOKLINGUA_FACEBOOK_URL, 'https://www.facebook.com/BookLinguaBooks')
  assert.match(FACEBOOK_FOLLOW_EMAIL_HTML, /Follow/)
  assert.match(FACEBOOK_FOLLOW_EMAIL_HTML, new RegExp(BOOKLINGUA_FACEBOOK_URL.replaceAll('.', '\\.')))
})
