import { inngest } from '@/lib/inngest'
import { supabaseAdmin } from '@/lib/supabase'
import { buildDownloadUrl, buildFeedbackUrl } from '@/lib/download-token'
import { generateLaunchStrategy } from '@/lib/launch-strategy'
import Anthropic from '@anthropic-ai/sdk'
import { Resend } from 'resend'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const resend = new Resend(process.env.RESEND_API_KEY)

const LANGUAGE_NAMES: Record<string, string> = {
  'es-es': 'Spanish (Spain)',
  'es-latam': 'Spanish (Latin America)',
  es: 'Spanish', // legacy fallback
  fr: 'French',
  de: 'German',
  'pt-pt': 'Portuguese (Portugal)',
  'pt-br': 'Portuguese (Brazil)',
  pt: 'Portuguese', // legacy fallback
}

const LANGUAGE_SETTINGS: Record<string, string> = {
  'es-es': `Use Castilian Spanish (Spain).
- Use "vosotros/vosotras" for second person plural informal address
- Use "ordenador" for computer, "móvil" for mobile phone, "coche" for car
- Follow RAE (Real Academia Española) spelling conventions
- Use Spain Spanish vocabulary and idioms throughout — avoid LatAm variants
- Leísmo is acceptable in written Spanish Spain contexts`,

  'es-latam': `Use Latin American Spanish, targeting neutral LatAm readability (universally understood across Mexico, Colombia, Argentina, and beyond).
- Use "ustedes" for ALL second person plural — never use "vosotros"
- Use "computadora" or "computador" for computer, "celular" for mobile phone, "auto/carro" for car
- Avoid "coger" — use "agarrar", "tomar", or "tomar" depending on context
- Use "lindo/a" rather than "guapo/a" for beautiful in casual contexts
- Aim for a register that feels natural across the major LatAm markets`,

  es: `Use neutral Latin American Spanish for wide readability. Use "ustedes" for second person plural.`,

  fr: `Use standard French (France) with clear, modern phrasing.
- Use "vous" for formal and "tu" for informal address as appropriate to the text
- Follow Académie française spelling standards
- Use French punctuation conventions (spaces before : ; ! ?)`,

  de: `Use standard German (Hochdeutsch) with clear sentence structure.
- Use Sie for formal, du for informal as appropriate
- Follow current Duden spelling conventions
- Maintain German sentence structure — don't over-simplify compound words`,

  'pt-pt': `Use European Portuguese (Portugal).
- Use "você" and "tu" appropriately — "tu" is common in informal Portuguese contexts
- Follow European Portuguese spelling: "facto" not "fato", maintain consonant clusters (e.g. "acto", "óptimo")
- Use European vocabulary: "autocarro" for bus, "telemóvel" for mobile, "pequeno-almoço" for breakfast, "casa de banho" for bathroom
- European Portuguese has a more clipped, consonant-heavy rhythm than Brazilian — preserve this in prose style`,

  'pt-br': `Use Brazilian Portuguese.
- Use "você" as the standard second person throughout
- Follow Brazilian spelling conventions (post-2009 Orthographic Agreement): "fato" not "facto", no silent consonants
- Use Brazilian vocabulary: "ônibus" for bus, "celular" for mobile, "café da manhã" for breakfast, "banheiro" for bathroom
- Brazilian Portuguese has a more open, vowel-rich rhythm — prose should feel warm and natural to Brazilian readers
- Use Brazilian idioms and expressions where appropriate`,

  pt: `Use Brazilian Portuguese as the default for wider readability.`,
}

const MAX_CHUNK_WORDS = 4000

// ─── Profitability & Cost Tracking ───────────────────────────────────────────
// Claude API pricing (USD per million tokens) — update if Anthropic changes pricing
const SONNET_INPUT_PER_M  = 3.00   // claude-sonnet-4
const SONNET_OUTPUT_PER_M = 15.00
const OPUS_INPUT_PER_M    = 15.00  // claude-opus-4
const OPUS_OUTPUT_PER_M   = 75.00
const WORDS_TO_TOKENS     = 1.35   // rough words-to-tokens multiplier

/**
 * Estimate the API cost (USD) for translating a book of `wordCount` words into ONE language.
 * Pass 1 = Sonnet (translation). Pass 2 = Opus (editorial review with original for context).
 */
function estimateApiCostPerLanguage(wordCount: number): number {
  const contentTokens = Math.ceil(wordCount * WORDS_TO_TOKENS)
  const promptOverhead = 3000 // system prompt + genre/language settings

  // Pass 1 (Sonnet): input = original + prompt, output ≈ same length as original
  const sonnetCost = (
    (contentTokens + promptOverhead) * SONNET_INPUT_PER_M +
    contentTokens * SONNET_OUTPUT_PER_M
  ) / 1_000_000

  // Pass 2 (Opus): input = translated + original slice for context + prompt, output ≈ translated length
  const opusCost = (
    (contentTokens * 2 + promptOverhead) * OPUS_INPUT_PER_M +
    contentTokens * OPUS_OUTPUT_PER_M
  ) / 1_000_000

  return sonnetCost + opusCost
}

/** Calculate actual spend from accumulated token usage */
function calcActualCost(usage: {
  sonnetIn: number; sonnetOut: number; opusIn: number; opusOut: number
}): number {
  return (
    (usage.sonnetIn * SONNET_INPUT_PER_M + usage.sonnetOut * SONNET_OUTPUT_PER_M) / 1_000_000 +
    (usage.opusIn   * OPUS_INPUT_PER_M   + usage.opusOut   * OPUS_OUTPUT_PER_M)   / 1_000_000
  )
}

