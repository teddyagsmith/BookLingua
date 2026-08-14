import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'fs'
import { createHash } from 'crypto'
import { join } from 'path'
import AdmZip from 'adm-zip'
import { LaunchPackV1, validateLaunchPack } from '../lib/launch-pack-schema'
import { parseLegacyTranslationNotes, renderTranslationNotes, validateTranslationNotes } from '../lib/translation-notes'
import { UPLOAD_GUIDE_ASSET_PATH, UPLOAD_GUIDE_SHA256, UPLOAD_GUIDE_VERSION } from '../lib/upload-guide'

function validLaunchPack(): LaunchPackV1 {
  return {
    schemaVersion: '2.0', locale: 'fr', language: 'French', market: 'France', amazonDomain: 'amazon.fr', currency: 'EUR',
    backendKeywords: Array.from({ length: 7 }, (_, index) => `mot clé ${index + 1}`),
    adKeywords: Array.from({ length: 20 }, (_, index) => `publicité ${index + 1}`),
    categories: ['Catégorie A', 'Catégorie B', 'Catégorie C'],
    pricingRecommendation: { ebook: '4,99 €', paperback: '12,99 €', reasoning: 'Synthetic market rationale.' },
    bookDescription: 'Synthetic French description.', reviewStrategy: ['Synthetic review tactic.'], kdpUploadChecklist: ['Synthetic upload step.'],
  }
}

test('Launch Pack validation enforces entitlement, locale and required sections', () => {
  assert.deepEqual(validateLaunchPack({ pack: validLaunchPack(), expectedLocale: 'fr', purchased: true }), [])
  assert.match(validateLaunchPack({ pack: validLaunchPack(), expectedLocale: 'de', purchased: false }).join(' '), /not entitled/)
})

test('legacy notes can migrate into a validated structured schema and render', () => {
  const notes = parseLegacyTranslationNotes('--- Proper Nouns ---\nORIGINAL: Moonroot | TRANSLATED: Racine-de-Lune | REASON: Preserves the invented image', 'French')
  assert.deepEqual(validateTranslationNotes(notes), [])
  assert.match(renderTranslationNotes(notes), /Moonroot/)
})

test('versioned upload guide asset exists with the recorded hash', () => {
  const path = join(process.cwd(), 'public', UPLOAD_GUIDE_ASSET_PATH.replace(/^\//, ''))
  assert.equal(existsSync(path), true)
  assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'), UPLOAD_GUIDE_SHA256)
  assert.equal(UPLOAD_GUIDE_VERSION, '2.0')
  const zip: any = new AdmZip(readFileSync(path)), entry = zip.getEntry('word/document.xml')
  assert.ok(entry)
  const xml = zip.readFile(entry)!.toString('utf8')
  assert.match(xml, /Using Your Chapter Map/)
  assert.match(xml, /Final Translation/)
  assert.match(xml, /Translation Review/)
  assert.match(xml, /Launch Pack/)
})
