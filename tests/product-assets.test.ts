import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'fs'
import { createHash } from 'crypto'
import { join } from 'path'
import { LaunchPackV1, validateLaunchPack } from '../lib/launch-pack-schema'
import { parseLegacyTranslationNotes, renderTranslationNotes, validateTranslationNotes } from '../lib/translation-notes'
import { UPLOAD_GUIDE_ASSET_PATH, UPLOAD_GUIDE_SHA256 } from '../lib/upload-guide'

function validLaunchPack(): LaunchPackV1 {
  return {
    schemaVersion: '1.0', language: 'French', market: 'France',
    backendKeywords: Array.from({ length: 7 }, (_, index) => `mot clé ${index + 1}`),
    adKeywords: Array.from({ length: 20 }, (_, index) => `publicité ${index + 1}`),
    categories: ['Catégorie A', 'Catégorie B', 'Catégorie C'],
    pricingRecommendation: { ebook: '4,99 €', paperback: '12,99 €', reasoning: 'Synthetic market rationale.' },
    bookDescription: 'Synthetic French description.', reviewStrategy: ['Synthetic review tactic.'], kdpUploadChecklist: ['Synthetic upload step.'],
  }
}

test('Launch Pack validation enforces entitlement, locale and required sections', () => {
  assert.deepEqual(validateLaunchPack({ pack: validLaunchPack(), expectedLanguage: 'French', expectedMarket: 'France', purchased: true }), [])
  assert.match(validateLaunchPack({ pack: validLaunchPack(), expectedLanguage: 'German', expectedMarket: 'Germany', purchased: false }).join(' '), /not entitled/)
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
})
