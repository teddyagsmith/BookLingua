import { createHash } from 'crypto'
import { readFile } from 'fs/promises'
import path from 'path'
import { SupabaseClient } from '@supabase/supabase-js'
import { parseSemanticDocx, parseSemanticEpub, parseSemanticTxt } from './semantic-parser'
import { evaluateSemanticEligibility, SemanticDocumentV2 } from './semantic-document'
import { createNodeTranslationInput, nodeBatchFingerprint, NodeTranslationInput, NodeTranslationOutput, validateAndMergeNodeOutput } from './node-translation-contract'
import { buildSemanticDocx, buildSemanticEpub, buildSemanticEpubFromDocument, buildSemanticReviewDocx } from './semantic-artifacts'
import { buildChapterMap, renderChapterMapCsv, renderChapterMapDocx } from './chapter-map'
import { validateArtifact } from './artifact-validation-v2'
import { storeImmutableArtifact } from './artifact-store'
import { resolvePackageGate } from './package-gate'
import { renderTranslationNotes, TranslationNotesV1, validateTranslationNotes } from './translation-notes'
import { TranslationBriefV1, assertTranslationBriefForSource, translationBriefFingerprint } from './translation-brief'
import { ArtifactType } from './package-manifest'
import { UPLOAD_GUIDE_ASSET_PATH, UPLOAD_GUIDE_SHA256 } from './upload-guide'
import { LaunchPackV1, validateLaunchPack } from './launch-pack-schema'
import { BOOKLINGUA_MODEL_CONFIG } from './model-config'
import { assertCompleteBatchCoverage, createDeterministicSemanticBatches, semanticBatchIdentity } from './semantic-batching'
import { recordModelTelemetry } from './model-telemetry'

export type SemanticTranslator = (input: NodeTranslationInput, context: {
  pass: 1 | 2
  language: string
  brief: TranslationBriefV1
  batchId: string
  batchIndex: number
  batchCount: number
}) => Promise<NodeTranslationOutput>

export interface SemanticPipelineInput {
  supabase: SupabaseClient
  orderId: string
  language: string
  sourceFormat: 'epub' | 'docx' | 'txt'
  source: Buffer
  title: string
  brief: TranslationBriefV1
  notes: TranslationNotesV1
  translate: SemanticTranslator
  allowReviewedStructure?: boolean
  buildId?: string
  launchPack?: Buffer
  dualFormat?: boolean
  modelProvider?: string
  translationModel?: string
  editorialModel?: string
  maxBatchOutputWords?: number
  maxBatchConcurrency?: number
}

export function deterministicSemanticBuildId(orderId: string, language: string, sourceHash: string, briefRevision: number): string {
  const hex = createHash('sha256').update(`${orderId}:${language}:${sourceHash}:${briefRevision}:semantic-v2`).digest('hex').slice(0, 32).split('')
  hex[12] = '5'; hex[16] = ((parseInt(hex[16], 16) & 3) | 8).toString(16)
  return `${hex.slice(0,8).join('')}-${hex.slice(8,12).join('')}-${hex.slice(12,16).join('')}-${hex.slice(16,20).join('')}-${hex.slice(20).join('')}`
}

function fingerprint(document: SemanticDocumentV2): string {
  return nodeBatchFingerprint(document.nodes.map(node => ({ id: node.id, text: node.sourceText })))
}

async function persistSemantic(supabase: SupabaseClient, input: { orderId: string; language?: string; buildId?: string; pass: 'source'|'pass1'|'pass2'; document: SemanticDocumentV2; eligibility: string }) {
  const row = { order_id: input.orderId, language: input.language || null, build_id: input.buildId || null, pass: input.pass, schema_version: input.document.schemaVersion, source_hash: input.document.sourceHash, structure_fingerprint: fingerprint(input.document), eligibility: input.eligibility, document: input.document }
  const { error } = await supabase.from('semantic_documents').insert(row)
  if (error && error.code !== '23505') throw new Error(`Semantic persistence failed: ${error.message}`)
  if (error?.code === '23505') {
    const query = supabase.from('semantic_documents').select('source_hash,structure_fingerprint,document').eq('order_id', input.orderId).eq('pass', input.pass)
    if (input.language) query.eq('language', input.language); else query.is('language', null)
    if (input.buildId) query.eq('build_id', input.buildId); else query.is('build_id', null)
    const { data } = await query.single()
    if (!data || data.source_hash !== row.source_hash || data.structure_fingerprint !== row.structure_fingerprint) throw new Error('Semantic retry differs from immutable persisted state')
  }
}

