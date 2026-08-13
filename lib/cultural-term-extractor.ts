/**
 * BookLingua Cultural Term Extractor
 *
 * Runs at upload time alongside assessQuality(), BEFORE the author pays.
 * Scans source text for culturally specific terms and presents them to
 * the author so they can decide how each should be handled in translation.
 *
 * Author decisions are stored as a glossary in Supabase and injected
 * into the Pass 1 translation prompt — so the translator follows them
 * exactly rather than making its own call.
 *
 * Integration: call extractCulturalTerms() in the same upload handler
 * that calls assessQuality(). Both results are shown to the author on
 * the pre-payment review page.
 */

import Anthropic from '@anthropic-ai/sdk'
import { BOOKLINGUA_MODEL_CONFIG } from './model-config'

// ─── Types ───────────────────────────────────────────────────────────────────

export type TermDecision =
  | 'keep'           // Keep exactly as written in English
  | 'translate'      // Let the translator decide the best equivalent
  | 'replace'        // Use a specific local equivalent (author specifies)

export interface CulturalTerm {
  term: string           // The original term as it appears in the text
  category: TermCategory
  example: string        // A short sentence from the book showing it in context
  suggestion: string     // What we'd do by default if the author doesn't decide
  decision?: TermDecision
  replacement?: string   // If decision === 'replace', what to use instead
}

export type TermCategory =
  | 'food_drink'         // chip butty, craic, colcannon
  | 'place_name'         // The Shankill, Botanic Avenue, Celtic Park
  | 'dialect_slang'      // wee, boke, aye, craic, away on
  | 'cultural_reference' // The Troubles, GAA, Orange Order
  | 'proper_noun'        // Character names, brand names, pub names
  | 'idiom'              // "away in a hack", "catch yourself on"
  | 'title_honorific'    // Missus, Our kid, love (as address)

export interface CulturalTermResult {
  terms: CulturalTerm[]
  hasTerms: boolean
  summary: string        // Human-readable summary for the UI
}

export interface GlossaryEntry {
  term: string
  decision: TermDecision
  replacement?: string   // Only present when decision === 'replace'
}

// ─── Extraction prompt ───────────────────────────────────────────────────────

const EXTRACTION_PROMPT = `You are preparing a terminology glossary for a book translation.

Analyse the following book excerpt and identify words and phrases that genuinely need special handling — things a translator must make a conscious decision about. ONLY flag a term if it meets at least one of these criteria:

1. INVENTED PROPER NOUN — a character name, place name, organisation, or term the author created that does not exist in standard dictionaries (e.g. "Katniss", "Hogwarts", "the Binding", "Glimmerwood")
2. SERIES TERMINOLOGY — a word or phrase used in a specific, defined way throughout this book or series that differs from its everyday meaning (e.g. "the Fade" meaning a specific magical state, not fading light)
3. DELIBERATE UNTRANSLATABLE — a word the author clearly intends to keep in the source language in the translation (e.g. a French phrase in an English novel, a brand name used as a noun)
4. AMBIGUOUS PROPER NOUN — a common word that is ALSO used as a character name or place name in this specific book, where a translator might genuinely be unsure which meaning applies (e.g. if a character is named "Boots" and the book also mentions footwear)

DO NOT flag any of the following — these are never special terms:
- Common English verbs, even short ones: sat, set, put, run, fell, rose
- Words that look like acronyms but are used as ordinary words in context: if "sat" appears in "she sat on the bench", it is a verb, not the SAT exam
- Standard structural words: Chapter, Part, Section, Introduction, Conclusion, Prologue, Epilogue, Foreword, Afterword, Acknowledgements
- Common everyday nouns in standard use: boots, chair, window, door, clock
- Common adjectives and adverbs in standard use
- Words that are only capitalised because they begin a sentence
- Standard titles used in normal ways: Doctor, Professor, Captain, Lord (flag these ONLY if the book uses them as a character's actual name rather than their title, e.g. a character who is only ever called "Doctor")

CONTEXT CHECK — before flagging any word, read the full sentence it appears in. Ask: is this word being used in a completely standard, everyday way? If yes, do not flag it.

Examples of what NOT to flag:
- "She sat quietly on the bench" → sat is a verb, skip it
- "He laced up his boots" → boots is a common noun, skip it
- "See Chapter 3 for details" → Chapter is structural, skip it
- "The SAT results arrived" → SAT is a standard exam name, skip it (unless this book has invented something called SAT)

Examples of what TO flag:
- "She entered the Fade" → Fade appears to be a special term in this world
- "Kael watched from the Thornwood" → Thornwood is likely an invented place
- "He spoke to the Binding" → Binding used as a proper noun concept

For each flagged term, provide:
- category: one of food_drink, place_name, dialect_slang, cultural_reference, proper_noun, idiom, title_honorific
- example: a short sentence from the text (under 120 chars) showing how it's used
- suggestion: what we'd do by default — e.g. 'keep in English', 'translate to [equivalent]', 'use local equivalent'

Limit to the 20 most translation-significant terms. If there are fewer, return fewer. If there are none, return an empty array.

Source language: {sourceLanguage}
Target languages: {targetLanguages}

Respond in JSON only, no preamble:
{{
  "terms": [
    {{
      "term": "the exact term as it appears",
      "category": "food_drink | place_name | dialect_slang | cultural_reference | proper_noun | idiom | title_honorific",
      "example": "short sentence showing it in context (under 120 chars)",
      "suggestion": "what we'd do by default — e.g. 'keep in English', 'translate to [equivalent]', 'use local equivalent'"
    }}
  ]
}}
`

// ─── Main extractor ──────────────────────────────────────────────────────────

