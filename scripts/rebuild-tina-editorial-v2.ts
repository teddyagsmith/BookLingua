import crypto from 'node:crypto'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { downloadOriginalBinary } from '../lib/source-binary'
import { parseSemanticEpub } from '../lib/semantic-parser'
import { createDeterministicSemanticBatches, semanticBatchIdentity } from '../lib/semantic-batching'
import { createNodeTranslationInput } from '../lib/node-translation-contract'
import { deterministicSemanticBuildId, runSemanticPipeline, SEMANTIC_PROMPT_SIGNATURE } from '../lib/semantic-pipeline'
import { TRANSLATION_PROMPT_VERSION, TRANSLATION_SYSTEM_PROMPT, editorialSystemPrompt } from '../lib/editorial-prompt'
import { BOOKLINGUA_MODEL_CONFIG } from '../lib/model-config'
import { renderTranslationBriefPrompt, translationBriefFingerprint, TranslationBriefV1 } from '../lib/translation-brief'
import { translateWithDeterministicJsonRecovery } from '../lib/semantic-model-recovery'
import { recordModelTelemetry } from '../lib/model-telemetry'

const ORDER = '6b47fdde-389a-49ad-ab94-fcc2e1ea08cc'
const EXPECTED_SOURCE_HASH = '45c37894a23e9101c05b2424a7eed5c63e163662f90e6d067cf193d692e74d87'
const LANGUAGES: Record<string,string> = {
  de: 'German',
}
const VERIFIED_TITLES: Record<string,string> = {
  'es-es':'Recupera tu longevidad',fr:'Reconquérez votre longévité',
  'pt-br':'Reconquiste Sua Longevidade',de:'Erobern Sie Ihre Langlebigkeit zurück',
}

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

async function seedPass1(language: string, sourceDocument: any, currentBuildId: string, brief: TranslationBriefV1) {
  const { data: row, error } = await db.from('semantic_documents').select('document').eq('order_id', ORDER).eq('language', language).eq('build_id', currentBuildId).eq('pass', 'pass1').single()
  if (error || !row?.document) throw new Error(`${language}: current Pass 1 missing`)
  const translated = new Map(row.document.nodes.map((node: any) => [node.id, node]))
  if (translated.size !== sourceDocument.nodes.length) throw new Error(`${language}: Pass 1 node count differs from source`)
  const batches = createDeterministicSemanticBatches(sourceDocument.nodes)
  const documentInput = createNodeTranslationInput(sourceDocument.nodes)
  const briefFingerprint = translationBriefFingerprint(brief)
  for (const batch of batches) {
    const input = createNodeTranslationInput(batch.nodes)
    const nodes = batch.nodes.map((node: any) => {
      const prior: any = translated.get(node.id)
      if (!prior || prior.sourceText !== node.sourceText || !prior.translatedText?.trim()) throw new Error(`${language}: incompatible Pass 1 node ${node.id}`)
      return { id: node.id, text: prior.translatedText }
    })
    const batchId = semanticBatchIdentity({
      orderId: ORDER, language, documentFingerprint: documentInput.sourceFingerprint, pass: 1,
      orderedNodeIds: batch.orderedNodeIds, briefRevision: brief.revision, briefFingerprint,
      modelId: BOOKLINGUA_MODEL_CONFIG.translation, schemaVersion: input.schemaVersion,
      promptVersion: TRANSLATION_PROMPT_VERSION,
    })
    const content = JSON.stringify({ schemaVersion: input.schemaVersion, sourceFingerprint: input.sourceFingerprint, nodes })
    const { error: upsertError } = await db.from('translation_chunks').upsert({
      order_id: ORDER, lang_code: language, chunk_index: batch.index, pass: 'semantic-pass1', content,
      pipeline_version: 'semantic-v2', schema_version: input.schemaVersion, structure_fingerprint: batchId,
      model_provider: BOOKLINGUA_MODEL_CONFIG.provider, model_id: BOOKLINGUA_MODEL_CONFIG.translation, model_stage: 'translation',
    }, { onConflict: 'order_id,lang_code,chunk_index,pass,pipeline_version,schema_version,structure_fingerprint,model_id' })
    if (upsertError) throw new Error(`${language}: Pass 1 cache bridge failed: ${upsertError.message}`)
  }
  return batches.length
}

