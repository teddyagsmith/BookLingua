import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeLocale, localeDisplayName, localeEpubTag } from '../lib/locales'
import { launchMarket } from '../lib/launch-pack-schema'
import { customerLanguageCode, customerLanguageName } from '../lib/customer-delivery'

test('es-latam intake alias reaches every shared locale lookup', () => {
  assert.equal(normalizeLocale('es-419'), 'es-latam')
  assert.equal(normalizeLocale('es-latam'), 'es-latam')
  assert.deepEqual(launchMarket('es-419'), launchMarket('es-latam'))
  assert.equal(launchMarket('es-419').locale, 'es-latam')
  assert.equal(localeDisplayName('es-419'), 'Spanish (Latin America)')
  assert.equal(customerLanguageName('es-419'), 'Spanish (Latin America)')
  assert.equal(customerLanguageCode('es-419'), 'ES')
  assert.equal(localeEpubTag('es-latam'), 'es-419')
  assert.equal(localeEpubTag('es-419'), 'es-419')
})

test('launch-pack failure is explicitly non-blocking for translation execution', async () => {
  const source = await import('node:fs/promises').then(fs => fs.readFile(new URL('../lib/translate-job.ts', import.meta.url), 'utf8'))
  assert.match(source, /Launch Pack failed[\s\S]*continuing translation/)
  assert.match(source, /stage: 'launch_pack'[\s\S]*level: 'warning'/)
})