const GENRE_TRANSLATION_NOTES: Record<string, string> = {
  romance: `GENRE: Romance fiction.
- Preserve the author's emotional tone and pacing exactly
- Character names and place names: keep as-is
- Relationship terms should feel natural and warm in the target language`,

  fantasy: `GENRE: Fantasy fiction.
- CRITICAL: Preserve ALL invented proper nouns EXACTLY as written — character names, place names, magic words, invented terms, spell names, creature names, world-specific terminology. Do NOT translate or adapt these.
- Archaic speech patterns ("thee", "thou", "dost") should use equivalent archaic register in the target language, not modern speech
- Magic system terminology stays untranslated
- Real-world place names and languages referenced in the story should use standard target-language equivalents`,

  'sci-fi': `GENRE: Science fiction.
- Preserve ALL invented proper nouns exactly — ship names, alien species, planet names, made-up technology terms
- Real scientific terminology should use established target-language scientific equivalents, not English
- Technical neologisms and made-up science terms remain untranslated`,

  thriller: `GENRE: Thriller / Crime fiction.
- American/British legal and law enforcement terms (DA, First Degree Murder, Miranda rights, SWAT, CID) should be adapted to the nearest cultural equivalent in the target language, or kept in English with contextual framing
- Police ranks and procedures: adapt to local equivalents where this aids reader comprehension
- Firearms and weapons terminology: use established target-language equivalents`,

  'non-fiction': `GENRE: Non-fiction.
- Latin and academic terms universally recognized as Latin (et al., ibid., in vitro, per se, ad hoc, etc.) must remain as Latin — do NOT translate them
- Statistics and measurements: convert imperial to metric where the target-language audience would expect metric (EU, most non-US markets)
- All proper names, brand names, and bibliographic references must be preserved exactly
- Technical terminology should use the established target-language term from academic/professional literature`,

  historical: `GENRE: Historical fiction.
- Use place names contemporary to the ERA being depicted (e.g. Constantinople for Ottoman-era Istanbul, Persia not Iran for ancient settings)
- Titles, honorifics, and forms of address should use historically accurate target-language equivalents
- Match the formality register of the original — a Victorian novel should feel formal, not modern`,

  children: `GENRE: Children's fiction.
- Vocabulary MUST be age-appropriate in the target language — simple, clear, joyful
- Rhymes, alliteration, and wordplay CANNOT be literally translated — recreate them in the spirit and feel of the original using target-language sounds and words
- Cultural references unfamiliar to target-language children should be gently adapted
- Onomatopoeia should use target-language equivalents (not English sounds)`,

  literary: `GENRE: Literary fiction.
- Preserve ALL of the author's stylistic choices: intentional sentence fragments, unusual punctuation, stream of consciousness, run-on sentences — these are deliberate, do NOT correct them
- Wordplay, alliteration, and sound devices must be recreated in the target language in the same spirit
- Cultural and literary allusions should be preserved; adapt only where a note of clarification serves the reader`,

  general: `Preserve the author's tone, voice, and style throughout. Adapt idioms and expressions to natural equivalents in the target language.`,
}

const HEAT_LEVEL_NOTES: Record<string, string> = {
  sweet: `HEAT LEVEL: Sweet/Clean romance.
- No explicit content. All intimate scenes are "closed door" — fade to black before anything explicit.
- Use warm, tender, romantic language. No sexual slang or suggestive terms.
- Body parts referenced only in anatomically neutral terms if at all.`,

  steamy: `HEAT LEVEL: Steamy romance.
- Open-door intimate scenes with sensual but not explicitly graphic language.
- Use evocative, sensual language. Mild intimate terms are appropriate where they feel natural.
- Avoid clinical anatomical terms; equally avoid crude vulgar slang. Aim for "tastefully sensual".`,

  very_steamy: `HEAT LEVEL: Very steamy / Hot romance.
- Explicit intimate scenes. Language should be erotic and match the heat of the original.
- IMPORTANT: Do NOT use clinical anatomical terms (vagina, penis, etc.) — these kill the mood. Use equivalent-register erotic slang that feels natural and hot to native readers of the target language.
- Examples by language: Spanish: coño/polla or regional equivalents; French: chatte/bite; German: Muschi/Schwanz; Portuguese EU: cona/pica; Portuguese BR: buceta/pau
- Match the author's chosen register exactly — if they use a word 20 times, use its equivalent 20 times.`,

  erotica: `HEAT LEVEL: Erotica — maximum explicit content.
- Translate with full explicitness matching the original. This is adult content for adult readers.
- Use the most naturally explicit erotic slang in the target language — clinical terms are wrong, overly crude street slang is wrong. Match the erotic literary register of the original.
- Examples by language: Spanish: coño/polla/follar; French: chatte/bite/baiser; German: Muschi/Schwanz/ficken; Portuguese EU: cona/pica/foder; Portuguese BR: buceta/pau/foder
- Consistency is critical: pick the right word and use it throughout.`,
}

const SETTING_NOTES: Record<string, string> = {
  usa: `SETTING: This book is set in the United States of America.
CRITICAL: Preserve American cultural authenticity. Translate words into the target language but do NOT relocate the story culturally. Keep American institutions, legal terms, and cultural references as American:
- Legal: DA (District Attorney), Miranda rights, First/Second Degree, public defender, etc. → keep these as American terms; you may add a brief parenthetical if helpful (e.g. "DA (Staatsanwalt)")
- Law enforcement: FBI, precinct, Sheriff, SWAT, 911 → keep as American
- Culture: American holidays, food, places, currency ($) → keep as American
- Do NOT replace American references with target-country equivalents`,

  uk: `SETTING: This book is set in the United Kingdom / Britain.
Preserve British English cultural authenticity. Translate words but keep British institutions, legal terms, and cultural references:
- Legal/police: barrister, solicitor, CPS, PC, DCI, magistrate → keep these British
- Culture: NHS, pubs, British holidays, £ currency, British place names → keep as British`,

  fantasy_world: `SETTING: This book is set in a fictional/fantasy world.
Cultural references in the story are invented — do not map them to any real-world country's equivalents. Keep all invented institutions, laws, currency, and cultural details as-is in the translation.`,

  historical: `SETTING: This book is set in a historical period.
Use era-appropriate terminology. Do NOT modernise references — keep historical accuracy intact in translation.`,
}

