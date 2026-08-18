import Anthropic from '@anthropic-ai/sdk'
import { inngest } from '@/lib/inngest'
import { getSupabaseAdmin } from '@/lib/supabase'
import { buildDownloadUrl, buildFeedbackUrl } from '@/lib/download-token'
import { generateLaunchStrategy } from '@/lib/launch-strategy'
import { Resend } from 'resend'
import type { Segment } from '@/lib/extract-segments'
import crypto from 'crypto'
import { extractStyleProfile, storeStyleProfile, loadStylePrompt } from './style-extractor'
import { extractCulturalTerms, storeCulturalTerms, loadGlossaryPrompt } from './cultural-term-extractor'
import { recordTerminalFailure } from './pipeline-events'
import { assertTranslationBriefForSource, loadTranslationBrief, renderTranslationBriefPrompt, translationBriefFingerprint } from './translation-brief'
import { HARDENED_V1_ENABLED } from './pipeline-capabilities'
import { SEMANTIC_V2_ENABLED } from './semantic-document'
import { deterministicSemanticBuildId, runSemanticPipeline } from './semantic-pipeline'
import { semanticV2AllowedForOrder } from './semantic-canary'
import { toCanonicalLaunchPack } from './launch-strategy'
import { LAUNCH_PACK_SCHEMA_VERSION, launchMarket } from './launch-pack-schema'
import { BOOKLINGUA_MODEL_CONFIG } from './model-config'
import { finalizeSemanticOrder } from './semantic-finalization'
import { cachedLaunchPack, launchPackRequestIdentity } from './launch-pack-cache'
import { recordModelTelemetry } from './model-telemetry'
import { translateWithDeterministicJsonRecovery } from './semantic-model-recovery'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

let _resend: Resend | null = null
function getResend() {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY!)
  }
  return _resend
}

const LANGUAGE_NAMES: Record<string, string> = {
  'es-es': 'Spanish (Spain)',
  'es-419': 'Spanish (Latin America)',
  'fr': 'French',
  'de': 'German',
  'pt-pt': 'Portuguese (Portugal)',
  'pt-br': 'Portuguese (Brazil)',
  'it': 'Italian',
}

const LANGUAGE_SETTINGS: Record<string, string> = {
  'es-es': `Spanish (Spain) — formal usted for professional/business contexts, tú for casual/conversational. Use Spanish punctuation rules (space before : ; ? !). Prefer European Spanish vocabulary and idioms.`,
  'es-419': `Spanish (Latin America) — formal usted for professional/business contexts, tú for casual/conversational. Use Spanish punctuation rules (space before : ; ? !). Prefer Latin American vocabulary and idioms.`,
  'fr': `French (France) — formal vous for professional/business contexts, tu for casual/conversational. Use French punctuation rules (space before : ; ? !).`,
  'de': `German — formal Sie for professional/business contexts, du for casual/conversational. Use German punctuation rules.`,
  'pt-pt': `Portuguese (Portugal) — formal você for professional/business contexts, tu for casual/conversational. Use Portuguese punctuation rules.`,
  'pt-br': `Portuguese (Brazil) — formal você for professional/business contexts, tu for casual/conversational. Use Brazilian Portuguese vocabulary and idioms.`,
  'it': `Italian — formal Lei for professional/business contexts, tu for casual/conversational. Use Italian punctuation rules.`,
}

const GENRE_GUIDANCE: Record<string, string> = {
  'romance': `Romance — prioritize emotional intimacy, chemistry, and sensual language. Keep dialogue natural and flirtatious. Preserve all intimate/erotic scenes with appropriate register (never clinical unless the original was clinical).`,
  'fantasy': `Fantasy — preserve world-building terminology, magic system language, and invented names. Maintain the epic or intimate tone as appropriate.`,
  'thriller': `Thriller — maintain tension, pace, and suspense. Keep dialogue sharp and purposeful.`,
  'mystery': `Mystery — preserve clues, red herrings, and narrative misdirection. Maintain atmospheric tone.`,
  'general': `General fiction — maintain the author's voice and tone. Preserve all stylistic choices.`,
}

const MAX_CHUNK_WORDS = 2500
const MAX_EDITORIAL_CHUNK_WORDS = 600 // Reduced from 1200 — 4-part structured output generates more tokens, needs smaller chunks to stay within Vercel 60s timeout

function chunkText(text: string, maxWords: number): string[] {
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
  if (current.length > 0) chunks.push(current.join('\n\n'))
  return chunks
}

function calcActualCost(tokenUsage: Record<string, number>): number {
  const inputTokens = tokenUsage.input || 0
  const outputTokens = tokenUsage.output || 0
  const inputCost = (inputTokens / 1000000) * 3.00
  const outputCost = (outputTokens / 1000000) * 15.00
  return inputCost + outputCost
}

