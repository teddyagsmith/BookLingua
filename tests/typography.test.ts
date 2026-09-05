import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeApostrophes, normalizeQuotes, normalizeTypography } from '../lib/typography'

test('straight apostrophes between letters become typographic ones', () => {
  // The exact mixture found in the delivered French: same paragraph, both forms.
  const delivered = "c'est leur flexibilité. Vous n’avez pas besoin de bouleverser d'obscurité"
  const fixed = normalizeApostrophes(delivered)
  assert.equal(fixed, "c’est leur flexibilité. Vous n’avez pas besoin de bouleverser d’obscurité")
  assert.doesNotMatch(fixed, /'/)
})

test('apostrophe rule never touches quotation marks', () => {
  // A straight quote around a word is not an elision and must be left for quote handling.
  assert.equal(normalizeApostrophes(`He said 'hello' to me`), `He said 'hello' to me`)
  assert.equal(normalizeApostrophes(`'Twas the night`), `'Twas the night`)
})

test('quotation marks follow the target language convention', () => {
  assert.equal(normalizeQuotes('Er sagte "Hallo" laut.', 'de'), 'Er sagte „Hallo“ laut.')
  assert.equal(normalizeQuotes('Il a dit "bonjour" ici.', 'fr'), 'Il a dit «\u202Fbonjour\u202F» ici.')
  assert.equal(normalizeQuotes('Dijo "hola" ayer.', 'es-es'), 'Dijo «hola» ayer.')
  assert.equal(normalizeQuotes('Ele disse "olá" hoje.', 'pt-br'), 'Ele disse “olá” hoje.')
  // Mixed English and German marks in one German paragraph, the delivered pattern.
  assert.equal(normalizeQuotes('„eins“ und "zwei"', 'de'), '„eins“ und „zwei“')
})

test('unbalanced quotes are left alone rather than guessed at', () => {
  const unbalanced = 'Er sagte "Hallo und ging.'
  assert.equal(normalizeQuotes(unbalanced, 'de'), unbalanced)
})

test('normalisation leaves languages without a configured convention untouched', () => {
  assert.equal(normalizeQuotes('He said "hi".', 'ja'), 'He said "hi".')
})

test('full pass fixes apostrophes, quotes and ellipses together', () => {
  const out = normalizeTypography(`Elle a dit "c'est fini"... vraiment`, 'fr')
  assert.equal(out, 'Elle a dit «\u202Fc’est fini\u202F»… vraiment')
})

test('visible punctuation entities are decoded before language normalisation', () => {
  assert.equal(normalizeTypography('N&apos;oubliez pas &quot;ceci&quot;.', 'fr'), 'N’oubliez pas « ceci ».')
  assert.equal(normalizeTypography('&amp;quot;Teste&amp;quot;', 'pt-br'), '“Teste”')
})
