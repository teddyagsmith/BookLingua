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

const EXTRACTION_PROMPT = `You are a literary translation consultant.

Analyse the following book excerpt and identify culturally specific terms that
a translator would need author guidance on. These are terms where the "right"
translation decision depends on the author's intent, not just linguistic knowledge.

Focus on:
- LOCAL FOOD AND DRINK: regional dishes, drinks, snacks with no direct equivalent
- PLACE NAMES: local streets, landmarks, venues that carry cultural weight
- DIALECT AND SLANG: words or phrases specific to a regional dialect
- CULTURAL REFERENCES: institutions, events, social movements, sports teams
- IDIOMS: expressions that don't translate literally
- TITLES AND ADDRESS FORMS: regional ways of addressing people

Do NOT flag:
- Standard English words that translate straightforwardly
- Major internationally recognised place names (London, New York, Paris)
- Common idioms that have well-known equivalents in most languages
- Author names, publisher names, or copyright text

For each term, provide a short example sentence from the text (under 120 chars)
showing how it's used, and a default suggestion for what a translator would do
if the author gives no instruction.

Limit to the 20 most translation-significant terms. If there are fewer, return fewer.
If there are none, return an empty array.

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
      model: 'claude-sonnet-4-6',
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

    const summary = terms.length === 0
      ? 'No culturally specific terms found — translation can proceed without author input.'
      : `Found ${terms.length} term${terms.length !== 1 ? 's' : ''} that need your input before translation starts.`

    return { terms, hasTerms: terms.length > 0, summary }

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