async function currentLaunchPack(language: string, buildId: string): Promise<Buffer> {
  const { data: artifact, error } = await db.from('artifacts').select('storage_bucket,storage_path').eq('order_id', ORDER).eq('language', language).eq('build_id', buildId).eq('artifact_type', 'launch_pack').single()
  if (error || !artifact) throw new Error(`${language}: current Launch Pack missing`)
  const blob = await db.storage.from(artifact.storage_bucket).download(artifact.storage_path)
  if (blob.error || !blob.data) throw new Error(`${language}: current Launch Pack download failed`)
  return Buffer.from(await blob.data.arrayBuffer())
}

async function main() {
  const { data: order, error: orderError } = await db.from('orders').select('*').eq('id', ORDER).single()
  if (orderError || !order) throw new Error('Tina order unavailable')
  const { data: file, error: fileError } = await db.from('files').select('file_url,original_content').eq('order_id', ORDER).eq('type', 'original').single()
  if (fileError || !file) throw new Error('Tina source unavailable')
  const metadata = JSON.parse(file.original_content || '{}')
  const source = await downloadOriginalBinary(db, file.file_url, metadata.sha256 || null, metadata.storageBucket)
  const sourceHash = crypto.createHash('sha256').update(source).digest('hex')
  if (sourceHash !== EXPECTED_SOURCE_HASH) throw new Error('Tina source hash changed')
  const sourceDocument = parseSemanticEpub(source, sourceHash)

  for (const [language, languageName] of Object.entries(LANGUAGES)) {
    const { data: passedManifest, error: buildError } = await db.from('package_manifests').select('build_id').eq('order_id', ORDER).eq('language', language).eq('status', 'pass').order('created_at', { ascending: false }).limit(1).single()
    if (buildError || !passedManifest?.build_id) throw new Error(`${language}: latest passed build unavailable`)
    const current = { id: passedManifest.build_id }
    const { data: briefRow, error: briefError } = await db.from('translation_briefs').select('brief,revision').eq('order_id', ORDER).eq('language', language).order('revision', { ascending: false }).limit(1).single()
    if (briefError || !briefRow?.brief) throw new Error(`${language}: translation brief unavailable`)
    const priorBrief = briefRow.brief as TranslationBriefV1
    const brief:TranslationBriefV1={...priorBrief,revision:Number(briefRow.revision)+1,approvedAt:new Date().toISOString(),approvalSource:'admin',readerRegister:'formal_sie'}
    const {error:briefInsertError}=await db.from('translation_briefs').insert({order_id:ORDER,language,schema_version:brief.schemaVersion,revision:brief.revision,source_manifest_fingerprint:brief.sourceManifestFingerprint,content_fingerprint:translationBriefFingerprint(brief),approved_at:brief.approvedAt,approval_source:brief.approvalSource,brief})
    if(briefInsertError&&!/duplicate/i.test(briefInsertError.message))throw new Error(`${language}: formal register brief insert failed: ${briefInsertError.message}`)
    const pass1Batches = createDeterministicSemanticBatches(sourceDocument.nodes).length
    const launchPack = await currentLaunchPack(language, current.id)
    const seeded=await seedPass1(language,sourceDocument,current.id,brief)
    const notes = {
      schemaVersion: '1.0' as const, language,
      approach: 'Author-approved terminology decisions applied consistently in both translation passes.',
      sections: brief.items.length ? [{ id: 'author-decisions', title: 'Author-approved decisions', entries: brief.items.map(item => ({ source: item.sourceTerm, target: item.targetInstruction, reason: item.authorDecision })) }] : [],
    }
    let attempt = 0
    const verifiedEditorialOverrides=language==='fr'?[{
      nodeId:'node-000375',before:'en utilisant quelle que soit la source d’énergie disponible',
      after:'en utilisant la source d’énergie disponible, quelle qu’elle soit',
    }]:[]
    const result = await runSemanticPipeline({
      supabase: db, orderId: ORDER, language, sourceFormat: 'epub', source,
      title: order.book_title, authorName: order.author_name, genre: order.genre || undefined,
      verifiedTranslatedTitle: VERIFIED_TITLES[language],
      brief, notes, buildId: deterministicSemanticBuildId(ORDER, language, sourceHash, brief.revision,`${SEMANTIC_PROMPT_SIGNATURE}${verifiedEditorialOverrides.length?'+verified-fr-energy-v1':''}`),
      verifiedEditorialOverrides,
      allowReviewedStructure: order.semantic_structure_approved === true, launchPack, dualFormat: (order.upsells || []).includes('dual-format'), maxBatchConcurrency: 3,
      translate: async (batch, context) => {
        const stage = context.pass === 1 ? 'translation' : 'editorial'
        const requestIdentity = `${ORDER}:${language}:${stage}:${context.batchId}`
        return translateWithDeterministicJsonRecovery(batch, requestIdentity, async (requestBatch, recovery) => {
          let response: any
          try {
            response = await anthropic.messages.create({
              model: context.pass === 1 ? BOOKLINGUA_MODEL_CONFIG.translation : BOOKLINGUA_MODEL_CONFIG.editorial, max_tokens: 20000,
              system: context.pass === 1 ? TRANSLATION_SYSTEM_PROMPT : editorialSystemPrompt(languageName, order.genre || undefined),
              messages: [{ role: 'user', content: `${renderTranslationBriefPrompt(brief)}\n${context.pass === 1 ? 'Translation pass' : 'Editorial pass'}; target language ${language}.\n${JSON.stringify(requestBatch)}` }],
            })
            const text = response.content.find((block: any) => block.type === 'text')
            if (!text || text.type !== 'text') throw new Error(`Editorial model returned no JSON text (stop=${response.stop_reason || 'unknown'}, blocks=${response.content.map((block: any) => block.type).join(',') || 'none'})`)
            const parsed = JSON.parse(text.text.replace(/^```json\s*|\s*```$/g, ''))
            await recordModelTelemetry(db, { orderId: ORDER, language, stage, batchId: context.batchId, attempt: ++attempt, requestIdentity: recovery.requestId, provider: 'anthropic', modelId: response.model, providerRequestId: response.id, success: true, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens, cacheStatus: 'write' })
            return parsed
          } catch (error) {
            await recordModelTelemetry(db, { orderId: ORDER, language, stage, batchId: context.batchId, attempt: ++attempt, requestIdentity: recovery.requestId, provider: 'anthropic', modelId: response?.model || (context.pass === 1 ? BOOKLINGUA_MODEL_CONFIG.translation : BOOKLINGUA_MODEL_CONFIG.editorial), providerRequestId: response?.id, success: false, inputTokens: response?.usage.input_tokens, outputTokens: response?.usage.output_tokens, cacheStatus: 'miss', errorCode: error instanceof SyntaxError ? 'MODEL_JSON_INVALID' : error instanceof Error ? error.name : 'MODEL_FAILURE' })
            throw error
          }
        })
      },
    })
    console.log(JSON.stringify({ language, oldBuildId: current.id, newBuildId: result.buildId, pass1Batches,seeded, packageStatus: result.manifest.status }))
  }
  const gate = await db.rpc('resolve_reader_panel_gate', { p_order_id: ORDER })
  if (gate.error) throw new Error(`Reader-panel hold failed: ${gate.error.message}`)
  console.log(JSON.stringify({ orderStatus: gate.data, customerEmailSent: false }))
}

main().catch(error => { console.error(error); process.exit(1) })
