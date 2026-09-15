import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'fs'
import { createHash } from 'crypto'
import { join } from 'path'
import AdmZip from 'adm-zip'
import { LaunchPackV1, launchMarket, validateLaunchPack } from '../lib/launch-pack-schema'
import { parseLegacyTranslationNotes, renderTranslationNotes, validateTranslationNotes } from '../lib/translation-notes'
import { UPLOAD_GUIDE_ASSET_PATH, UPLOAD_GUIDE_SHA256, UPLOAD_GUIDE_VERSION } from '../lib/upload-guide'
import { researchFields } from './launch-pack-fixture'

function validLaunchPack(): LaunchPackV1 {
  return {
    schemaVersion: '3.1', locale: 'fr', language: 'French', market: 'France', amazonDomain: 'amazon.fr', currency: 'EUR',
    backendKeywords: Array.from({ length: 7 }, (_, index) => `mot clé ${index + 1}`),
    adKeywords: Array.from({ length: 20 }, (_, index) => `publicité ${index + 1}`),
    categories: ['Catégorie A', 'Catégorie B', 'Catégorie C'],
    pricingRecommendation: { ebook: '4,99 €', paperback: '12,99 €', reasoning: 'Synthetic market rationale.' },
    bookDescription: 'Synthetic French description.', reviewStrategy: ['Synthetic review tactic.'], kdpUploadChecklist: ['Synthetic upload step.'],...researchFields,
  }
}

test('Launch Pack validation enforces entitlement, locale and required sections', () => {
  assert.deepEqual(validateLaunchPack({ pack: validLaunchPack(), expectedLocale: 'fr', purchased: true }), [])
  assert.match(validateLaunchPack({ pack: validLaunchPack(), expectedLocale: 'de', purchased: false }).join(' '), /not entitled/)
})

test('Launch Pack markets cover every currently sold European locale',()=>{
  for(const locale of ['es-es','fr','de','it','pt-pt','pl'])assert.equal(launchMarket(locale).locale,locale)
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

test('blog bodies do not repeat the title or description rendered by the article template', () => {
  const directory = join(process.cwd(), 'content', 'blog')
  for (const file of readdirSync(directory).filter((name) => name.endsWith('.mdx'))) {
    const source = readFileSync(join(directory, file), 'utf8')
    const frontmatterEnd = source.indexOf('\n---', 4)
    assert.notEqual(frontmatterEnd, -1, `${file} is missing closing frontmatter`)
    const frontmatter = source.slice(0, frontmatterEnd)
    const body = source.slice(frontmatterEnd + 4).trimStart()
    const title = frontmatter.match(/^title:\s*["']?(.+?)["']?\s*$/m)?.[1]
    const description = frontmatter.match(/^description:\s*["']?(.+?)["']?\s*$/m)?.[1]
    assert.ok(title, `${file} is missing a title`)
    assert.ok(description, `${file} is missing a description`)
    assert.equal(/^#\s+/m.test(body), false, `${file} adds a second page-level heading in the body`)
    assert.notEqual(body.split('\n')[0].replace(/^#\s+/, '').trim(), title, `${file} repeats its title in the body`)
    assert.equal(body.startsWith(description!), false, `${file} repeats its description in the body`)

    const headings = [...body.matchAll(/^(#{2,6})\s+(.+)$/gm)]
    let previousLevel = 1
    for (const [, hashes] of headings) {
      const level = hashes.length
      assert.ok(level <= previousLevel + 1, `${file} skips a heading level`)
      previousLevel = level
    }

    const headingSlugs = new Set(headings.map(([, , heading]) => heading
      .toLowerCase()
      .replace(/[’']/g, '')
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .trim()
      .replace(/\s+/g, '-')))
    for (const [, anchor] of body.matchAll(/\[[^\]]+\]\(#([^)]+)\)/g)) {
      assert.equal(headingSlugs.has(anchor), true, `${file} links to missing heading #${anchor}`)
    }
  }
})