/**
 * Extract culturally specific terms from source text.
 *
 * Samples the first 8,000 words (enough to cover the opening chapters
 * where an author's voice and local colour are most concentrated).
 * Running on the full book would be slow and find mostly duplicates.
 */
export async function extractCulturalTerms(
  sourceText: string,
  sourceLanguage: string = 'English',
  targetLanguages: string[] = [],
  anthropicApiKey?: string,
): Promise<CulturalTermResult> {
  const client = new Anthropic({
    apiKey: anthropicApiKey || process.env.ANTHROPIC_API_KEY,
  })

  // Sample: first 8,000 words
  const words = sourceText.split(/\s+/)
  const sample = words.slice(0, 8000).join(' ')

  if (sample.trim().length < 200) {
    return { terms: [], hasTerms: false, summary: 'Text too short to analyse.' }
  }

  const targetLangStr = targetLanguages.length > 0
    ? targetLanguages.join(', ')
    : 'multiple languages'

  try {
    const response = await client.messages.create({
      model: BOOKLINGUA_MODEL_CONFIG.normal,
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: EXTRACTION_PROMPT
          .replace('{sourceLanguage}', sourceLanguage)
          .replace('{targetLanguages}', targetLangStr)
          + '\n\nSOURCE TEXT:\n' + sample,
      }],
    })

    const raw = response.content[0].type === 'text' ? response.content[0].text : ''
    const clean = raw.replace(/^```(?:json)?/, '').replace(/```$/, '').trim()
    const parsed = JSON.parse(clean) as { terms: Omit<CulturalTerm, 'decision' | 'replacement'>[] }

    const terms: CulturalTerm[] = (parsed.terms || []).map(t => ({
      ...t,
      decision: undefined,
      replacement: undefined,
    }))

    // Case-insensitive deduplication: merge entries like "sat", "Sat", "SAT".
    // Prefer the capitalised/proper-noun form when the same word appears both
    // as a common word and as a proper noun in different places.
    const deduped: CulturalTerm[] = []
    const seen = new Map<string, CulturalTerm>()
    for (const term of terms) {
      const key = term.term.toLowerCase()
      const existing = seen.get(key)
      if (!existing) {
        seen.set(key, term)
      } else {
        const existingIsProper = /^[A-Z]/.test(existing.term)
        const newIsProper = /^[A-Z]/.test(term.term)
        if (newIsProper && !existingIsProper) {
          seen.set(key, {
            ...term,
            example: `${term.example} (also seen as '${existing.term}' in common usage)`,
          })
        }
      }
    }
    deduped.push(...Array.from(seen.values()))

    const summary = deduped.length === 0
      ? 'No culturally specific terms found — translation can proceed without author input.'
      : `Found ${deduped.length} term${deduped.length !== 1 ? 's' : ''} that need your input before translation starts.`

    return { terms: deduped, hasTerms: deduped.length > 0, summary }

  } catch (e) {
    console.warn('[CulturalTerms] Extraction failed (non-fatal):', e)
    return {
      terms: [],
      hasTerms: false,
      summary: 'Term extraction unavailable — translation will use standard decisions.',
    }
  }
}

// ─── Glossary builder ─────────────────────────────────────────────────────────

/**
 * Convert author decisions into a glossary string for injection
 * into the Pass 1 translation prompt.
 *
 * Call this when building the Pass 1 system prompt for an order.
 * Returns empty string if no glossary exists (safe to concatenate).
 */
export function buildGlossaryPrompt(entries: GlossaryEntry[]): string {
  if (!entries || entries.length === 0) return ''

  const lines = entries.map(e => {
    switch (e.decision) {
      case 'keep':
        return `"${e.term}" → Keep exactly as written in English. Do not translate.`
      case 'replace':
        return `"${e.term}" → Use "${e.replacement}" in the target language. Do not use any other equivalent.`
      case 'translate':
        return `"${e.term}" → Translate naturally into the target language using the best local equivalent.`
      default:
        return `"${e.term}" → Translate naturally.`
    }
  })

  return `
AUTHOR GLOSSARY — follow these instructions exactly, no exceptions:
${lines.join('\n')}

If a term appears multiple times in the text, apply the same decision every time.
`
}

/**
 * Load glossary entries for an order from Supabase and format for prompt injection.
 * Returns empty string if no glossary stored (non-fatal).
 */
export async function loadGlossaryPrompt(
  orderId: string,
  supabaseAdmin: any,
): Promise<string> {
  try {
    const { data } = await supabaseAdmin
      .from('files')
      .select('content')
      .eq('order_id', orderId)
      .eq('type', 'glossary')
      .eq('language', 'en')
      .maybeSingle()

    if (!data?.content) return ''
    const entries: GlossaryEntry[] = JSON.parse(data.content)
    return buildGlossaryPrompt(entries)
  } catch (e) {
    console.warn('[Glossary] Failed to load glossary (non-fatal):', e)
    return ''
  }
}

// ─── Supabase storage helpers ─────────────────────────────────────────────────

/**
 * Store the extracted terms in Supabase so the UI can show them to the author.
 */
export async function storeCulturalTerms(
  orderId: string,
  terms: CulturalTerm[],
  supabaseAdmin: any,
): Promise<void> {
  await supabaseAdmin.from('files').upsert({
    order_id: orderId,
    type: 'cultural_terms',
    language: 'en',
    content: JSON.stringify(terms),
  }, { onConflict: 'order_id,type,language' })
}

/**
 * Store the author's decisions as a glossary after they submit the review form.
 */
export async function storeGlossary(
  orderId: string,
  decisions: GlossaryEntry[],
  supabaseAdmin: any,
): Promise<void> {
  await supabaseAdmin.from('files').upsert({
    order_id: orderId,
    type: 'glossary',
    language: 'en',
    content: JSON.stringify(decisions),
  }, { onConflict: 'order_id,type,language' })
}