async function validationReport(supabase: SupabaseClient, input: { orderId: string; language: string; buildId: string; stage: string; passed: boolean; errors?: unknown[]; metrics?: object }): Promise<string> {
  const validatorVersion = 'semantic-v2.1'
  const { data, error } = await supabase.from('validation_reports').insert({ order_id: input.orderId, language: input.language, build_id: input.buildId, stage: input.stage, validator_version: validatorVersion, passed: input.passed, errors: input.errors || [], metrics: input.metrics || {} }).select('id').single()
  if (error?.code === '23505') {
    const { data: existing, error: existingError } = await supabase.from('validation_reports').select('id,passed,errors,metrics').eq('order_id',input.orderId).eq('language',input.language).eq('build_id',input.buildId).eq('stage',input.stage).eq('validator_version',validatorVersion).single()
    if (existingError || !existing || existing.passed !== input.passed || JSON.stringify(existing.errors)!==JSON.stringify(input.errors||[])) throw new Error('Validation retry differs from immutable report')
    return existing.id
  }
  if (error) throw new Error(`Validation report persistence failed: ${error.message}`)
  return data.id
}

async function storeValidated(input: SemanticPipelineInput, buildId: string, type: ArtifactType, filename: string, buffer: Buffer, kind?: 'docx'|'epub') {
  // Partial-build retries reuse already validated immutable artifacts. The
  // deterministic build ID binds them to the exact source/brief/language, and
  // avoids regenerating container formats after a later stage fails.
  const { data: existing, error: existingError } = await input.supabase.from('artifacts')
    .select('id,artifact_type,filename,storage_bucket,storage_path,sha256,size_bytes,schema_version,validation_status,validation_report_id')
    .eq('order_id', input.orderId).eq('language', input.language).eq('build_id', buildId)
    .eq('artifact_type', type).maybeSingle()
  if (existingError) throw new Error(`Artifact cache lookup failed: ${existingError.message}`)
  if (existing) return {
    id: existing.id, buildId, type: existing.artifact_type, required: true,
    filename: existing.filename, storageBucket: existing.storage_bucket,
    storagePath: existing.storage_path, sha256: existing.sha256,
    sizeBytes: Number(existing.size_bytes), schemaVersion: existing.schema_version || undefined,
    validationStatus: existing.validation_status, validationReportId: existing.validation_report_id || undefined,
  }
  const result = kind ? validateArtifact(buffer, kind) : { passed: buffer.length > 0, errors: buffer.length ? [] : [{ code: 'EMPTY', message: 'Artifact empty' }], metrics: {} }
  const reportId = await validationReport(input.supabase, { orderId: input.orderId, language: input.language, buildId, stage: `artifact:${type}`, passed: result.passed, errors: result.errors, metrics: result.metrics })
  if (!result.passed) throw new Error(`${type} validation failed: ${result.errors.map((error: any) => error.message).join('; ')}`)
  return storeImmutableArtifact({ supabase: input.supabase, orderId: input.orderId, language: input.language, buildId, type, filename, buffer, schemaVersion: 'semantic-v2', validationStatus: 'pass', validationReportId: reportId })
}

async function cachedTranslation(input: SemanticPipelineInput, batch: NodeTranslationInput, pass: 1|2, batchIndex: number, batchCount: number, batchId: string, authoritativeNodes: SemanticDocumentV2['nodes']): Promise<SemanticDocumentV2['nodes']> {
  const modelProvider = input.modelProvider || BOOKLINGUA_MODEL_CONFIG.provider
  const modelId = pass === 1
    ? input.translationModel || BOOKLINGUA_MODEL_CONFIG.translation
    : input.editorialModel || BOOKLINGUA_MODEL_CONFIG.editorial
  const modelStage = pass === 1 ? 'translation' : 'editorial'
  const cache = input.supabase.from('translation_chunks').select('content').eq('order_id',input.orderId).eq('lang_code',input.language)
    .eq('chunk_index',batchIndex).eq('pass',`semantic-pass${pass}`).eq('pipeline_version','semantic-v2').eq('schema_version',batch.schemaVersion).eq('structure_fingerprint',batchId).eq('model_provider',modelProvider).eq('model_id',modelId).eq('model_stage',modelStage)
  const { data: existing, error: readError } = await cache.maybeSingle()
  if (readError) throw new Error(`Semantic cache read failed: ${readError.message}`)
  if (existing?.content) {
    await recordModelTelemetry(input.supabase,{orderId:input.orderId,language:input.language,stage:modelStage,batchId,attempt:1,
      requestIdentity:`${batchId}:cache-hit`,provider:modelProvider,modelId,success:true,inputTokens:0,outputTokens:0,cacheStatus:'hit'})
    return validateAndMergeNodeOutput(authoritativeNodes, JSON.parse(existing.content), batch.sourceFingerprint)
  }
  const output = await input.translate(batch,{pass,language:input.language,brief:input.brief,batchId,batchIndex,batchCount})
  const validated = validateAndMergeNodeOutput(authoritativeNodes, output, batch.sourceFingerprint)
  const { error } = await input.supabase.from('translation_chunks').upsert({ order_id:input.orderId,lang_code:input.language,chunk_index:batchIndex,pass:`semantic-pass${pass}`,content:JSON.stringify(output),pipeline_version:'semantic-v2',schema_version:batch.schemaVersion,structure_fingerprint:batchId,model_provider:modelProvider,model_id:modelId,model_stage:modelStage },{onConflict:'order_id,lang_code,chunk_index,pass,pipeline_version,schema_version,structure_fingerprint,model_id'})
  if (error) throw new Error(`Semantic cache persistence failed: ${error.message}`)
  return validated
}