/**
 * Split text into chunks of ~maxWords words, breaking on paragraph boundaries
 * (double newline) to avoid cutting mid-paragraph.
 */
function chunkText(text: string, maxWords: number = MAX_CHUNK_WORDS): string[] {
  const wordCount = text.trim().split(/\s+/).length
  if (wordCount <= maxWords) return [text]

  const paragraphs = text.split(/\n\n/)
  const chunks: string[] = []
  let current: string[] = []
  let currentWords = 0

  for (const para of paragraphs) {
    const paraWords = para.trim().split(/\s+/).length
    if (currentWords + paraWords > maxWords && current.length > 0) {
      chunks.push(current.join('\n\n'))
      current = [para]
      currentWords = paraWords
    } else {
      current.push(para)
      currentWords += paraWords
    }
  }

  if (current.length > 0) {
    chunks.push(current.join('\n\n'))
  }

  return chunks
}

// Main translation job - triggered automatically after payment
// ─── SQL Migration (run once in Supabase SQL editor) ─────────────────────────
// CREATE TABLE IF NOT EXISTS translation_chunks (
//   id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
//   order_id uuid REFERENCES orders(id) ON DELETE CASCADE,
//   lang_code text NOT NULL,
//   chunk_index integer NOT NULL,
//   pass text NOT NULL CHECK (pass IN ('sonnet', 'opus')),
//   content text,
//   input_tokens integer,
//   output_tokens integer,
//   status text DEFAULT 'completed',
//   created_at timestamptz DEFAULT now(),
//   UNIQUE(order_id, lang_code, chunk_index, pass)
// );
// CREATE INDEX IF NOT EXISTS idx_translation_chunks ON translation_chunks(order_id, lang_code, pass, chunk_index);
// ─────────────────────────────────────────────────────────────────────────────

