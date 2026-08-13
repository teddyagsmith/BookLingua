/**
 * BookLingua Style Extractor
 *
 * Runs as a new step BEFORE Pass 1 translation, using the first 3 chapters
 * of the source text to generate a book-specific style profile.
 *
 * The profile is stored in Supabase and injected into both Pass 1 and Pass 2
 * system prompts, giving translators and editors concrete guidance on this
 * specific book's voice rather than relying on generic GENRE_GUIDANCE.
 *
 * This directly addresses register drift (e.g. tu vs Lei inconsistency)
 * because every 600-word editorial chunk gets the same explicit register
 * instruction from the profile, not just a generic language setting.
 *
 * Integration: add a new step.run('extract-style-profile') in translate-job.ts
 * immediately before the Pass 1 loop. Then call loadStylePrompt() when building
 * the Pass 1 and Pass 2 system prompts.
 */

import Anthropic from '@anthropic-ai/sdk'
import { BOOKLINGUA_MODEL_CONFIG } from './model-config'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface StyleProfile {
  /** first person / third person / second person */
  pov: string
  /** past / present / mixed */
  tense: string
  /** How the author addresses the reader / characters — formal, informal, intimate */
  register: string
  /** Sentence rhythm — short and punchy / long and flowing / varied */
  sentence_rhythm: string
  /** Dominant tone — dark, humorous, tense, warm, literary, commercial */
  tone: string
  /** Key recurring stylistic devices — rhetorical questions, em dashes, fragments, italics for thought */
  devices: string[]
  /** Heat level for romance/adult content — clinical / restrained / moderate / explicit */
  heat_level: string
  /** Register instruction for target language — explicit tu/tú/du vs Lei/usted/Sie guidance */
  target_register_note: string
  /** Any character-specific voice notes — e.g. "Ghost character speaks in formal archaic register" */
  character_voices: string[]
  /** One-paragraph summary for the prompt */
  summary: string
}

// ─── Extraction prompt ───────────────────────────────────────────────────────

const STYLE_PROMPT = `You are a senior literary translator and editor.

Analyse the following opening chapters of a book and produce a detailed style
profile that will guide translators and editors working on the full manuscript.

Be specific and concrete. A translator reading this profile should be able to
open any page of the book and know immediately what register, rhythm, and tone
to use — without having read the rest.

Target language(s): {targetLanguages}

Pay particular attention to:
1. Register — is this formal, informal, or intimate? Does it shift by character or scene?
   For {targetLanguages}: specify exactly which pronoun forms to use (tu/tú/du vs Lei/usted/Sie vs vous/usted formal).
   This is the most common source of drift between translated chunks — be explicit.
2. Sentence rhythm — does the author write in short punchy fragments or long flowing sentences?
   Give examples of the pattern.
3. Internal monologue — is it set off with italics? Written as direct thought or reported thought?
4. Dialogue register — do characters speak formally or informally to each other?
   Does this shift by relationship (stranger vs lover vs family)?
5. Any character with a notably different voice from the narrator.

Respond in JSON only, no preamble:
{{
  "pov": "first person / third person limited / third person omniscient / second person",
  "tense": "past / present / mixed",
  "register": "description of overall register",
  "sentence_rhythm": "description with a quoted example from the text",
  "tone": "primary tone(s)",
  "devices": ["list", "of", "recurring", "stylistic", "devices"],
  "heat_level": "none / sweet / moderate / spicy / explicit",
  "target_register_note": "EXPLICIT instruction for {targetLanguages} — e.g. 'Use tu throughout in Italian — ALL dialogue and internal monologue. Never Lei unless a character is being deliberately cold/formal as a character beat.'",
  "character_voices": [
    "Character name: voice description — e.g. 'Ghost speaks in archaic formal register, uses inverted syntax'"
  ],
  "summary": "2-3 sentence summary of the book's style for use in a translation system prompt"
}}
`

// ─── Main extractor ──────────────────────────────────────────────────────────