async function runBatchedPass(input: SemanticPipelineInput, authoritative: SemanticDocumentV2['nodes'], pass: 1|2): Promise<SemanticDocumentV2['nodes']> {
  const modelId = pass === 1 ? input.translationModel || BOOKLINGUA_MODEL_CONFIG.translation : input.editorialModel || BOOKLINGUA_MODEL_CONFIG.editorial
  const batches = createDeterministicSemanticBatches(authoritative, input.maxBatchOutputWords)
  assertCompleteBatchCoverage(authoritative, batches)
  const documentInput = createNodeTranslationInput(authoritative)
  const briefFingerprint = translationBriefFingerprint(input.brief)
  const translatedByBatch: Array<SemanticDocumentV2['nodes']> = new Array(batches.length)
  const concurrency = Math.max(1, Math.min(4, input.maxBatchConcurrency ?? 3))
  let nextBatch = 0
  let stopped = false
  async function worker() {
    while (true) {
      if (stopped) return
      const index = nextBatch++
      if (index >= batches.length) return
      const batch = batches[index]
    const batchInput = createNodeTranslationInput(batch.nodes)
    const batchId = semanticBatchIdentity({
      orderId: input.orderId,
      language: input.language,
      documentFingerprint: documentInput.sourceFingerprint,
      pass,
      orderedNodeIds: batch.orderedNodeIds,
      briefRevision: input.brief.revision,
      briefFingerprint,
      modelId,
      schemaVersion: batchInput.schemaVersion,
    })
      try {
        translatedByBatch[index] = await cachedTranslation(input, batchInput, pass, batch.index, batches.length, batchId, batch.nodes)
      } catch (error) {
        stopped = true
        throw error
      }
    }
  }
  // Drain already-started provider calls before surfacing a failure. This
  // prevents a retry from racing in-flight batches and creating duplicate cost.
  const workerResults = await Promise.allSettled(Array.from({ length: Math.min(concurrency, batches.length) }, () => worker()))
  const failedWorker = workerResults.find((result): result is PromiseRejectedResult => result.status === 'rejected')
  if (failedWorker) throw failedWorker.reason
  const translated = translatedByBatch.flat()
  if (translated.length !== authoritative.length || authoritative.some((node,index) => translated[index]?.id !== node.id
    || translated[index]?.chapterId !== node.chapterId || translated[index]?.sourceChapterNumber !== node.sourceChapterNumber
    || translated[index]?.order !== node.order)) throw new Error(`Pass ${pass} aggregate semantic identity validation failed`)
  return translated
}

