import { inngest } from '@/lib/inngest'
import { supabaseAdmin } from '@/lib/supabase'
import { buildDownloadUrl } from '@/lib/download-token'
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
- Use "coger" in appropriate Spanish contexts (e.g. coger el autobús)
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

const MAX_CHUNK_WORDS = 15000

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
export const translateBook = inngest.createFunction(
  { 
    id: 'translate-book',
    name: 'Translate Book',
    retries: 3,
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

    // Step 2: Get the original file content
    const fileContent = await step.run('get-file-content', async () => {
      const { data, error } = await supabaseAdmin
        .from('files')
        .select('content')
        .eq('order_id', orderId)
        .eq('type', 'original')
        .single()
      
      if (error) throw new Error(`Original file not found: ${error.message}`)
      return data.content
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

      // Split book into chunks for Pass 1
      const textChunks = chunkText(fileContent, MAX_CHUNK_WORDS)
      const translatedChunks: string[] = []

      // Pass 1: Translation (Sonnet) — one step per chunk for Inngest retry granularity
      for (let i = 0; i < textChunks.length; i++) {
        const chunk = textChunks[i]
        const chunkLabel = textChunks.length > 1 ? ` (chunk ${i + 1}/${textChunks.length})` : ''

        const translatedChunkResult = await step.run(`translate-${langCode}-chunk-${i}`, async () => {
          const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 8000,
            messages: [
              {
                role: 'user',
                content: `You are a professional literary translator specializing in ${order.genre || 'general'} books.

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

BOOK TITLE: ${order.book_title}
AUTHOR: ${order.author_name}

${genreGuidance}

${order.special_instructions ? `AUTHOR'S SPECIAL INSTRUCTIONS:\n${order.special_instructions}\n` : ''}

TEXT TO TRANSLATE:
${chunk}

Provide ONLY the translation, preserving all formatting. No explanations or notes.`,
              },
            ],
          })

          return {
            text: response.content[0].type === 'text' ? response.content[0].text : '',
            inputTokens: response.usage.input_tokens,
            outputTokens: response.usage.output_tokens,
          }
        })

        tokenUsage.sonnetIn  += translatedChunkResult.inputTokens
        tokenUsage.sonnetOut += translatedChunkResult.outputTokens
        translatedChunks.push(translatedChunkResult.text)
      }

      const translatedText = translatedChunks.join('\n\n')

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
          const response = await anthropic.messages.create({
            model: 'claude-opus-4-20250514',
            max_tokens: 8000,
            messages: [
              {
                role: 'user',
                content: `You are a senior ${langName} editor specializing in ${order.genre || 'general'} books.

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
List the 8-15 most significant translation decisions made across this translation. Each on its own line:
ORIGINAL: [original English phrase] | TRANSLATED: [your choice] | REASON: [brief explanation of why]
Focus on: cultural adaptations, slang/register choices, setting-specific decisions (e.g. preserving American legal terms), idiom adaptations, heat-level register choices.
===END_NOTES===` : ''}`,
              },
            ],
          })

          return {
            text: response.content[0].type === 'text' ? response.content[0].text : translatedChunkResult.text,
            inputTokens: response.usage.input_tokens,
            outputTokens: response.usage.output_tokens,
          }
        })

        tokenUsage.opusIn  += editorialChunkResult.inputTokens
        tokenUsage.opusOut += editorialChunkResult.outputTokens
        editorialChunks.push(editorialChunkResult.text)
      }

      const rawEditorial = editorialChunks.join('\n\n')

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

    // Step 5: Update order status to completed
    await step.run('update-status-completed', async () => {
      await supabaseAdmin
        .from('orders')
        .update({ 
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .eq('id', orderId)
    })

    // Step 6: Send completion email to customer
    await step.run('send-completion-email', async () => {
      const downloadLinks = languages.map(lang => ({
        language: LANGUAGE_NAMES[lang],
        url: buildDownloadUrl(orderId, lang),
      }))

      await resend.emails.send({
        from: 'BookLingua <orders@booklingua.io>',
        to: order.email,
        subject: `Your translations are ready: ${order.book_title} 🎉`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #7c3aed;">Your translations are ready! 📚</h1>
            
            <p>Hi ${order.author_name},</p>
            
            <p>Great news! Your translations for <strong>${order.book_title}</strong> are complete and ready for download.</p>
            
            <div style="background: #f5f3ff; padding: 20px; border-radius: 12px; margin: 20px 0;">
              <h3 style="margin-top: 0;">Download Your Translations</h3>
              ${downloadLinks.map(link => `
                <p style="margin: 10px 0;">
                  <strong>${link.language}:</strong>
                  <a href="${link.url}" style="color: #7c3aed; text-decoration: none;"> Download File →</a>
                </p>
              `).join('')}
            </div>
            
            <div style="background: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0; color: #92400e;">
                <strong>📝 How to review your translations:</strong><br><br>
                Text highlighted in yellow shows the <em>original</em> translation before our editorial improvements. 
                The clean text that follows is the improved version ready for publishing.<br><br>
                Simply delete the yellow highlighted portions to get your final, polished translation.
              </p>
            </div>

            ${languages.map(lang => {
              const notes = translations[lang]?.notes
              if (!notes) return ''
              const noteLines = notes.split('\n').filter((l: string) => l.startsWith('ORIGINAL:'))
              if (noteLines.length === 0) return ''
              return `
              <div style="margin: 20px 0; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
                <div style="background: #f5f3ff; padding: 12px 16px; border-bottom: 1px solid #e5e7eb;">
                  <strong style="color: #7c3aed;">✏️ Translation Notes — ${LANGUAGE_NAMES[lang]}</strong>
                  <span style="color: #6b7280; font-size: 13px; margin-left: 8px;">Key decisions our editors made</span>
                </div>
                <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                  ${noteLines.map((line: string, i: number) => {
                    const parts = line.replace('ORIGINAL: ', '').split(' | ')
                    const original = parts[0] || ''
                    const translated = (parts[1] || '').replace('TRANSLATED: ', '')
                    const reason = (parts[2] || '').replace('REASON: ', '')
                    return `<tr style="background: ${i % 2 === 0 ? '#fff' : '#fafafa'}; border-bottom: 1px solid #f3f4f6;">
                      <td style="padding: 8px 12px; color: #6b7280; width: 28%;">${original}</td>
                      <td style="padding: 8px 4px; color: #9ca3af; width: 4%;">→</td>
                      <td style="padding: 8px 12px; color: #111827; width: 28%;"><strong>${translated}</strong></td>
                      <td style="padding: 8px 12px; color: #6b7280; width: 40%; font-style: italic;">${reason}</td>
                    </tr>`
                  }).join('')}
                </table>
              </div>`
            }).join('')}
            
            <p>Download links expire in 7 days. Need them resent? Just reply to this email.</p>
            
            <p>Happy publishing!<br>The BookLingua Team</p>
          </div>
        `,
      })
    })

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

    return { success: true, orderId, languages }
  }
)