/**
 * Extract a style profile from the first ~6,000 words of source text.
 *
 * 6,000 words (~3 chapters) is enough to establish voice firmly.
 * Running on more adds cost without meaningfully improving the profile.
 */
export async function extractStyleProfile(
  sourceText: string,
  targetLanguages: string[],
  genre: string = 'general',
  anthropicApiKey?: string,
): Promise<StyleProfile | null> {
  const client = new Anthropic({
    apiKey: anthropicApiKey || process.env.ANTHROPIC_API_KEY,
  })

  // Sample: first 6,000 words
  const words = sourceText.split(/\s+/)
  const sample = words.slice(0, 6000).join(' ')

  if (sample.trim().length < 500) {
    console.warn('[StyleExtractor] Text too short for style extraction')
    return null
  }

  const targetLangStr = targetLanguages.join(', ')

  try {
    const response = await client.messages.create({
      model: BOOKLINGUA_MODEL_CONFIG.normal,
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: STYLE_PROMPT
          .replace(/\{targetLanguages\}/g, targetLangStr)
          + '\n\nSOURCE TEXT (first chapters):\n' + sample,
      }],
    })

    const raw = response.content[0].type === 'text' ? response.content[0].text : ''
    const clean = raw.replace(/^```(?:json)?/, '').replace(/```$/, '').trim()
    return JSON.parse(clean) as StyleProfile

  } catch (e) {
    console.warn('[StyleExtractor] Extraction failed (non-fatal):', e)
    return null
  }
}

// ─── Prompt builder ──────────────────────────────────────────────────────────

/**
 * Convert a StyleProfile into a prompt injection string.
 * Appended to both Pass 1 and Pass 2 system prompts.
 *
 * This is the key piece — every 600-word editorial chunk gets the same
 * explicit register instruction, preventing tu/Lei drift across chunks.
 */
export function buildStylePrompt(profile: StyleProfile): string {
  if (!profile) return ''

  const deviceList = profile.devices.length > 0
    ? profile.devices.join(', ')
    : 'none noted'

  const characterVoices = profile.character_voices.length > 0
    ? '\nCHARACTER VOICES:\n' + profile.character_voices.map(v => `- ${v}`).join('\n')
    : ''

  return `
BOOK STYLE PROFILE — follow these instructions for every paragraph:

${profile.summary}

POV: ${profile.pov}
TENSE: ${profile.tense}
REGISTER: ${profile.register}
SENTENCE RHYTHM: ${profile.sentence_rhythm}
TONE: ${profile.tone}
HEAT LEVEL: ${profile.heat_level}
RECURRING DEVICES: ${deviceList}

CRITICAL — TARGET LANGUAGE REGISTER:
${profile.target_register_note}
This applies to every sentence. Do not drift between chunks.
${characterVoices}
`
}

// ─── Supabase storage helpers ─────────────────────────────────────────────────

/**
 * Store the style profile in Supabase after extraction.
 */
export async function storeStyleProfile(
  orderId: string,
  profile: StyleProfile,
  supabaseAdmin: any,
): Promise<void> {
  await supabaseAdmin.from('files').upsert({
    order_id: orderId,
    type: 'style_profile',
    language: 'en',
    content: JSON.stringify(profile),
  }, { onConflict: 'order_id,type,language' })
}

/**
 * Load the style profile for an order and return the prompt injection string.
 * Returns empty string if no profile stored (non-fatal).
 */
export async function loadStylePrompt(
  orderId: string,
  supabaseAdmin: any,
): Promise<string> {
  try {
    const { data } = await supabaseAdmin
      .from('files')
      .select('content')
      .eq('order_id', orderId)
      .eq('type', 'style_profile')
      .eq('language', 'en')
      .maybeSingle()

    if (!data?.content) return ''
    const profile: StyleProfile = JSON.parse(data.content)
    return buildStylePrompt(profile)
  } catch (e) {
    console.warn('[StyleExtractor] Failed to load profile (non-fatal):', e)
    return ''
  }
}