export async function runSemanticPipeline(input: SemanticPipelineInput) {
  const sourceHash = createHash('sha256').update(input.source).digest('hex')
  const sourceDocument = input.sourceFormat === 'epub' ? parseSemanticEpub(input.source, sourceHash)
    : input.sourceFormat === 'docx' ? await parseSemanticDocx(input.source, sourceHash)
      : parseSemanticTxt(input.source.toString('utf8'), sourceHash)
  const eligibility = evaluateSemanticEligibility(sourceDocument)
  if (eligibility.status === 'unsupported' || (eligibility.status === 'review_required' && !input.allowReviewedStructure)) throw new Error(`Semantic structure ${eligibility.status}: ${eligibility.reasons.join('; ')}`)
  assertTranslationBriefForSource(input.brief, input.language, sourceHash)
  const { data: persistedBrief, error: briefError } = await input.supabase.from('translation_briefs')
    .select('source_manifest_fingerprint,content_fingerprint,approved_at,brief').eq('order_id', input.orderId)
    .eq('language', input.language).eq('revision', input.brief.revision).single()
  if (briefError || !persistedBrief || persistedBrief.source_manifest_fingerprint !== sourceHash
    || persistedBrief.content_fingerprint !== translationBriefFingerprint(input.brief)
    || translationBriefFingerprint(persistedBrief.brief as TranslationBriefV1) !== translationBriefFingerprint(input.brief)) throw new Error('Translation brief is not the authoritative persisted revision')
  const noteErrors = validateTranslationNotes(input.notes); if (noteErrors.length) throw new Error(noteErrors.join('; '))
  await persistSemantic(input.supabase, { orderId: input.orderId, pass: 'source', document: sourceDocument, eligibility: eligibility.status })

  const buildId = input.buildId || deterministicSemanticBuildId(input.orderId, input.language, sourceHash, input.brief.revision)
  const { error: buildError } = await input.supabase.rpc('begin_order_language_build', { p_order_id: input.orderId, p_language: input.language, p_build_id: buildId })
  if (buildError) throw new Error(`Build allocation failed: ${buildError.message}`)
  const pass1 = { ...sourceDocument, nodes: await runBatchedPass(input, sourceDocument.nodes, 1) }
  await persistSemantic(input.supabase, { orderId: input.orderId, language: input.language, buildId, pass: 'pass1', document: pass1, eligibility: eligibility.status })
  const pass2 = { ...pass1, nodes: await runBatchedPass(input, pass1.nodes, 2) }
  await persistSemantic(input.supabase, { orderId: input.orderId, language: input.language, buildId, pass: 'pass2', document: pass2, eligibility: eligibility.status })

  // A completed build is immutable. Retries must reuse its validated package rather
  // than regenerate container formats (DOCX ZIP metadata is not byte-stable).
  const { data: completedPackage, error: completedPackageError } = await input.supabase
    .from('package_manifests').select('manifest').eq('order_id', input.orderId)
    .eq('language', input.language).eq('build_id', buildId).eq('status', 'pass').maybeSingle()
  if (completedPackageError) throw new Error(`Completed package lookup failed: ${completedPackageError.message}`)
  if (completedPackage?.manifest) {
    return { buildId, eligibility, pass1, pass2, manifest: completedPackage.manifest }
  }

  await storeValidated(input, buildId, 'translation_brief', 'translation-brief.json', Buffer.from(JSON.stringify(input.brief, null, 2)))
  await storeValidated(input, buildId, 'pass1_docx', `${input.title} - ${input.language} - Pass 1.docx`, await buildSemanticDocx(pass1, input.title, 'pass1'), 'docx')
  await storeValidated(input, buildId, 'review_docx', `${input.title} - ${input.language} - Review.docx`, await buildSemanticReviewDocx(pass1, pass2, input.title), 'docx')
  if (input.sourceFormat === 'epub' || input.dualFormat) await storeValidated(input, buildId, 'final_epub', `${input.title} - ${input.language} - Final.epub`, input.sourceFormat === 'epub' ? buildSemanticEpub(input.source, pass2) : buildSemanticEpubFromDocument(pass2, input.title), 'epub')
  if (input.sourceFormat !== 'epub' || input.dualFormat) await storeValidated(input, buildId, 'final_docx', `${input.title} - ${input.language} - Final.docx`, await buildSemanticDocx(pass2, input.title, 'final'), 'docx')
  const map = buildChapterMap(pass2)
  if (map.some(row => row.status !== 'mapped')) throw new Error('Chapter map is incomplete')
  await storeValidated(input, buildId, 'chapter_map_csv', 'chapter-map.csv', Buffer.from(renderChapterMapCsv(map)))
  await storeValidated(input, buildId, 'chapter_map_docx', 'chapter-map.docx', await renderChapterMapDocx(map), 'docx')
  await storeValidated(input, buildId, 'translation_notes', 'translation-notes.txt', Buffer.from(renderTranslationNotes(input.notes)))
  const guidePath = path.join(process.cwd(), 'public', UPLOAD_GUIDE_ASSET_PATH.replace(/^\//, ''))
  const guide = await readFile(guidePath)
  if (createHash('sha256').update(guide).digest('hex') !== UPLOAD_GUIDE_SHA256) throw new Error('Pinned upload guide hash mismatch')
  await storeValidated(input, buildId, 'upload_guide', 'BookLingua Author Upload Guide.docx', guide)
  if (input.launchPack) {
    let pack: LaunchPackV1
    try { pack = JSON.parse(input.launchPack.toString('utf8')) } catch { throw new Error('Launch Pack is not valid JSON') }
    const launchErrors = validateLaunchPack({ pack, expectedLocale: input.language, purchased: true })
    if (launchErrors.length) throw new Error(`Launch Pack validation failed: ${launchErrors.join('; ')}`)
    await storeValidated(input, buildId, 'launch_pack', 'launch-pack.json', input.launchPack)
  }
  return { buildId, eligibility, pass1, pass2, manifest: await resolvePackageGate(input.supabase, { orderId: input.orderId, language: input.language, buildId }) }
}