export const translateBook = inngest.createFunction(
  { 
    id: 'translate-book',
    name: 'Translate Book',
    retries: 3,
    onFailure: async ({ event, error }) => {
      // Fire-and-forget alert email on job failure
      // In onFailure, event is the failure event; original data is at event.data.event.data
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const origData = (event as any).data?.event?.data || {}
      const orderId = origData.orderId || 'unknown'
      try {
        const { data: order } = await supabaseAdmin.from('orders').select('book_title, email, word_count').eq('id', orderId).single()
        await resend.emails.send({
          from: 'BookLingua <orders@booklingua.io>',
          to: process.env.ADMIN_EMAIL || 'hello@booklingua.io',
          subject: `⚠️ Translation failed — ${order?.book_title || orderId} (${order?.email || 'unknown'})`,
          text: [
            `Order ID: ${orderId}`,
            `Book: ${order?.book_title || 'unknown'} (${order?.word_count?.toLocaleString() || '?'} words)`,
            `Customer: ${order?.email || 'unknown'}`,
            `Error: ${error?.message || 'Unknown error'}`,
            ``,
            `Action required: check Supabase and retry the job.`,
            `https://supabase.com/dashboard/project/rtpoizdvgqwazizdqmyw/editor`,
          ].join('\n'),
        })
        // Mark order as failed so customer knows
        await supabaseAdmin.from('orders').update({ status: 'failed' }).eq('id', orderId)
      } catch (e) {
        console.error('[BookLingua] onFailure handler error:', e)
      }
    },
  },
  { event: 'book/translate.requested' },
  async ({ event, step }) => {
    const { orderId, heatLevel, bookSetting } = event.data

    // Step 1: Get order details from database
    const order = await step.run('get-order', async () => {
      const { data, error } = await supabaseAdmin
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .single()
      
      if (error) throw new Error(`Order not found: ${error.message}`)
      return data
    })

    // Step 1b: Fetch author preferences (returning customers)
    const authorPrefs = await step.run('get-author-preferences', async () => {
      const { data } = await supabaseAdmin
        .from('author_preferences')
        .select('preferred_register, terminology_notes, style_notes, previous_special_instructions')
        .eq('email', order.email)
        .maybeSingle()
      return data
    })

    // Step 2: Get the original file content
    const fileContent = await step.run('get-file-content', async () => {
      const { data, error } = await supabaseAdmin
        .from('files')
        .select('content')
        .eq('order_id', orderId)
        .eq('type', 'original')
        .single()
      
      if (error) throw new Error(`Original file not found: ${error.message}`)

      // DOCX files store content as JSON: { text: "...", binary: "base64..." }
      // Extract just the text for translation
      const raw = data.content as string
      if (raw && raw.startsWith('{"text":')) {
        try {
          const parsed = JSON.parse(raw)
          return parsed.text as string
        } catch {
          // Fall through to return raw content
        }
      }
      return raw
    })

    // Step 3: Update order status to processing
    await step.run('update-status-processing', async () => {
      await supabaseAdmin
        .from('orders')
        .update({ status: 'processing' })
        .eq('id', orderId)
    })

    const languages = order.languages as string[]
    const translations: Record<string, any> = {}
    const translationNotes: Record<string, string> = {}

    // ── Profitability check ────────────────────────────────────────────────
    const estCostPerLang  = estimateApiCostPerLanguage(order.word_count)
    const estCostTotal    = estCostPerLang * languages.length
    const estMarginPct    = ((order.amount_paid - estCostTotal) / order.amount_paid * 100).toFixed(1)
    console.log(`[BookLingua] Order ${orderId}: revenue=$${order.amount_paid} | est. API cost=$${estCostTotal.toFixed(2)} | est. margin=${estMarginPct}%`)

    if (estCostTotal > Number(order.amount_paid)) {
      console.warn(`[BookLingua] ⚠️  UNPROFITABLE ORDER ${orderId}: est. API cost ($${estCostTotal.toFixed(2)}) > revenue ($${order.amount_paid})`)
      // Alert — non-blocking, job still runs to honour the customer's order
      resend.emails.send({
        from: 'BookLingua <orders@booklingua.io>',
        to: 'hello@booklingua.io',
        subject: `⚠️ Unprofitable Order — ${order.book_title}`,
        text: [
          `Order ID: ${orderId}`,
          `Book: ${order.book_title} (${order.word_count?.toLocaleString()} words, ${order.tier} tier)`,
          `Languages: ${languages.join(', ')}`,
          `Revenue: $${order.amount_paid}`,
          `Est. API cost: $${estCostTotal.toFixed(2)}`,
          `Est. loss: $${(estCostTotal - Number(order.amount_paid)).toFixed(2)}`,
          ``,
          `Likely cause: deep discount code applied. Consider adding a minimum order value for discount codes.`,
        ].join('\n'),
      }).catch(err => console.error('[BookLingua] Failed to send profitability alert:', err))
    }

    // Token usage accumulator for actual cost tracking
    const tokenUsage = { sonnetIn: 0, sonnetOut: 0, opusIn: 0, opusOut: 0 }

    // Step 4: Translate to each language
    let translationPreview = '' // captured from first language for admin review email
    for (const langCode of languages) {
      const langName = LANGUAGE_NAMES[langCode]
      const langSettings = LANGUAGE_SETTINGS[langCode]
      const genreKey = (order.genre || 'general').toLowerCase().replace(/\s+/g, '-')
      const genreNotes = GENRE_TRANSLATION_NOTES[genreKey] || GENRE_TRANSLATION_NOTES['general']
      const heatNotes = heatLevel ? (HEAT_LEVEL_NOTES[heatLevel] || '') : ''
      // bookSetting can be a lookup key (legacy dropdown) OR freeform author text
      const settingNotes = bookSetting
        ? (SETTING_NOTES[bookSetting] || `AUTHOR'S SETTING & LANGUAGE INSTRUCTIONS:\n${bookSetting}\n\nFollow these instructions carefully — preserve the cultural context the author has described and keep any specified terms untranslated.`)
        : ''
      const genreGuidance = [genreNotes, heatNotes, settingNotes].filter(Boolean).join('\n\n')

      // Fetch genre glossary terms for this language
      const glossaryTerms = await step.run(`get-glossary-${langCode}`, async () => {
        const { data } = await supabaseAdmin
          .from('genre_glossaries')
          .select('source_term, target_term, notes')
          .eq('language', langCode)
          .or(`genre.eq.${genreKey},genre.eq.general`)
        return data || []
      })

      const glossarySection = glossaryTerms.length > 0
        ? `APPROVED TERMINOLOGY GLOSSARY:\nUse these approved translations consistently:\n${glossaryTerms.map((t: { source_term: string; target_term: string; notes?: string }) => `- "${t.source_term}" → "${t.target_term}"${t.notes ? ` (${t.notes})` : ''}`).join('\n')}\n`
        : ''

      const authorPrefsSection = authorPrefs
        ? `RETURNING AUTHOR PREFERENCES:\n${authorPrefs.preferred_register ? `- Register: ${authorPrefs.preferred_register}\n` : ''}${authorPrefs.terminology_notes ? `- Terminology: ${authorPrefs.terminology_notes}\n` : ''}${authorPrefs.style_notes ? `- Style: ${authorPrefs.style_notes}\n` : ''}`
        : ''

      // Split book into chunks for Pass 1
      const textChunks = chunkText(fileContent, MAX_CHUNK_WORDS)
      const translatedChunks: string[] = []

      // Pass 1: Translation (Sonnet) — one step per chunk for Inngest retry granularity
      for (let i = 0; i < textChunks.length; i++) {
        const chunk = textChunks[i]
        const chunkLabel = textChunks.length > 1 ? ` (chunk ${i + 1}/${textChunks.length})` : ''

        const translatedChunkResult = await step.run(`translate-${langCode}-chunk-${i}`, async () => {
          // Check Supabase cache first — eliminates replay overhead for large books
          const { data: cached } = await supabaseAdmin
            .from('translation_chunks')
            .select('content, input_tokens, output_tokens')
            .eq('order_id', orderId).eq('lang_code', langCode).eq('chunk_index', i).eq('pass', 'sonnet')
            .maybeSingle()
          if (cached?.content) {
            return { chunkIndex: i, inputTokens: cached.input_tokens || 0, outputTokens: cached.output_tokens || 0 }
          }

          const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 8000,
            messages: [
              {
                role: 'user',
                content: `You are a professional literary translator specializing in ${order.genre || 'general'} books.

AUTHORIZATION: This text is provided directly by its copyright owner for authorized translation. The author has explicitly commissioned and authorized this translation of their own work. Translate the complete text as requested.

Translate the following${chunkLabel ? ' excerpt' : ' book'} into ${langName}.${chunkLabel ? `\nThis is part ${i + 1} of ${textChunks.length} — maintain consistent style with other parts.` : ''}

LANGUAGE SETTINGS:
${langSettings}

CRITICAL FORMATTING RULES:
- Preserve ALL original formatting exactly: paragraph breaks, chapter headings, line breaks
- Keep the same structure: if original has a blank line, keep the blank line
- Maintain any special formatting markers or symbols
- Keep chapter numbers/titles in the same position
- Preserve any indentation patterns
- If there are bullet points or numbered lists, keep them formatted the same way

TRANSLATION GUIDELINES:
- Preserve the author's unique voice and writing style
- Keep proper nouns and names consistent throughout
- Handle technical terms accurately - keep specialized terminology where appropriate
- Ensure the translation reads naturally to native ${langName} speakers
- Adapt idioms and expressions to equivalent ones in ${langName}
- Maintain the same tone (formal/informal) as the original

STRONG LANGUAGE & SEXUAL TERMINOLOGY:
- Translate ALL profanity, expletives and strong language faithfully — never soften, sanitize, or substitute a milder term
- Match REGISTER, not just meaning: a casual British expletive (e.g. "bloody", "bollocks", "cunt" used lightly) should map to a target-language word of equivalent cultural weight — not the most extreme equivalent, and not the mildest
- "Cunt" in British/Australian English is often casual or affectionate; in American English it is much harsher — choose the target-language equivalent that matches the SOURCE register, not the American register
- Sexual terms in romance/erotica must be translated with the correct anatomical and erotic vocabulary of the target language. Use the terms native speakers of ${langName} actually use in erotic fiction — do not use clinical/medical language unless the original does
- Common examples to handle correctly: "fuck" (translate as the natural erotic verb in ${langName}, not a euphemism), "pussy/cock" (use the erotic register equivalents, not clinical terms), "arsehole/asshole" (register varies — casual insult vs. anatomical vs. erotic; match the source context)
- If the source uses a word that is strong in one cultural context but mild in another, always favour matching the AUTHOR'S INTENT AND REGISTER over literal translation

BOOK TITLE: ${order.book_title}
AUTHOR: ${order.author_name}

${genreGuidance}

${glossarySection}${authorPrefsSection}${order.special_instructions ? `AUTHOR'S SPECIAL INSTRUCTIONS:\n${order.special_instructions}\n` : ''}

TEXT TO TRANSLATE:
${chunk}

Provide ONLY the translation, preserving all formatting. No explanations or notes.`,
              },
            ],
          })

          let text = response.content[0].type === 'text' ? response.content[0].text : ''
          // Detect refusal — if Claude refuses, throw so Inngest retries with context
          const REFUSAL_PATTERNS = /^(I (cannot|can't|apologize|am unable|don't feel)|I'm (unable|sorry)|As an AI|I notice that no|Unfortunately,? I)/i
          if (REFUSAL_PATTERNS.test(text.slice(0, 200))) {
            throw new Error(`Claude refused translation chunk ${i} for ${langCode}. Response: ${text.slice(0, 300)}`)
          }
          // Save to Supabase — step result only carries minimal metadata
          await supabaseAdmin.from('translation_chunks').upsert({
            order_id: orderId, lang_code: langCode, chunk_index: i, pass: 'sonnet',
            content: text, input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens,
          }, { onConflict: 'order_id,lang_code,chunk_index,pass' })
          return { chunkIndex: i, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens }
        })

        tokenUsage.sonnetIn  += translatedChunkResult.inputTokens
        tokenUsage.sonnetOut += translatedChunkResult.outputTokens
        // Text is read from Supabase at assembly — not from step result
      }

      // Assemble Pass 1 from Supabase (avoids carrying text through step results)
      const { data: sonnetRows } = await supabaseAdmin
        .from('translation_chunks')
        .select('chunk_index, content')
        .eq('order_id', orderId).eq('lang_code', langCode).eq('pass', 'sonnet')
        .order('chunk_index')
      const assembledSonnet = sonnetRows?.map(r => r.content).filter(Boolean) || translatedChunks
      const translatedText = assembledSonnet.join('\n\n')

      // ─── Delivery Quality Gate ─────────────────────────────────────────────
      // Belt-and-suspenders check after assembly — catches refusals that slip
      // through chunk-level detection (e.g. whitespace prefix before refusal phrase)
      const DELIVERY_REFUSAL = /I (cannot|can't|am unable|won't|don't feel)|I'm (unable|sorry, I)|As an AI|unfortunately[, ]I/i
      const refusalFound = sonnetRows?.find(r => DELIVERY_REFUSAL.test(r.content?.slice(0, 300) ?? ''))
      const outputRatio = translatedText.length / (fileContent.length || 1)
      if (refusalFound || outputRatio < 0.25) {
        const reason = refusalFound
          ? `Refusal in chunk ${refusalFound.chunk_index}: "${refusalFound.content?.slice(0, 150)}"`
          : `Output too short: ${translatedText.length} chars vs ${fileContent.length} source chars (${(outputRatio * 100).toFixed(0)}%)`
        console.error(`[BookLingua] Quality gate FAILED for ${orderId} ${langCode}: ${reason}`)
        // Throwing causes Inngest to retry this language automatically.
        // If retries are exhausted, onFailure will alert hello@booklingua.io.
        throw new Error(`Translation quality gate failed for ${langCode}: ${reason}`)
      }
      // Capture first 250 words of first successful language for admin preview email
      if (!translationPreview) {
        translationPreview = translatedText.split(/\s+/).slice(0, 250).join(' ') + '…'
      }
      // ──────────────────────────────────────────────────────────────────────

      // Pass 2: Editorial Review (Opus) — chunked to match Pass 1 chunks
      const editorialChunks: string[] = []
      const translatedTextChunks = chunkText(translatedText, MAX_CHUNK_WORDS)

      for (let i = 0; i < translatedTextChunks.length; i++) {
        const translatedChunk = translatedTextChunks[i]
        // Get proportional slice of original for context (up to 10,000 chars)
        const origChunkStart = Math.floor((i / translatedTextChunks.length) * fileContent.length)
        const origChunkEnd = Math.floor(((i + 1) / translatedTextChunks.length) * fileContent.length)
        const origSlice = fileContent.slice(origChunkStart, Math.min(origChunkEnd, origChunkStart + 10000))

        const chunkLabel = translatedTextChunks.length > 1 ? ` (chunk ${i + 1}/${translatedTextChunks.length})` : ''

        const editorialChunkResult = await step.run(`editorial-${langCode}-chunk-${i}`, async () => {
          // Check Supabase cache first
          const { data: cachedOpus } = await supabaseAdmin
            .from('translation_chunks')
            .select('content, input_tokens, output_tokens')
            .eq('order_id', orderId).eq('lang_code', langCode).eq('chunk_index', i).eq('pass', 'opus')
            .maybeSingle()
          if (cachedOpus?.content) {
            return { chunkIndex: i, inputTokens: cachedOpus.input_tokens || 0, outputTokens: cachedOpus.output_tokens || 0 }
          }

          const response = await anthropic.messages.create({
            model: 'claude-opus-4-20250514',
            max_tokens: 8000,
            messages: [
              {
                role: 'user',
                content: `You are a senior ${langName} editor specializing in ${order.genre || 'general'} books.

AUTHORIZATION: This is an authorized translation commissioned by the copyright owner of this work. Review and improve the translation as requested.

TASK: Review this translation${chunkLabel ? ` excerpt${chunkLabel}` : ''} and improve it for natural flow, cultural accuracy, and readability.

FIRST, analyze the tone and style of the original English text:
- Is it formal or casual?
- Is it literary or conversational?
- What is the author's unique voice?
Then ensure your edits maintain that same tone and voice.

LANGUAGE SETTINGS:
${langSettings}

GENRE & STYLE GUIDANCE:
${genreGuidance}

${glossarySection}${authorPrefsSection}
ORIGINAL ENGLISH (for reference):
${origSlice}

TRANSLATION TO REVIEW AND IMPROVE:
${translatedChunk}

EDITING INSTRUCTIONS:
1. Improve phrases that sound awkward or unnatural in ${langName}
2. Fix any grammatical issues
3. Adapt cultural references appropriately for ${langName} readers
4. Ensure consistency in terminology throughout
5. Maintain the author's voice and tone
6. NEVER soften, sanitize, or replace strong language — if the translation used the correct erotic or profane register, preserve it exactly. Only change strong language if the wrong register was used (e.g. a clinical term where an erotic one was needed, or vice versa)

CRITICAL - HIGHLIGHTING FORMAT:
When you make an improvement, show what the ORIGINAL translation said (before your edit) using this format:
[[ORIGINAL: original phrase]]improved phrase

This way the author sees:
- Yellow highlighted text = what the first translation said
- Clean text after it = your improved version (what will be published)

Example:
[[ORIGINAL: El hombre caminó rápido]]El hombre avanzó con paso veloz

Only highlight phrases you actually changed. Do not highlight text you kept the same.

PRESERVE ALL FORMATTING from the translation (paragraph breaks, chapters, etc.)

Respond with the full improved translation with highlights showing original phrases that were changed.${i === translatedTextChunks.length - 1 ? `

After the translation, append this section EXACTLY (do not omit it):

===TRANSLATION_NOTES===
List 10-15 of the most notable translation decisions made across this translation. Each on its own line:
ORIGINAL: [original English phrase or term] | TRANSLATED: [your choice] | REASON: [brief explanation]
Include a mix of: character names kept/adapted, key terminology choices, cultural adaptations, idiom handling, register/tone decisions, any terms deliberately kept in English, and any phrases that required creative rewriting. Even if no editorial changes were needed, document the most important consistency decisions made.
===END_NOTES===` : ''}`,
              },
            ],
          })

          let text = response.content[0].type === 'text' ? response.content[0].text : translatedChunk
          // Detect refusal — fall back to original translation rather than storing garbage
          const OPUS_REFUSAL = /^(I (cannot|can't|apologize|am unable|don't feel)|I'm (unable|sorry)|As an AI|I notice that no|Unfortunately,? I)/i
          if (OPUS_REFUSAL.test(text.slice(0, 200))) {
            console.warn(`[BookLingua] Opus refused editorial chunk ${i} for ${langCode} — using Sonnet output as fallback`)
            text = translatedChunk // fall back to Sonnet translation
          }
          await supabaseAdmin.from('translation_chunks').upsert({
            order_id: orderId, lang_code: langCode, chunk_index: i, pass: 'opus',
            content: text, input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens,
          }, { onConflict: 'order_id,lang_code,chunk_index,pass' })
          return { chunkIndex: i, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens }
        })

        tokenUsage.opusIn  += editorialChunkResult.inputTokens
        tokenUsage.opusOut += editorialChunkResult.outputTokens
        // Text is read from Supabase at assembly
      }

      // Assemble Pass 2 from Supabase
      const { data: opusRows } = await supabaseAdmin
        .from('translation_chunks')
        .select('chunk_index, content')
        .eq('order_id', orderId).eq('lang_code', langCode).eq('pass', 'opus')
        .order('chunk_index')
      const assembledOpus = opusRows?.map(r => r.content).filter(Boolean) || editorialChunks
      const rawEditorial = assembledOpus.join('\n\n')

      // Extract translation notes from the last chunk (appended after ===TRANSLATION_NOTES===)
      let editorialResult = rawEditorial
      let translationNotesParsed = ''
      const notesMatch = rawEditorial.match(/===TRANSLATION_NOTES===([\s\S]*?)===END_NOTES===/)
      if (notesMatch) {
        translationNotesParsed = notesMatch[1].trim()
        editorialResult = rawEditorial.replace(/===TRANSLATION_NOTES===[\s\S]*?===END_NOTES===/, '').trim()
      }

      translations[langCode] = {
        translated: translatedText,
        edited: editorialResult,
        notes: translationNotesParsed,
      }
      if (translationNotesParsed) {
        translationNotes[langCode] = translationNotesParsed
      }

      // Save translation to database
      await step.run(`save-translation-${langCode}`, async () => {
        await supabaseAdmin.from('files').insert({
          order_id: orderId,
          type: 'translated',
          language: langCode,
          content: editorialResult,
          original_content: translatedText,
        })
      })
    }

    // ── Final cost summary ────────────────────────────────────────────────
    const actualCost   = calcActualCost(tokenUsage)
    const actualMargin = ((Number(order.amount_paid) - actualCost) / Number(order.amount_paid) * 100).toFixed(1)
    console.log(
      `[BookLingua] Order ${orderId} DONE | revenue=$${order.amount_paid} | ` +
      `actual API cost=$${actualCost.toFixed(2)} | margin=${actualMargin}% | ` +
      `tokens: sonnet_in=${tokenUsage.sonnetIn} sonnet_out=${tokenUsage.sonnetOut} ` +
      `opus_in=${tokenUsage.opusIn} opus_out=${tokenUsage.opusOut}`
    )

    // Step 5: Update order status to completed (with actual cost metrics)
    await step.run('update-status-completed', async () => {
      // Critical update — always runs
      await supabaseAdmin
        .from('orders')
        .update({ 
          status: 'pending_review',
          completed_at: new Date().toISOString(),
        })
        .eq('id', orderId)

      // Best-effort cost tracking — won't block completion if columns don't exist yet
      try {
        await supabaseAdmin
          .from('orders')
          .update({
            api_cost: parseFloat(actualCost.toFixed(4)),
            margin_pct: parseFloat(((Number(order.amount_paid) - actualCost) / Number(order.amount_paid) * 100).toFixed(2)),
          })
          .eq('id', orderId)
          .throwOnError()
      } catch {
        console.warn(`[BookLingua] Could not save cost metrics for order ${orderId} — columns may not exist yet. Run migration: ALTER TABLE orders ADD COLUMN IF NOT EXISTS api_cost numeric(10,4); ALTER TABLE orders ADD COLUMN IF NOT EXISTS margin_pct numeric(6,2);`)
      }
    })

    // Step 6: Notify admin for review — customer email sent only after approval
    await step.run('notify-admin-for-review', async () => {
      const preview = translationPreview || '(preview not available)'
      await resend.emails.send({
        from: 'BookLingua <orders@booklingua.io>',
        to: 'hello@booklingua.io',
        subject: `📋 Review needed: ${order.book_title} (${languages.map(l => LANGUAGE_NAMES[l]).join(', ')})`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #7c3aed;">Translation ready for review</h2>
            <table style="width:100%; border-collapse:collapse; margin-bottom:16px;">
              <tr><td style="padding:6px 0; color:#6b7280; width:140px;">Book</td><td style="padding:6px 0; font-weight:bold;">${order.book_title}</td></tr>
              <tr><td style="padding:6px 0; color:#6b7280;">Author</td><td style="padding:6px 0;">${order.author_name}</td></tr>
              <tr><td style="padding:6px 0; color:#6b7280;">Customer</td><td style="padding:6px 0;">${order.email}</td></tr>
              <tr><td style="padding:6px 0; color:#6b7280;">Languages</td><td style="padding:6px 0;">${languages.map(l => LANGUAGE_NAMES[l]).join(', ')}</td></tr>
              <tr><td style="padding:6px 0; color:#6b7280;">Word count</td><td style="padding:6px 0;">${Number(order.word_count).toLocaleString()}</td></tr>
              <tr><td style="padding:6px 0; color:#6b7280;">Amount paid</td><td style="padding:6px 0;">$${Number(order.amount_paid).toFixed(2)}</td></tr>
            </table>
            <div style="background:#f5f3ff; padding:16px; border-radius:8px; margin-bottom:20px;">
              <strong style="color:#7c3aed;">Translation preview (first language):</strong>
              <p style="margin:8px 0 0 0; color:#374151; font-style:italic; line-height:1.6;">${preview}</p>
            </div>
            <a href="https://booklingua.io/admin" style="display:inline-block; background:#7c3aed; color:#fff; padding:12px 24px; border-radius:8px; text-decoration:none; font-weight:bold;">
              Go to Admin Panel →
            </a>
            <p style="color:#9ca3af; font-size:12px; margin-top:16px;">Order ID: ${orderId}</p>
          </div>
        `,
      })
    })

    // Step 6b: Generate and send Launch Strategy Pack (if purchased as upsell)
    const upsells = (order.upsells as string[]) || []
    if (upsells.includes('launch-pack')) {
      await step.run('send-launch-pack', async () => {
        const LANGUAGE_TARGET_MARKETS: Record<string, string> = {
          'es-es': 'Spain',
          'es-latam': 'Latin America (Mexico, Colombia, Argentina)',
          es: 'Latin America',
          fr: 'France',
          de: 'Germany',
          'pt-pt': 'Portugal',
          'pt-br': 'Brazil',
          pt: 'Brazil/Portugal',
        }

        // Use first ~500 words of the original content as book description
        const bookDescriptionWords = fileContent.trim().split(/\s+/).slice(0, 500).join(' ')

        // Generate one launch pack per language
        const packSections: string[] = []
        for (const langCode of languages) {
          const langName = LANGUAGE_NAMES[langCode]
          const targetMarket = LANGUAGE_TARGET_MARKETS[langCode] || langName

          try {
            const strategy = await generateLaunchStrategy({
              bookTitle: order.book_title,
              authorName: order.author_name,
              genre: order.genre || 'Fiction',
              bookDescription: bookDescriptionWords,
              targetLanguage: langName,
              targetMarket,
            })

            const section = `
              <div style="margin-bottom:40px">
                <h2 style="font-size:20px;color:#7c3aed;border-bottom:2px solid #ede9fe;padding-bottom:8px">
                  ${langName} — ${targetMarket}
                </h2>

                <h3 style="font-size:16px;margin-top:20px">📦 Amazon Backend Keywords</h3>
                <p style="color:#555;font-size:13px">Paste these into your 7 keyword boxes on KDP:</p>
                <ol style="line-height:2;color:#333">
                  ${strategy.backendKeywords.map(k => `<li>${k}</li>`).join('')}
                </ol>

                <h3 style="font-size:16px;margin-top:20px">🎯 Amazon Ads Keywords</h3>
                <p style="line-height:2;color:#333">${strategy.adKeywords.join(' · ')}</p>

                <h3 style="font-size:16px;margin-top:20px">📚 Recommended Categories</h3>
                <ul style="line-height:2;color:#333">
                  ${strategy.categories.map(c => `<li>${c}</li>`).join('')}
                </ul>

                <h3 style="font-size:16px;margin-top:20px">💶 Pricing Recommendation</h3>
                <p><strong>eBook:</strong> ${strategy.pricingRecommendation.ebook} &nbsp;&nbsp; <strong>Paperback:</strong> ${strategy.pricingRecommendation.paperback}</p>
                <p style="color:#777;font-size:13px">${strategy.pricingRecommendation.reasoning}</p>

                <h3 style="font-size:16px;margin-top:20px">✍️ Optimised Book Description</h3>
                <div style="background:#f9f9f9;padding:16px;border-radius:8px;line-height:1.7;color:#333">
                  ${strategy.bookDescription.replace(/\n/g, '<br>')}
                </div>

                <h3 style="font-size:16px;margin-top:20px">⭐ Getting Your First Reviews</h3>
                <ol style="line-height:2;color:#333">
                  ${strategy.reviewStrategy.map(s => `<li>${s}</li>`).join('')}
                </ol>

                <h3 style="font-size:16px;margin-top:20px">✅ KDP Upload Checklist</h3>
                <ul style="line-height:2;color:#333">
                  ${strategy.kdpUploadChecklist.map(s => `<li>${s}</li>`).join('')}
                </ul>
              </div>
            `
            packSections.push(section)
          } catch (err) {
            console.error(`[BookLingua] Launch pack generation failed for ${langCode}:`, err)
          }
        }

        if (packSections.length === 0) return // Nothing generated, skip email

        await resend.emails.send({
          from: 'BookLingua <orders@booklingua.io>',
          to: order.email,
          subject: `Your Launch Strategy Pack is ready: ${order.book_title} 🚀`,
          html: `
            <div style="font-family:Georgia,serif;max-width:640px;margin:0 auto;padding:32px 24px;color:#1a1a1a">
              <h1 style="font-size:24px;font-weight:bold;color:#7c3aed">🚀 Your Launch Strategy Pack</h1>
              <p style="color:#555">For <strong>${order.book_title}</strong> by ${order.author_name}</p>
              <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
              ${packSections.join('<hr style="border:none;border-top:1px solid #eee;margin:32px 0">')}
              <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
              <p style="color:#777;font-size:13px">Questions? Just reply to this email. Good luck with your launch! 🎉</p>
              <p style="color:#777;font-size:13px"><a href="https://booklingua.io" style="color:#8b5cf6">booklingua.io</a></p>
            </div>
          `,
        })
      })
    }

    // Step 7: Notify admin
    await step.run('notify-admin', async () => {
      await resend.emails.send({
        from: 'BookLingua <orders@booklingua.io>',
        to: process.env.ADMIN_EMAIL!,
        subject: `✅ Translation Complete: ${order.book_title}`,
        html: `
          <h2>Translation Completed!</h2>
          <p><strong>Order ID:</strong> ${orderId}</p>
          <p><strong>Customer:</strong> ${order.author_name} (${order.email})</p>
          <p><strong>Book:</strong> ${order.book_title}</p>
          <p><strong>Languages:</strong> ${languages.map(l => LANGUAGE_NAMES[l]).join(', ')}</p>
          <p><strong>Status:</strong> ✅ Completed and delivered</p>
        `,
      })
    })

    // Step 8: Update author preferences (upsert style notes for returning orders)
    await step.run('update-author-preferences', async () => {
      const prevInstructions = order.special_instructions ? [order.special_instructions] : []
      const { data: existing } = await supabaseAdmin
        .from('author_preferences')
        .select('previous_special_instructions')
        .eq('email', order.email)
        .maybeSingle()

      const allInstructions = [
        ...(existing?.previous_special_instructions || []),
        ...prevInstructions,
      ].slice(-10) // keep last 10

      await supabaseAdmin
        .from('author_preferences')
        .upsert({
          email: order.email,
          previous_special_instructions: allInstructions,
          terminology_notes: order.special_instructions || undefined,
          last_updated: new Date().toISOString(),
        }, { onConflict: 'email', ignoreDuplicates: false })
    })

    // Step 9: Wait 24h then send feedback request
    await step.sleep('wait-for-feedback-window', '24h')

    await step.run('send-feedback-email', async () => {
      const stars = [1, 2, 3, 4, 5]
      const starLinks = stars.map(n => {
        const url = buildFeedbackUrl(orderId, n)
        const emoji = '⭐'.repeat(n)
        return `<a href="${url}" style="display:inline-block;margin:4px;padding:10px 16px;background:#7c3aed;color:white;border-radius:8px;text-decoration:none;font-size:20px;" title="${n} star${n > 1 ? 's' : ''}">${emoji}</a>`
      }).join('')

      await resend.emails.send({
        from: 'BookLingua <orders@booklingua.io>',
        to: order.email,
        subject: `How was your ${languages.map(l => LANGUAGE_NAMES[l]).join(' & ')} translation? ⭐`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #7c3aed;">How did we do? 📚</h2>
            <p>Hi ${order.author_name},</p>
            <p>You received your <strong>${order.book_title}</strong> translation${languages.length > 1 ? 's' : ''} yesterday. We'd love to know how it went!</p>

            <div style="background: #f5f3ff; padding: 24px; border-radius: 12px; text-align: center; margin: 24px 0;">
              <p style="margin: 0 0 16px; font-weight: bold; color: #374151;">How would you rate your translation?</p>
              <div>${starLinks}</div>
            </div>

            <div style="background: #ecfdf5; padding: 20px; border-radius: 12px; margin: 24px 0; border-left: 4px solid #059669;">
              <p style="margin: 0; color: #065f46;"><strong>📚 Got a backlist?</strong></p>
              <p style="margin: 8px 0 0; color: #065f46;">
                If you have more books to translate, we offer <strong>bulk pricing</strong> for backlist orders — 
                often 20–30% off per language. 
                <a href="mailto:hello@booklingua.io" style="color: #059669; font-weight: bold;">Get in touch for a custom quote →</a>
              </p>
            </div>

            <p style="color: #6b7280; font-size: 14px;">Questions or feedback? Just reply to this email — we read every one.</p>
            <p>The BookLingua Team</p>
          </div>
        `,
      })
    })

    return { success: true, orderId, languages }
  }
)