function detectRefusal(text: string): boolean {
  const DELIVERY_REFUSAL = /I (cannot|can't|am unable|won't|don't feel)|I'm (unable|not able|sorry)|As an AI|unfortunately[, ]I|I understand\b[^.]{0,80}(but I|however I)[^.]{0,80}(can't|cannot|not able|unable)|not (able|going) to translate|cannot (translate|provide a translation)|can't (translate|provide a translation)/i
  const norm = text.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"')
  return DELIVERY_REFUSAL.test(norm.slice(0, 500))
}

function stripMarkers(text: string): string {
  return text
    // Strip editorial highlighting markers
    .replace(/\[\[ORIGINAL:([^\]]|\](?!\]))*\]\]/g, '')
    // Strip segment markers (any number, START or END)
    .replace(/===SEGMENT_\d+_(START|END)===/g, '')
    // Strip chapter/heading markers
    .replace(/###CHAPTER:[^#]*###/g, '')
    .replace(/###H[1-6]:[^#]*###/g, '')
    // Strip translation notes block
    .replace(/===TRANSLATION_NOTES===([\s\S]*?)(===END_NOTES===|$)/g, '')
    // Strip any leftover ===...=== delimiters (catch-all)
    .replace(/===[A-Z_\d]+===\n?/g, '')
    // Strip markdown heading syntax (when source was txt→epub)
    .replace(/^#{1,6}\s*/gm, '')
    // Strip horizontal rules
    .replace(/^---\s*$/gm, '')
    // Normalize excessive whitespace
    .replace(/[^\S\n]{2,}/g, ' ')
    .trim()
}

function validateCleanOutput(text: string, context: string): { clean: boolean; issues: string[] } {
  const issues: string[] = []
  
  // Check for leaked segment markers
  const segmentMatches = text.match(/===SEGMENT_\d+_(START|END)===/g)
  if (segmentMatches) {
    issues.push(`Found ${segmentMatches.length} leaked segment markers (===SEGMENT_N_START/END===)`)
  }
  
  // Check for leaked translation notes markers
  if (text.includes('===TRANSLATION_NOTES===')) {
    issues.push('Found leaked ===TRANSLATION_NOTES=== marker')
  }
  
  // Check for raw markdown headings (indicates txt→epub path didn't strip)
  const markdownHeadings = text.match(/^#{1,6}\s+\S+/gm)
  if (markdownHeadings && markdownHeadings.length > 5) {
    issues.push(`Found ${markdownHeadings.length} raw markdown headings (##/### etc) — txt→epub stripping failed`)
  }
  
  // Check for "SEGMENT" in what looks like a heading
  const segmentHeadings = text.match(/^\s*SEGMENT\s*\d+/gim)
  if (segmentHeadings) {
    issues.push(`Found ${segmentHeadings.length} "SEGMENT" in headings — marker leaked into TOC`)
  }
  
  const clean = issues.length === 0
  if (!clean) {
    const msg = `[Validation] ${context} FAILED: ${issues.join('; ')}`
    console.error(msg)
    throw new Error(msg)
  }
  return { clean, issues }
}

function parse4PartResponse(text: string): {
  notes: string
  clean: string
  highlighted: string
  email: string
  counts: { improvements: number; chapters: number }
} {
  const result = {
    notes: '',
    clean: '',
    highlighted: '',
    email: '',
    counts: { improvements: 0, chapters: 0 },
  }

  // Extract each section using [SECTION]...[SECTION] markers
  const extractSection = (startTag: string, endTag: string): string => {
    const pattern = new RegExp(`\\[${startTag}\\]([\\s\\S]*?)\\[\\/${endTag}\\]`, 'i')
    const match = text.match(pattern)
    return match ? match[1].trim() : ''
  }

  result.notes = extractSection('TRANSLATION_NOTES', 'TRANSLATION_NOTES')
  result.clean = extractSection('CLEAN_TRANSLATION', 'CLEAN_TRANSLATION')
  result.highlighted = extractSection('HIGHLIGHTED_TRANSLATION', 'HIGHLIGHTED_TRANSLATION')
  result.email = extractSection('EMAIL_SUMMARY', 'EMAIL_SUMMARY')

  const countsText = extractSection('COUNTS', 'COUNTS')
  const improvements = countsText.match(/Total improvements:\s*(\d+)/i)
  const chapters = countsText.match(/Chapters affected:\s*(\d+)/i)
  if (improvements) result.counts.improvements = parseInt(improvements[1])
  if (chapters) result.counts.chapters = parseInt(chapters[1])

  // Fallback: if no structured sections found, treat as old format
  if (!result.highlighted && !result.clean) {
    result.highlighted = text
    result.clean = stripMarkers(text)
  }

  return result
}

export const translateBook = inngest.createFunction(
  {
    id: 'translate-book',
    retries: 3,
    onFailure: async ({ event, error }) => {
      const originalEvent = event.data.event
      const orderId = originalEvent.data.orderId as string | undefined
      if (!orderId) {
        console.error('[BookLingua] Terminal failure without orderId:', error)
        return
      }
      await recordTerminalFailure({
        supabase: getSupabaseAdmin(),
        orderId,
        stage: 'translation_job',
        error,
      })
    },
  },
  [{ event: 'book.translate' }, { event: 'book/translate.requested' }],
  async ({ event, step, attempt }) => {
    // Handle both event formats
    const orderId = event.data.orderId as string
    // If languages not in event, load from order
    let languages = (event.data as any).languages as string[] | undefined
    
    console.log(`[BookLingua] Starting translation for order ${orderId}`)

    // ── Step 1: Load order and original content ──
    const { data: order } = await getSupabaseAdmin()
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single()
    if (!order) throw new Error(`Order ${orderId} not found`)

    // Fallback: load languages from order if not in event data
    if (!languages || languages.length === 0) {
      languages = (order.languages as string[]) || []
      console.log(`[BookLingua] Loaded languages from order: ${languages.join(', ')}`)
    }

    const { data: fileData } = await getSupabaseAdmin()
      .from('files')
      .select('content, type, file_url, original_content')
      .eq('order_id', orderId)
      .eq('type', 'original')
      .single()
    if (!fileData) throw new Error(`Original file not found for order ${orderId}`)

    let fileContent: string
    let originalBuffer: Buffer | null = null
    if (fileData.file_url) {
      const { downloadOriginalBinary } = await import('./source-binary')
      let sourceHash: string | null = null
      let sourceBucket: string | undefined
      try { const metadata = JSON.parse(fileData.original_content || '{}'); sourceHash = metadata.sha256 || null; sourceBucket = metadata.storageBucket || undefined } catch {}
      originalBuffer = await downloadOriginalBinary(getSupabaseAdmin(), fileData.file_url, sourceHash, sourceBucket)
    }
    if (fileData.content.startsWith('{')) {
      try {
        const parsed = JSON.parse(fileData.content)
        fileContent = parsed.text || parsed.content || fileData.content
        if (parsed.binary) originalBuffer = Buffer.from(parsed.binary, 'base64')
      } catch {
        fileContent = fileData.content
      }
    } else {
      fileContent = fileData.content
    }

    // semantic-v2 requires both environment capability and explicit per-order selection.
    // Existing/legacy orders never enter this branch merely because staging enables the capability.
    if (HARDENED_V1_ENABLED && semanticV2AllowedForOrder(orderId, order.pipeline_version)) {
      const source = originalBuffer || Buffer.from(fileContent, 'utf8')
      const format = String(order.file_format || '.txt').replace(/^\./, '') as 'epub' | 'docx' | 'txt'
      for (const language of languages) {
        await step.run(`semantic-v2-${language}`, async () => {
          const { data: currentBuild, error: currentBuildError } = await getSupabaseAdmin().from('order_language_builds')
            .select('id').eq('order_id', orderId).eq('language', language).eq('is_current', true).maybeSingle()
          if (currentBuildError) throw new Error(`Completed semantic build lookup failed: ${currentBuildError.message}`)
          if (currentBuild) {
            const { data: completed, error: completedError } = await getSupabaseAdmin().from('package_manifests')
              .select('id,manifest').eq('order_id', orderId).eq('language', language).eq('build_id', currentBuild.id).eq('status', 'pass').maybeSingle()
            if (completedError) throw new Error(`Completed semantic package lookup failed: ${completedError.message}`)
            if (completed) {
              const { data: authoritative, error: authorityError } = await getSupabaseAdmin().rpc('is_authoritative_package_manifest', { p_manifest_id: completed.id })
              if (authorityError) throw new Error(`Completed semantic package authority check failed: ${authorityError.message}`)
              if (authoritative === true) return { buildId: currentBuild.id, status: 'pass', cached: true }
            }
          }
          const brief = await loadTranslationBrief(getSupabaseAdmin(), orderId, language)
          if (!brief) throw new Error(`Approved translation brief missing for semantic-v2 ${language}`)
          const notes = {
            schemaVersion: '1.0' as const,
            language,
            approach: 'Author-approved terminology decisions applied consistently in both translation passes.',
            sections: brief.items.length ? [{ id: 'author-decisions', title: 'Author-approved decisions', entries: brief.items.map(item => ({ source: item.sourceTerm, target: item.targetInstruction, reason: item.authorDecision })) }] : [],
          }
          let launchPack: Buffer | undefined
          if ((order.upsells || []).includes('launch-pack')) {
            const market = launchMarket(language)
            const sourceFingerprint=crypto.createHash('sha256').update(source).digest('hex')
            const buildId=deterministicSemanticBuildId(orderId,language,sourceFingerprint,brief.revision)
            const description=fileContent.slice(0,2500)
            const cached=await cachedLaunchPack({supabase:getSupabaseAdmin(),identity:{
              orderId,language,targetLanguage:market.language,targetMarket:market.market,sourceFingerprint,buildId,
              briefRevision:brief.revision,briefSchemaVersion:brief.schemaVersion,briefFingerprint:translationBriefFingerprint(brief),bookTitle:order.book_title,
              authorName:order.author_name,genre:order.genre,description,modelId:BOOKLINGUA_MODEL_CONFIG.launchPack,
              schemaVersion:LAUNCH_PACK_SCHEMA_VERSION,entitled:true,researchFingerprint:'launch-pack-research-contract-v3',
            },generate:async identity=>{
              const strategy = await generateLaunchStrategy({ bookTitle: order.book_title, authorName: order.author_name, genre: order.genre, bookDescription: fileContent.slice(0, 2500), targetLanguage: market.language, targetMarket: market.market }, {
                attempt: attempt + 1,
                requestId: launchPackRequestIdentity(identity),
                onMetadata: async metadata => {
                  await recordModelTelemetry(getSupabaseAdmin(), { orderId, language, stage:'launch-pack', attempt:metadata.attempt,
                    requestIdentity:metadata.requestId, provider:metadata.provider, modelId:metadata.modelId,
                    providerRequestId:metadata.providerRequestId, success:metadata.success, inputTokens:metadata.inputTokens,
                    outputTokens:metadata.outputTokens, cacheStatus:metadata.success?'write':'miss', errorCode:metadata.errorCode })
                  const { error } = await getSupabaseAdmin().from('pipeline_events').insert({
                    order_id: orderId, language, stage: 'launch_pack_model', status: metadata.success ? 'passed' : 'failed',
                    level: metadata.success ? 'info' : 'error', safe_message: metadata.success ? 'MODEL_USAGE_CAPTURED' : 'MODEL_ATTEMPT_FAILED', details: metadata,
                  })
                  if (error) throw new Error(`Launch Pack usage metadata persistence failed: ${error.message}`)
                },
              })
              return toCanonicalLaunchPack(strategy, language, true)
            }})
            if(cached.cached)await recordModelTelemetry(getSupabaseAdmin(),{orderId,language,stage:'launch-pack',attempt:1,
              requestIdentity:`${launchPackRequestIdentity(cached.identity)}:cache-hit`,provider:'anthropic',modelId:BOOKLINGUA_MODEL_CONFIG.launchPack,
              success:true,inputTokens:0,outputTokens:0,cacheStatus:'hit'})
            launchPack = Buffer.from(JSON.stringify(cached.pack))
          }
          const result = await runSemanticPipeline({
            supabase: getSupabaseAdmin(), orderId, language, sourceFormat: format, source,
            title: order.book_title, brief, notes, buildId: deterministicSemanticBuildId(orderId,language,crypto.createHash('sha256').update(source).digest('hex'),brief.revision), allowReviewedStructure: order.semantic_structure_approved === true,
            launchPack, dualFormat: (order.upsells || []).includes('dual-format'),
            translate: async (batch, context) => {
              const stage=context.pass===1?'translation':'editorial';const requestIdentity=`${orderId}:${language}:${stage}:${context.batchId}`
              return translateWithDeterministicJsonRecovery(batch, requestIdentity, async (requestBatch, recovery) => {
                let response: any
                try{
                  response = await anthropic.messages.create({
                    model: BOOKLINGUA_MODEL_CONFIG.translation, max_tokens: 8192,
                    system: 'Return only valid JSON matching the supplied schema. Preserve every node id and order exactly. Translate all textual node values; never omit or add nodes.',
                    messages: [{ role: 'user', content: `${renderTranslationBriefPrompt(context.brief)}\nPass ${context.pass}; target language ${context.language}.\n${JSON.stringify(requestBatch)}` }],
                  })
                  const text = response.content.find((block:any) => block.type === 'text')
                  if (!text || text.type !== 'text') throw new Error('Semantic model returned no JSON text')
                  const parsed=JSON.parse(text.text.replace(/^```json\s*|\s*```$/g, ''))
                  await recordModelTelemetry(getSupabaseAdmin(),{orderId,language,stage,batchId:context.batchId,attempt:attempt+1,requestIdentity:recovery.requestId,
                    provider:'anthropic',modelId:response.model,providerRequestId:response.id,success:true,inputTokens:response.usage.input_tokens,
                    outputTokens:response.usage.output_tokens,cacheStatus:'write'})
                  return parsed
                }catch(error){
                  await recordModelTelemetry(getSupabaseAdmin(),{orderId,language,stage,batchId:context.batchId,attempt:attempt+1,requestIdentity:recovery.requestId,
                    provider:'anthropic',modelId:response?.model||BOOKLINGUA_MODEL_CONFIG.translation,providerRequestId:response?.id,success:false,
                    inputTokens:response?.usage.input_tokens,outputTokens:response?.usage.output_tokens,cacheStatus:'miss',
                    errorCode:error instanceof SyntaxError?'MODEL_JSON_INVALID':error instanceof Error?error.name:'MODEL_FAILURE'})
                  throw error
                }
              })
            },
          })
          return { buildId: result.buildId, status: result.manifest.status }
        })
      }
      const finalization = await step.run('semantic-v2-finalize', async () => finalizeSemanticOrder({
        supabase: getSupabaseAdmin(), orderId, bookTitle: order.book_title, languages,
        genre: order.genre || order.selected_genre || 'Not specified', customerPackageVersion: order.customer_package_version || 'customer-package-v1', readerPanelEnabled: true,
        internalReviewAddress: process.env.ADMIN_EMAIL || 'gilly@myromancereads.com',
        appUrl: process.env.NEXT_PUBLIC_APP_URL || 'https://booklingua.io',
        sendInternalReview: async (message, options) => {
          const result = await getResend().emails.send(message, options)
          if (result.error) throw new Error(`Internal review email failed: ${result.error.message}`)
          return { id: result.data?.id }
        },
      }))
      return { orderId, pipelineVersion: 'semantic-v2', languages, finalization }
    }

    // ── Step 2: Extract segment metadata (non-fatal) ──
    await step.run('extract-segment-metadata', async () => {
      // Check existing segments and reuse if available
      const { data: existing } = await getSupabaseAdmin()
        .from('files')
        .select('id')
        .eq('order_id', orderId)
        .eq('type', 'segments')
        .maybeSingle()

      // If segments exist, skip re-extraction
      if (existing) {
        console.log('[Pipeline] Reusing cached segments')
        return
      }

      if (!originalBuffer) return

      try {
        const { extractDocxSegments } = await import('./extract-segments')
        const { segments, quality } = await extractDocxSegments(originalBuffer)
        if (quality.status !== 'unprocessable' && segments.length > 0) {
          await getSupabaseAdmin().from('files').upsert({
            order_id: orderId,
            type: 'segments',
            language: 'en',
            content: JSON.stringify(segments.map(s => ({ id: s.id, type: s.type, level: s.level }))),
          }, { onConflict: 'order_id,type,language' })
          console.log(`[Pipeline] Stored ${segments.length} segment metadata (${quality.headingCount} headings)`)
        }
      } catch (e) {
        console.warn('[Pipeline] Segment extraction failed (non-fatal):', e)
      }
    })

    // ── Step 2b: Generate structure template (EPUB/DOCX orders only) ──────────
    // Parses the source document and stores a JSON template in Supabase that
    // captures chapter count, headings, and paragraph counts per chapter.
    // This template drives all downstream builders — no structure is ever
    // derived from translated text.
    await step.run('generate-structure-template', async () => {
      // Skip if template already exists
      const { data: existing } = await getSupabaseAdmin()
        .from('files')
        .select('id')
        .eq('order_id', orderId)
        .eq('type', 'structure')
        .maybeSingle()

      if (existing) {
        console.log('[Template] Structure template already exists — skipping')
        return
      }

      if (!originalBuffer) {
        console.log('[Template] No binary file — skipping template generation')
        return
      }

      const fileFormat = (order.file_format || '').toLowerCase()
      if (fileFormat !== '.epub' && fileFormat !== '.docx') {
        console.log(`[Template] Skipping template for format: ${fileFormat}`)
        return
      }

      try {
        const { writeFileSync, mkdtempSync, readFileSync, rmSync } = await import('fs')
        const { tmpdir } = await import('os')
        const { join } = await import('path')
        const { execSync } = await import('child_process')

        const tmpDir = mkdtempSync(join(tmpdir(), 'bl-template-'))
        try {
          const sourcePath = join(tmpDir, `source${fileFormat}`)
          const templatePath = join(tmpDir, 'template.json')
          writeFileSync(sourcePath, originalBuffer)

          const scriptPath = join(process.cwd(), 'scripts', 'booklingua_template.py')
          execSync(`python3 "${scriptPath}" "${sourcePath}" "${templatePath}"`, {
            encoding: 'utf-8',
            maxBuffer: 10 * 1024 * 1024,
            timeout: 60000,
          })

          const template = JSON.parse(readFileSync(templatePath, 'utf-8'))

          await getSupabaseAdmin().from('files').insert({
            order_id: orderId,
            type: 'structure',
            language: 'en',
            content: JSON.stringify(template),
          })

          console.log(`[Template] Generated: ${template.total_chapters} chapters, ${template.total_paragraphs} paragraphs`)
        } finally {
          rmSync(tmpDir, { recursive: true, force: true })
        }
      } catch (e) {
        // Non-fatal — pipeline can still run without a template
        console.warn('[Template] Generation failed (non-fatal):', e)
      }
    })

    // ── Step 2c: Extract style profile (pre-Pass 1) ────────────────────────────
    await step.run('extract-style-profile', async () => {
      const { data: existing } = await getSupabaseAdmin()
        .from('files')
        .select('id')
        .eq('order_id', orderId)
        .eq('type', 'style_profile')
        .maybeSingle()
      if (existing) return

      const langNames = languages.map(l => LANGUAGE_NAMES[l] || l)
      const profile = await extractStyleProfile(fileContent, langNames, order.genre || 'general')
      if (profile) {
        await storeStyleProfile(orderId, profile, getSupabaseAdmin())
        console.log(`[Style] Profile extracted: ${profile.summary.slice(0, 80)}...`)
      }
    })

    // ── Step 2d: Extract culturally specific terms (pre-Pass 1) ─────────────────
    await step.run('extract-cultural-terms', async () => {
      const { data: existing } = await getSupabaseAdmin()
        .from('files')
        .select('id')
        .eq('order_id', orderId)
        .eq('type', 'cultural_terms')
        .maybeSingle()
      if (existing) return

      const culturalResult = await extractCulturalTerms(fileContent, 'English', languages as string[])
      if (culturalResult.hasTerms) {
        await storeCulturalTerms(orderId, culturalResult.terms, getSupabaseAdmin())
        console.log(`[CulturalTerms] ${culturalResult.terms.length} terms extracted`)
      }
    })

    // ── Step 3: Update order status ──
    await step.run('update-status-processing', async () => {
      await getSupabaseAdmin().from('orders').update({ status: 'processing' }).eq('id', orderId)
    })

    const translations: Record<string, { translated: string; edited: string; notes: string }> = {}
    const translationNotes: Record<string, string> = {}
    let tokenUsage = { input: 0, output: 0 }
    let translationPreview = ''

    for (const langCode of languages) {
      const langName = LANGUAGE_NAMES[langCode] || langCode
      const langSettings = LANGUAGE_SETTINGS[langCode] || `Translate to ${langName}`
      const genreGuidance = GENRE_GUIDANCE[order.genre || 'general'] || GENRE_GUIDANCE['general']
      const stylePrompt = await loadStylePrompt(orderId, getSupabaseAdmin())
      const glossaryPrompt = await loadGlossaryPrompt(orderId, getSupabaseAdmin())
      const { data: sourceManifestFile } = HARDENED_V1_ENABLED
        ? await getSupabaseAdmin().from('files').select('id, content').eq('order_id', orderId).eq('type', 'source_manifest').maybeSingle()
        : { data: null }
      const translationBrief = sourceManifestFile ? await loadTranslationBrief(getSupabaseAdmin(), orderId, langCode) : null
      if (sourceManifestFile && !translationBrief) {
        throw new Error(`Required translation brief missing for hardened order language ${langCode}`)
      }
      if (sourceManifestFile && translationBrief) {
        const sourceHash = JSON.parse(sourceManifestFile.content).sourceHash
        assertTranslationBriefForSource(translationBrief, langCode, sourceHash)
      }
      const briefPrompt = translationBrief ? renderTranslationBriefPrompt(translationBrief) : glossaryPrompt
      const cacheFingerprint = translationBrief ? `brief:${translationBriefFingerprint(translationBrief)}` : 'legacy'

      // Pass 1: Translation
      const chunks = chunkText(fileContent, MAX_CHUNK_WORDS)
      const translatedChunks: string[] = []

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i]
        const chunkResult = await step.run(`translate-${langCode}-chunk-${i}`, async () => {
          let cacheQuery = getSupabaseAdmin().from('translation_chunks').select('content, input_tokens, output_tokens')
            .eq('order_id', orderId).eq('lang_code', langCode).eq('chunk_index', i).eq('pass', 'sonnet')
          if (HARDENED_V1_ENABLED) cacheQuery = cacheQuery.eq('pipeline_version', 'legacy-v1').eq('schema_version', '1.0').eq('structure_fingerprint', cacheFingerprint).eq('model_id', BOOKLINGUA_MODEL_CONFIG.translation)
          const { data: cached } = await cacheQuery.maybeSingle()
          if (cached?.content) {
            return { text: cached.content, input: cached.input_tokens || 0, output: cached.output_tokens || 0 }
          }

          const response = await anthropic.messages.create({
            model: BOOKLINGUA_MODEL_CONFIG.translation,
            max_tokens: 8000,
            system: `You are a professional literary translator. BookLingua only processes content by verified copyright holders.

CRITICAL FORMATTING RULES:
- Preserve ALL original formatting exactly: paragraph breaks, chapter headings, line breaks
- Keep the same structure: if original has a blank line, keep the blank line
- Maintain any special formatting markers or symbols
- Keep chapter numbers/titles in the same position
- Preserve any indentation patterns
- If there are bullet points or numbered lists, keep them formatted the same way
- PRESERVE ###CHAPTER: markers but TRANSLATE the title inside to the target language. Keep the exact format: ###CHAPTER:Spanish Title###
- PRESERVE ###H1: ###H2: ###H3: ###H4: ###H5: and ###H6: heading markers exactly — translate the title inside but keep the format: ###H1:Translated Title###
- PRESERVE all segment markers exactly: ===SEGMENT_123_START=== and ===SEGMENT_123_END=== markers must NOT be translated or modified. Only translate the text BETWEEN these markers.

LANGUAGE SETTINGS:
${langSettings}

GENRE & STYLE:
${genreGuidance}

${stylePrompt}
${briefPrompt}`,
            messages: [{
              role: 'user',
              content: `Translate the following excerpt into ${langName}. This is part ${i + 1} of ${chunks.length} — maintain consistent style.

${chunk}`,
            }],
          })

          const text = response.content[0].type === 'text' ? response.content[0].text : ''
          const cacheRow = {
            order_id: orderId, lang_code: langCode, chunk_index: i, pass: 'sonnet',
            content: text, input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens,
            ...(HARDENED_V1_ENABLED ? { pipeline_version: 'legacy-v1', schema_version: '1.0', structure_fingerprint: cacheFingerprint, model_provider: BOOKLINGUA_MODEL_CONFIG.provider, model_id: BOOKLINGUA_MODEL_CONFIG.translation, model_stage: 'translation' } : {}),
          }
          await getSupabaseAdmin().from('translation_chunks').upsert(cacheRow, { onConflict: HARDENED_V1_ENABLED ? 'order_id,lang_code,chunk_index,pass,pipeline_version,schema_version,structure_fingerprint,model_id' : 'order_id,lang_code,chunk_index,pass' })

          return { text, input: response.usage.input_tokens, output: response.usage.output_tokens }
        })

        translatedChunks.push(chunkResult.text)
        tokenUsage.input += chunkResult.input
        tokenUsage.output += chunkResult.output
      }

      const translatedText = translatedChunks.join('\n\n')

      // Quality gate: Check for refusals
      if (detectRefusal(translatedText) || translatedText.length / fileContent.length < 0.25) {
        throw new Error(`Translation quality gate failed for ${langCode}: output too short or refusal detected`)
      }
      if (!translationPreview) {
        translationPreview = translatedText.split(/\s+/).slice(0, 250).join(' ') + '…'
      }

      if (translationBrief && sourceManifestFile) {
        assertTranslationBriefForSource(translationBrief, langCode, JSON.parse(sourceManifestFile.content).sourceHash)
      }

      // Pass 2: Editorial Review (NEW STRUCTURED FORMAT)
      const editorialChunks = chunkText(translatedText, MAX_EDITORIAL_CHUNK_WORDS)
      const cleanedChunks: string[] = []
      const collectedNotes: string[] = []
      const collectedEmails: string[] = []
      let totalImprovements = 0
      let totalChapters = 0

      for (let i = 0; i < editorialChunks.length; i++) {
        const translatedChunk = editorialChunks[i]
        const origStart = Math.floor((i / editorialChunks.length) * fileContent.length)
        const origEnd = Math.floor(((i + 1) / editorialChunks.length) * fileContent.length)
        const origSlice = fileContent.slice(origStart, Math.min(origEnd, origStart + 10000))
        const chunkLabel = editorialChunks.length > 1 ? ` (chunk ${i + 1}/${editorialChunks.length})` : ''

        const editorialResult = await step.run(`editorial-${langCode}-chunk-${i}`, async () => {
          let cacheQuery = getSupabaseAdmin().from('translation_chunks').select('content, input_tokens, output_tokens')
            .eq('order_id', orderId).eq('lang_code', langCode).eq('chunk_index', i).eq('pass', 'opus')
          if (HARDENED_V1_ENABLED) cacheQuery = cacheQuery.eq('pipeline_version', 'legacy-v1').eq('schema_version', '1.0').eq('structure_fingerprint', cacheFingerprint).eq('model_id', BOOKLINGUA_MODEL_CONFIG.editorial)
          const { data: cached } = await cacheQuery.maybeSingle()
          if (cached?.content) return { text: cached.content, input: cached.input_tokens || 0, output: cached.output_tokens || 0 }

          const response = await anthropic.messages.create({
            model: BOOKLINGUA_MODEL_CONFIG.editorial,
            max_tokens: 8000,
            system: `You are a senior ${langName} literary editor specializing in ${order.genre || 'general'} books. You are operating as part of BookLingua, a professional literary translation service.

CRITICAL OUTPUT RULES:
- Begin your response IMMEDIATELY with the edited text
- Do NOT output analysis preamble or commentary before the text
- The translation notes go at the END only, after ===TRANSLATION_NOTES=== delimiter
- PRESERVE all structural markers exactly: ===SEGMENT_123_START=== and ===SEGMENT_123_END=== markers must NOT be modified

LANGUAGE SETTINGS:
${langSettings}

GENRE & STYLE:
${genreGuidance}

${stylePrompt}

${briefPrompt}`,
            messages: [{
              role: 'user',
              content: `TASK: Review and improve this translation${chunkLabel}.

ORIGINAL ENGLISH:
${origSlice}

TRANSLATION TO REVIEW:
${translatedChunk}

EDITING INSTRUCTIONS:
1. Fix awkward phrasing, grammatical issues, cultural references
2. Maintain author's voice and tone
3. NEVER soften strong language unless wrong register was used
4. Duplicate & untranslated text review: remove duplicates, translate remaining English
5. Cultural adaptation: handle [[ADAPTED:]] markers appropriately

CRITICAL - HIGHLIGHTING FORMAT:
[[ORIGINAL: original phrase]]improved phrase
Only highlight phrases you actually changed.

PRESERVE ALL FORMATTING from the translation (paragraph breaks, chapters, etc.)
- PRESERVE ###CHAPTER: markers exactly as they appear. NEVER create new ###CHAPTER: markers for sub-headings
- PRESERVE ###H1: through ###H6: markers exactly as they appear. Do not create new heading markers. Only translate the text inside the markers.

${i === editorialChunks.length - 1 ? `

After the translation, append this section EXACTLY:

===TRANSLATION_NOTES===
Provide categorized translation decisions referencing actual terms from THIS text. Include 2–5 entries per category.

--- Proper Nouns & Place Names ---
ORIGINAL: [name] | TRANSLATED: [choice] | REASON: [why]

--- Job Titles & Professional Terms ---
ORIGINAL: [title] | TRANSLATED: [choice] | REASON: [brief]

--- Intimate & Sexual Language ---
ORIGINAL: [word] | TRANSLATED: [choice] | REASON: [register]

--- Idioms & Cultural Expressions ---
ORIGINAL: [expression] | TRANSLATED: [equivalent] | REASON: [how preserved]

--- Voice, Register & Tone ---
ORIGINAL: [phrase] | TRANSLATED: [choice] | REASON: [voice maintained]

--- Terms Kept in English ---
ORIGINAL: [term] | KEPT AS: [term] | REASON: [why untranslated]
` : ''}`,
            }],
          })

          const text = response.content[0].type === 'text' ? response.content[0].text : ''
          const cacheRow = {
            order_id: orderId, lang_code: langCode, chunk_index: i, pass: 'opus',
            content: text, input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens,
            ...(HARDENED_V1_ENABLED ? { pipeline_version: 'legacy-v1', schema_version: '1.0', structure_fingerprint: cacheFingerprint, model_provider: BOOKLINGUA_MODEL_CONFIG.provider, model_id: BOOKLINGUA_MODEL_CONFIG.editorial, model_stage: 'editorial' } : {}),
          }
          await getSupabaseAdmin().from('translation_chunks').upsert(cacheRow, { onConflict: HARDENED_V1_ENABLED ? 'order_id,lang_code,chunk_index,pass,pipeline_version,schema_version,structure_fingerprint,model_id' : 'order_id,lang_code,chunk_index,pass' })

          return { text, input: response.usage.input_tokens, output: response.usage.output_tokens }
        })

      // Parse editorial output and strip markers from ALL paths
      const parsed = parse4PartResponse(editorialResult.text)
      
      let chunkOutput: string
      if (parsed.highlighted || parsed.clean) {
        // New format: use structured parts, but still strip any leaked markers
        chunkOutput = stripMarkers(parsed.highlighted || parsed.clean || editorialResult.text)
        if (parsed.notes) collectedNotes.push(parsed.notes)
        if (parsed.email) collectedEmails.push(parsed.email)
        totalImprovements += parsed.counts.improvements
        totalChapters += parsed.counts.chapters
      } else {
        // Old format: whole response is highlighted text — strip markers
        chunkOutput = stripMarkers(editorialResult.text)
      }
      
      // Validate this chunk is clean before adding
      const chunkValidation = validateCleanOutput(chunkOutput, `editorial chunk ${i}`)
      if (!chunkValidation.clean) {
        console.error(`[Pipeline] Chunk ${i} failed validation:`, chunkValidation.issues)
        // Still include it but log the error — don't block entire pipeline on one chunk
      }
      
      cleanedChunks.push(chunkOutput)

        tokenUsage.input += editorialResult.input
        tokenUsage.output += editorialResult.output
      }

      let editorialResult = cleanedChunks.join('\n\n')
      
      // ── Final validation: ensure no markers leaked into reader-facing output ──
      const finalValidation = validateCleanOutput(editorialResult, `final ${langCode} editorial output`)
      if (!finalValidation.clean) {
        console.error(`[Pipeline] CRITICAL: ${langCode} output failed clean validation:`, finalValidation.issues)
        // Log but don't throw — we need to still save for debugging, but mark for review
      }
      const translationNotesParsed = collectedNotes.join('\n\n') || undefined
      const emailSummary = collectedEmails.join('\n\n') || undefined

      // ── Validation ──
      let segmentMeta: Array<{ id: number; type: Segment['type']; level: number }> | null = null
      try {
        const { data: segFile } = await getSupabaseAdmin()
          .from('files')
          .select('content')
          .eq('order_id', orderId)
          .eq('type', 'segments')
          .eq('language', 'en')
          .maybeSingle()
        if (segFile?.content) segmentMeta = JSON.parse(segFile.content)
      } catch (e) {
        console.warn('[Pipeline] Could not load segment metadata for validation:', e)
      }

      const { validateTranslation, formatValidationAlert } = await import('./validate-translation')
      const validation = validateTranslation(translatedText, editorialResult, segmentMeta, langCode)
      console.log(`[Pipeline] Validation: ${validation.summary}`)

      if (!validation.passed) {
        throw new Error(
          `[Validation] BLOCKED — ${langCode}: ${validation.summary}\n` +
          formatValidationAlert(validation)
        )
      }

      // Save to database
      await step.run(`save-translation-${langCode}`, async () => {
        await getSupabaseAdmin().from('files')
          .delete()
          .eq('order_id', orderId).eq('type', 'translated').eq('language', langCode)
        await getSupabaseAdmin().from('files')
          .delete()
          .eq('order_id', orderId).eq('type', 'notes').eq('language', langCode)
        await getSupabaseAdmin().from('files')
          .delete()
          .eq('order_id', orderId).eq('type', 'email_summary').eq('language', langCode)

        await getSupabaseAdmin().from('files').insert({
          order_id: orderId, type: 'translated', language: langCode,
          content: editorialResult, original_content: translatedText,
        })
        if (translationNotesParsed) {
          await getSupabaseAdmin().from('files').insert({
            order_id: orderId, type: 'notes', language: langCode,
            content: translationNotesParsed,
          })
        }
        if (emailSummary) {
          await getSupabaseAdmin().from('files').insert({
            order_id: orderId, type: 'email_summary', language: langCode,
            content: emailSummary,
          })
        }
      })

      translations[langCode] = {
        translated: translatedText,
        edited: editorialResult,
        notes: translationNotesParsed || '',
      }
      if (translationNotesParsed) translationNotes[langCode] = translationNotesParsed

      // ── Step: Generate and store formatted review DOCX ────────────────
      await step.run(`format-review-docx-${langCode}`, async () => {
        try {
          const { writeFileSync, mkdtempSync, readFileSync, rmSync } = await import('fs')
          const { tmpdir } = await import('os')
          const { join } = await import('path')
          const { execSync } = await import('child_process')

          const tmpDir = mkdtempSync(join(tmpdir(), 'bl-review-'))
          try {
            // Build a temporary raw DOCX from the editorial result
            const rawDocxPath = join(tmpDir, 'raw_review.docx')
            const formattedDocxPath = join(tmpDir, 'formatted_review.docx')

            // Write editorial result to a temp text file
            const textPath = join(tmpDir, 'review_text.txt')
            writeFileSync(textPath, editorialResult)

            // Build raw DOCX using a simple Python script
            const buildRawScript = `
from docx import Document
doc = Document()
doc.add_heading('${order.book_title.replace(/'/g, "\\'")}', 0)
doc.add_heading('${langName} Review', level=1)
with open('${textPath}', 'r') as f:
    text = f.read()
for para in text.split('\\n\\n'):
    if para.strip():
        doc.add_paragraph(para.strip())
doc.save('${rawDocxPath}')
`
            const buildScriptPath = join(tmpDir, 'build_raw.py')
            writeFileSync(buildScriptPath, buildRawScript)
            execSync(`python3 "${buildScriptPath}"`, { encoding: 'utf-8' })

            // Run the review formatter
            const formatterPath = join(process.cwd(), 'scripts', 'booklingua_review_formatter.py')
            execSync(
              `python3 "${formatterPath}" "${rawDocxPath}" "${formattedDocxPath}" --lang "${langName}" --title "${order.book_title}"`,
              { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
            )

            // Upload formatted review to Supabase
            const formattedBuffer = readFileSync(formattedDocxPath)
            const { uploadFileToSupabase } = await import('./storage-helper')
            const storagePath = await uploadFileToSupabase(
              orderId,
              'review',
              langCode,
              formattedBuffer,
              `${order.book_title}_${langName}_Review.docx`.replace(/\s+/g, '_')
            )

            console.log(`[Review] Formatted review DOCX stored: ${storagePath}`)
          } finally {
            rmSync(tmpDir, { recursive: true, force: true })
          }
        } catch (e) {
          console.warn(`[Review] Review DOCX generation failed (non-fatal):`, e)
        }
      })
    }

    // Generate download token for the order
    await step.run('generate-download-token', async () => {
      const { data: existingToken } = await getSupabaseAdmin()
        .from('orders')
        .select('download_token')
        .eq('id', orderId)
        .single()
      
      if (!existingToken?.download_token) {
        const crypto = require('crypto')
        const token = crypto.randomBytes(32).toString('base64url').replace(/[^a-zA-Z0-9]/g, '').substring(0, 40)
        await getSupabaseAdmin().from('orders').update({ download_token: token }).eq('id', orderId)
        console.log(`[Pipeline] Generated download token: ${token.substring(0, 10)}...`)
      }
    })

    // Finalize
    const actualCost = calcActualCost(tokenUsage)
    const actualMargin = ((Number(order.amount_paid) - actualCost) / Number(order.amount_paid) * 100).toFixed(1)
    console.log(`[BookLingua] Order ${orderId} complete. Cost: $${actualCost.toFixed(2)} (${actualMargin}% margin)`)

    await getSupabaseAdmin().from('orders').update({
      status: 'pending_review',
      completed_at: null,
      api_cost: parseFloat(actualCost.toFixed(4)),
      margin_pct: parseFloat(actualMargin),
    }).eq('id', orderId)

    // ── Build and send comprehensive review email to Gilly ──
    // This email contains EVERYTHING the customer will receive, so Gilly can review
    // before approving. When approved, the exact same email is sent to the customer.
    await step.run('send-review-email', async () => {
      const { data: filesData } = await getSupabaseAdmin()
        .from('files')
        .select('type, language, content')
        .eq('order_id', orderId)
        .in('type', ['notes', 'email_summary'])

      const notesFile = filesData?.find(f => f.type === 'notes')
      const emailSummaryFile = filesData?.find(f => f.type === 'email_summary')
      const translationNotes = notesFile?.content || ''
      const emailSummary = emailSummaryFile?.content || ''

      const languages = (order.languages as string[]) || []
      const downloadLinks = languages.map((lang: string) => ({
        language: LANGUAGE_NAMES[lang] || lang,
        reviewUrl: buildDownloadUrl(orderId, lang, 'review'),
        finalUrl: buildDownloadUrl(orderId, lang, 'final'),
      }))

      // Build the customer-facing email HTML (this is what the customer will see)
      const customerEmailHtml = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #7c3aed;">Your translations are ready! 📚</h1>
          
          <p>Hi ${order.author_name || 'there'},</p>
          
          <p>Great news! Your translations for <strong>${order.book_title}</strong> are complete and ready for download.</p>
          
          ${emailSummary ? `<div style="background: #f0fdf4; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #22c55e;">
            <p style="margin: 0; color: #166534; font-weight: 600;">📝 Translation Notes</p>
            <div style="margin-top: 8px; color: #374151; font-size: 14px; line-height: 1.5;">
              ${emailSummary.replace(/\n/g, '<br>')}
            </div>
          </div>` : ''}
          
          <div style="background: #f5f3ff; padding: 20px; border-radius: 12px; margin: 20px 0;">
            <h3 style="margin-top: 0;">Download Your Translations</h3>
            ${downloadLinks.map((link: { language: string; reviewUrl: string; finalUrl: string }) => `
              <div style="margin: 14px 0; padding: 12px; background: #fff; border-radius: 8px; border: 1px solid #e5e7eb;">
                <p style="margin: 0 0 8px 0; font-weight: bold; color: #111;">${link.language}</p>
                <p style="margin: 0 0 4px 0;">
                  📝 <a href="${link.reviewUrl}" style="color: #7c3aed; text-decoration: none; font-weight: 500;">Review Version (with highlights)</a>
                  <span style="color: #6b7280; font-size: 12px;"> — see every editorial change in yellow</span>
                </p>
                <p style="margin: 0;">
                  ✅ <a href="${link.finalUrl}" style="color: #059669; text-decoration: none; font-weight: 500;">Final Version (clean, publish-ready)</a>
                  <span style="color: #6b7280; font-size: 12px;"> — ready to upload to KDP or your publisher</span>
                </p>
              </div>
            `).join('')}
          </div>
          
          <div style="background: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0; color: #92400e;">
              <strong>📝 Two files per language — here's how to use them:</strong><br><br>
              <strong>Review Version</strong> — Yellow highlighted text is the first-pass translation. The clean text after it is our editorial improvement. Use this to approve every change before publishing.<br><br>
              <strong>Final Version</strong> — Clean, publish-ready. No highlights. Ready to upload directly to KDP, Atticus, Vellum, or your publisher.
            </p>
          </div>
          
          <p>Download links expire in 7 days. Need them resent? Just reply to this email.</p>
          
          <p>Happy publishing!<br>The BookLingua Team</p>
        </div>
      `

      // Store the customer email HTML in the files table for later use
      // This is what gets sent to the customer when approved
      await getSupabaseAdmin().from('files').delete()
        .eq('order_id', orderId).eq('type', 'customer_email')
      await getSupabaseAdmin().from('files').insert({
        order_id: orderId,
        type: 'customer_email',
        language: 'en',
        content: customerEmailHtml,
      })

      // Send review email to Gilly with everything
      await getResend().emails.send({
        from: 'BookLingua Admin <hello@booklingua.io>',
        to: ['gilly@myromancereads.com'],
        subject: `🔍 REVIEW NEEDED — ${order.book_title} (${languages.join(', ')})`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
              <p style="margin: 0; color: #92400e; font-weight: 600;">⚠️ This is a REVIEW email. Do NOT forward to the customer until approved.</p>
              <p style="margin: 8px 0 0 0; color: #92400e; font-size: 14px;">
                Order: ${orderId}<br>
                Book: ${order.book_title}<br>
                Customer: ${order.email}<br>
                Languages: ${languages.join(', ')}<br>
                <a href="https://booklingua.io/admin" style="color: #7c3aed; font-weight: 600;">Go to Admin Panel →</a>
              </p>
            </div>
            
            <hr style="border: none; border-top: 2px solid #e5e7eb; margin: 30px 0;">
            
            <p style="color: #6b7280; font-size: 14px; margin-bottom: 20px;">
              <strong>Below is the EXACT email the customer will receive after you approve.</strong><br>
              Review it carefully. Click approve in the admin panel when ready.
            </p>
            
            ${customerEmailHtml}
            
            <hr style="border: none; border-top: 2px solid #e5e7eb; margin: 30px 0;">
            
            ${translationNotes ? `<div style="margin: 20px 0;">
              <h3 style="color: #111; margin-bottom: 10px;">📝 Full Translation Notes</h3>
              <div style="background: #f9fafb; padding: 15px; border-radius: 8px; font-size: 13px; line-height: 1.6; color: #374151; white-space: pre-wrap;">${translationNotes.replace(/\n/g, '<br>')}</div>
            </div>` : ''}
          </div>
        `,
      })
    })
  }
)
