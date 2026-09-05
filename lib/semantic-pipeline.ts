import { createHash } from 'crypto'
import { readFile } from 'fs/promises'
import path from 'path'
import { SupabaseClient } from '@supabase/supabase-js'
import { parseSemanticDocx, parseSemanticEpub, parseSemanticTxt } from './semantic-parser'
import { evaluateSemanticEligibility, SemanticDocumentV2 } from './semantic-document'
import { createNodeTranslationInput, nodeBatchFingerprint, NodeTranslationInput, NodeTranslationOutput, validateAndMergeNodeOutput } from './node-translation-contract'
import { buildFinalSemanticDocx, buildSemanticDocx, buildSemanticEpub, buildSemanticEpubFromDocument, buildSemanticReviewDocx, consolidatedArtifactNodes, epubEmphasisByLocation, normalizeEpubImages, resolveBookAuthor } from './semantic-artifacts'
import { buildChapterMap, renderChapterMapCsv, renderChapterMapDocx } from './chapter-map'
import { validateArtifact } from './artifact-validation-v2'
import { storeImmutableArtifact } from './artifact-store'
import { resolvePackageGate } from './package-gate'
import { deriveEditorialTranslationNotes, renderTranslationNotes, TranslationNotesV1, validateTranslationNotes } from './translation-notes'
import { applyTitleAuthority, resolveTitleAuthority } from './authoritative-title'
import { TranslationBriefV1, assertTranslationBriefForSource, translationBriefFingerprint } from './translation-brief'
import { ArtifactType } from './package-manifest'
import { UPLOAD_GUIDE_ASSET_PATH, UPLOAD_GUIDE_SHA256 } from './upload-guide'
import { LaunchPackV1, validateLaunchPack, validateLaunchPackRegister } from './launch-pack-schema'
import { renderCustomerLaunchPackDocx } from './customer-delivery-docx'
import { BOOKLINGUA_MODEL_CONFIG } from './model-config'
import { assertCompleteBatchCoverage, createDeterministicSemanticBatches, semanticBatchIdentity } from './semantic-batching'
import { recordModelTelemetry } from './model-telemetry'
import { assertSourceAwareDuplicateParity, assertSourceAwareHeadingDuplicateParity } from './semantic-duplicate-validation'
import { EDITORIAL_PROMPT_VERSION, TRANSLATION_PROMPT_VERSION } from './editorial-prompt'
import { normalizeTypography } from './typography'
import { ReaderRegister, resolveReaderRegister, readerRegisterPromptLine } from './reader-register'
import { checkDeliveredDocx, describeFailures, inspectDeliveredDocx } from './delivery-contract'

/** Below this share of nodes changed, an editorial pass is treated as having done nothing. */
export const EDITORIAL_MIN_CHANGE_RATIO = 0.01

export type SemanticTranslator = (input: NodeTranslationInput, context: {
  pass: 1 | 2
  language: string
  brief: TranslationBriefV1
  genre?: string
  /** Resolved for every order; the translator must pass it to both passes. */
  readerRegister: ReaderRegister
  readerRegisterPrompt: string
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
  /** A separately verified title translation, used when the source title exists only in metadata. */
  verifiedTranslatedTitle?: string
  verifiedEditorialOverrides?: Array<{ nodeId:string; before:string; after:string }>
  authorName?: string
  genre?: string
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

export function applyVerifiedEditorialOverrides(document:SemanticDocumentV2,overrides:NonNullable<SemanticPipelineInput['verifiedEditorialOverrides']>):SemanticDocumentV2{
  if(!overrides.length)return document
  const pending=new Map(overrides.map(item=>[item.nodeId,item]))
  const nodes=document.nodes.map(node=>{
    const override=pending.get(node.id);if(!override)return node
    pending.delete(node.id)
    const text=node.translatedText||'',occurrences=text.split(override.before).length-1
    if(!override.before||!override.after||occurrences!==1)throw new Error(`Verified editorial override does not match exactly once at ${node.id}`)
    return{...node,translatedText:text.replace(override.before,override.after)}
  })
  if(pending.size)throw new Error(`Verified editorial override node missing: ${Array.from(pending.keys()).join(', ')}`)
  return{...document,nodes}
}

/**
 * A build is immutable once its package passes, so the identity must cover everything
 * that changes the output. Prompt versions are included: without them, re-running after
 * a prompt change persists new passes but returns the previously completed package,
 * leaving the delivered files untouched.
 */
 /**
 * Bump when parsing or artifact generation changes what the delivered files contain.
 * Prompt versions alone are not enough: a parser or builder change produces different
 * output from identical inputs, and without this the completed package short-circuits
 * and the customer's files never change.
 */
export const PIPELINE_OUTPUT_VERSION = 'output-v7-delivery-contract'
 
 export const SEMANTIC_PROMPT_SIGNATURE = `${TRANSLATION_PROMPT_VERSION}+${EDITORIAL_PROMPT_VERSION}+${PIPELINE_OUTPUT_VERSION}`
export const SEMANTIC_BUILD_POLICY_VERSION = 'semantic-v2-review-diff-spacing-v6'

export function deterministicSemanticBuildId(orderId: string, language: string, sourceHash: string, briefRevision: number, promptSignature: string = SEMANTIC_PROMPT_SIGNATURE): string {
  const hex = createHash('sha256').update(`${orderId}:${language}:${sourceHash}:${briefRevision}:${SEMANTIC_BUILD_POLICY_VERSION}:${promptSignature}`).digest('hex').slice(0, 32).split('')
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
    // The order-level source row is an immutable record of the uploaded binary's
    // first admitted parse. Later parser versions may legitimately produce a new
    // structure from those exact same bytes; build-scoped pass documents preserve
    // that new structure. A different source hash remains forbidden.
    if (!data || data.source_hash !== row.source_hash || (input.pass !== 'source' && data.structure_fingerprint !== row.structure_fingerprint)) throw new Error('Semantic retry differs from immutable persisted state')
  }
}

async function validationReport(supabase: SupabaseClient, input: { orderId: string; language: string; buildId: string; stage: string; passed: boolean; errors?: unknown[]; metrics?: object }): Promise<string> {
  const validatorVersion = 'semantic-v2.4'
  const { data, error } = await supabase.from('validation_reports').insert({ order_id: input.orderId, language: input.language, build_id: input.buildId, stage: input.stage, validator_version: validatorVersion, passed: input.passed, errors: input.errors || [], metrics: input.metrics || {} }).select('id').single()
  if (error?.code === '23505') {
    const { data: existing, error: existingError } = await supabase.from('validation_reports').select('id,passed,errors,metrics').eq('order_id',input.orderId).eq('language',input.language).eq('build_id',input.buildId).eq('stage',input.stage).eq('validator_version',validatorVersion).single()
    if (existingError || !existing || existing.passed !== input.passed || JSON.stringify(existing.errors)!==JSON.stringify(input.errors||[])) throw new Error('Validation retry differs from immutable report')
    return existing.id
  }
  if (error) throw new Error(`Validation report persistence failed: ${error.message}`)
  return data.id
}

async function storeValidated(input: SemanticPipelineInput, buildId: string, type: ArtifactType, filename: string, buffer: Buffer, kind?: 'docx'|'epub', semanticDuplicateParityValidated = false,expectedCreator?:string) {
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
  const result = kind ? validateArtifact(buffer, kind, { semanticDuplicateParityValidated, semanticHeadingDuplicateParityValidated: semanticDuplicateParityValidated, expectedLanguage: input.language,expectedCreator }) : { passed: buffer.length > 0, errors: buffer.length ? [] : [{ code: 'EMPTY', message: 'Artifact empty' }], metrics: {} }
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
  const readerRegister = resolveReaderRegister({ brief: input.brief, genre: input.genre, language: input.language })
  const output = await input.translate(batch,{pass,language:input.language,brief:input.brief,genre:input.genre,
    readerRegister,readerRegisterPrompt:readerRegisterPromptLine(input.language,readerRegister),batchId,batchIndex,batchCount})
  const validated = validateAndMergeNodeOutput(authoritativeNodes, output, batch.sourceFingerprint)
  const { error } = await input.supabase.from('translation_chunks').upsert({ order_id:input.orderId,lang_code:input.language,chunk_index:batchIndex,pass:`semantic-pass${pass}`,content:JSON.stringify(output),pipeline_version:'semantic-v2',schema_version:batch.schemaVersion,structure_fingerprint:batchId,model_provider:modelProvider,model_id:modelId,model_stage:modelStage },{onConflict:'order_id,lang_code,chunk_index,pass,pipeline_version,schema_version,structure_fingerprint,model_id'})
  if (error) throw new Error(`Semantic cache persistence failed: ${error.message}`)
  return validated
}

/**
 * What the source book actually emphasises. The contract compares the delivered file
 * against this rather than a fixed number, so a book with no italics is not failed for
 * having none, and a book with 517 emphasised blocks cannot deliver zero.
 */
function sourceEmphasisCounts(source: Buffer, sourceFormat: 'epub'|'docx'|'txt'): { italic: number; bold: number; superscript: number } {
  if (sourceFormat !== 'epub') return { italic: 0, bold: 0, superscript: 0 }
  let italic = 0, bold = 0, superscript = 0
  try {
    for (const runs of Array.from(epubEmphasisByLocation(source).values())) {
      for (const run of runs) {
        if (run.italic) italic++
        if (run.bold) bold++
        if (run.superscript) superscript++
      }
    }
  } catch { return { italic: 0, bold: 0, superscript: 0 } }
  return { italic, bold, superscript }
}

/** Typewriter punctuation is corrected on the way out of every pass, so the stored
 *  documents, the review diff and every artifact agree. */
function normalizePassTypography(nodes: SemanticDocumentV2['nodes'], language: string): SemanticDocumentV2['nodes'] {
  return nodes.map(node => node.translatedText
    ? { ...node, translatedText: normalizeTypography(node.translatedText, language) }
    : node)
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
    const batchInput = createNodeTranslationInput(batch.nodes, pass === 2)
    const batchId = semanticBatchIdentity({
      orderId: input.orderId,
      language: input.language,
      documentFingerprint: documentInput.sourceFingerprint,
      pass,
      orderedNodeIds: batch.orderedNodeIds,
      briefRevision: input.brief.revision,
      briefFingerprint,
      modelId,
      promptVersion: pass === 1 ? TRANSLATION_PROMPT_VERSION : EDITORIAL_PROMPT_VERSION,
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

  const readerRegister = resolveReaderRegister({ brief: input.brief, genre: input.genre, language: input.language })
  const buildId = input.buildId || deterministicSemanticBuildId(input.orderId, input.language, sourceHash, input.brief.revision)
  const { error: buildError } = await input.supabase.rpc('begin_order_language_build', { p_order_id: input.orderId, p_language: input.language, p_build_id: buildId })
  if (buildError) throw new Error(`Build allocation failed: ${buildError.message}`)
  const pass1 = { ...sourceDocument, nodes: normalizePassTypography(await runBatchedPass(input, sourceDocument.nodes, 1), input.language) }
  assertSourceAwareDuplicateParity(sourceDocument.nodes, pass1.nodes)
  // Display headings can be split across adjacent EPUB blocks. Compare the same
  // consolidated headings that customer artifacts use, otherwise a repeated short
  // fragment (for example "Creating Your") is mistaken for a duplicate heading.
  assertSourceAwareHeadingDuplicateParity(consolidatedArtifactNodes(sourceDocument), consolidatedArtifactNodes(pass1))
  await persistSemantic(input.supabase, { orderId: input.orderId, language: input.language, buildId, pass: 'pass1', document: pass1, eligibility: eligibility.status })
  const rawPass2 = applyVerifiedEditorialOverrides({ ...pass1, nodes: normalizePassTypography(await runBatchedPass(input, pass1.nodes, 2), input.language) },input.verifiedEditorialOverrides||[])
  let titleAuthority = resolveTitleAuthority({ document: rawPass2, checkoutTitle: input.title, source: input.source })
  const verifiedTranslatedTitle=input.verifiedTranslatedTitle?.trim()
  if(titleAuthority.fallbackUsed&&verifiedTranslatedTitle)titleAuthority={
    ...titleAuthority,translatedValue:verifiedTranslatedTitle,effectiveValue:verifiedTranslatedTitle,
    confidence:'verified',fallbackUsed:false,warning:undefined,
  }
  if(titleAuthority.fallbackUsed||!titleAuthority.translatedValue){
    const errors=[titleAuthority.warning||{code:'TITLE_TRANSLATION_UNAVAILABLE',message:'A verified translated title is required'}]
    await validationReport(input.supabase,{orderId:input.orderId,language:input.language,buildId,stage:'title_authority',passed:false,errors,metrics:{titleAuthority}})
    throw new Error(`Title authority validation failed: ${errors[0].message}`)
  }
  const titleResult = applyTitleAuthority(rawPass2, input.title, titleAuthority)
  const pass2 = titleResult.document
  // An editorial pass that changes almost nothing has not reviewed the translation, it has
  // echoed it. Record that rather than presenting the build as edited.
  const editedNodes = pass1.nodes.filter((node, index) => node.translatedText !== rawPass2.nodes[index]?.translatedText).length
  const editedRatio = pass1.nodes.length ? editedNodes / pass1.nodes.length : 0
  const editorialPassed = editedRatio >= EDITORIAL_MIN_CHANGE_RATIO
  const editorialErrors = editorialPassed ? [] : [{ code: 'EDITORIAL_PASS_INEFFECTIVE', message: `Editorial pass changed ${editedNodes} of ${pass1.nodes.length} nodes (${(editedRatio*100).toFixed(1)}%), below the ${(EDITORIAL_MIN_CHANGE_RATIO*100).toFixed(1)}% threshold` }]
  await validationReport(input.supabase, {
    orderId: input.orderId, language: input.language, buildId, stage: 'editorial_pass',
    passed: editorialPassed,
    errors: editorialErrors,
    metrics: { editedNodes, totalNodes: pass1.nodes.length, editedRatio },
  })
  if (!editorialPassed) throw new Error(editorialErrors[0].message)
  await validationReport(input.supabase, { orderId: input.orderId, language: input.language, buildId, stage: 'title_authority', passed: true, metrics: { titleAuthority } })
  assertSourceAwareDuplicateParity(sourceDocument.nodes, pass2.nodes)
  assertSourceAwareHeadingDuplicateParity(consolidatedArtifactNodes(sourceDocument), consolidatedArtifactNodes(pass2))
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
  await storeValidated(input, buildId, 'pass1_docx', `${input.title} - ${input.language} - Pass 1.docx`, await buildSemanticDocx(pass1, titleAuthority.effectiveValue, 'pass1'), 'docx', true)
  await storeValidated(input, buildId, 'review_docx', `${input.title} - ${input.language} - Review.docx`, await buildSemanticReviewDocx(pass1, pass2, titleAuthority.effectiveValue), 'docx', true)
  const bookAuthor=resolveBookAuthor(pass2,input.authorName)
  if (input.sourceFormat === 'epub' || input.dualFormat) await storeValidated(input, buildId, 'final_epub', `${input.title} - ${input.language} - Final.epub`, input.sourceFormat === 'epub' ? buildSemanticEpub(await normalizeEpubImages(input.source), pass2, titleAuthority, input.language,bookAuthor,input.orderId) : buildSemanticEpubFromDocument(pass2, titleAuthority.effectiveValue,input.language,bookAuthor||'Unknown',input.orderId), 'epub', true,bookAuthor)
  // The delivery contract reads the bytes the customer will open, not the pipeline's own
  // record of what it built. Everything asserted here has shipped broken at least once.
  const finalDocx = await buildFinalSemanticDocx(input.source, pass2, titleAuthority.effectiveValue)
  const deliveredNodes = consolidatedArtifactNodes(pass2)
  const headingStyles: Record<string, number> = {}
  for (const node of deliveredNodes) {
    if (node.type !== 'heading') continue
    const level = Math.min(3, Math.max(1, node.headingLevel || 1))
    const style = `Heading${level}`
    headingStyles[style] = (headingStyles[style] || 0) + 1
  }
  const deliveryFailures = checkDeliveredDocx(inspectDeliveredDocx(finalDocx), {
    language: input.language,
    genre: input.genre,
    readerRegister,
    styles: headingStyles,
    minimumParagraphs: deliveredNodes.length,
    emphasis: sourceEmphasisCounts(input.source, input.sourceFormat),
  })
  const blockingDeliveryFailures=deliveryFailures.filter(failure=>failure.severity!=='warning')
  await validationReport(input.supabase, {
    orderId: input.orderId, language: input.language, buildId, stage: 'delivery_contract',
    passed: blockingDeliveryFailures.length === 0,
    errors: deliveryFailures.length ? deliveryFailures.map(failure => ({ code: failure.code, message: failure.detail })) : undefined,
    metrics: { readerRegister, headingStyles, nodes: deliveredNodes.length },
  })
  if (blockingDeliveryFailures.length) throw new Error(`Delivery contract failed for ${input.language}: ${describeFailures(blockingDeliveryFailures)}`)
  await storeValidated(input, buildId, 'final_docx', `${input.title} - ${input.language} - Final.docx`, finalDocx, 'docx', true)
  const map = buildChapterMap(pass2)
  const sourceHeadingCount=consolidatedArtifactNodes(sourceDocument).filter(node=>node.type==='heading').length
  const minimumMapRows=Math.max(1,Math.ceil(sourceHeadingCount*0.9))
  if(map.length<minimumMapRows)throw new Error(`Chapter map validation failed: ${map.length} rows; expected at least ${minimumMapRows} from ${sourceHeadingCount} source headings`)
  if (map.some(row => row.status !== 'mapped')) throw new Error('Chapter map is incomplete')
  await storeValidated(input, buildId, 'chapter_map_csv', 'chapter-map.csv', Buffer.from(renderChapterMapCsv(map)))
  await storeValidated(input, buildId, 'chapter_map_docx', 'chapter-map.docx', await renderChapterMapDocx(map, { bookTitle: input.title, language: input.language }), 'docx')
  const notes = deriveEditorialTranslationNotes({ language: input.language, pass1, pass2, existing: input.notes, authoritativeTitle: titleAuthority.translatedValue ? { source: titleAuthority.sourceValue, target: titleAuthority.translatedValue } : undefined })
  await storeValidated(input, buildId, 'translation_notes', 'translation-notes.txt', Buffer.from(renderTranslationNotes(notes)))
  const guidePath = path.join(process.cwd(), 'public', UPLOAD_GUIDE_ASSET_PATH.replace(/^\//, ''))
  const guide = await readFile(guidePath)
  if (createHash('sha256').update(guide).digest('hex') !== UPLOAD_GUIDE_SHA256) throw new Error('Pinned upload guide hash mismatch')
  await storeValidated(input, buildId, 'upload_guide', 'BookLingua Author Upload Guide.docx', guide)
  if (input.launchPack) {
    let pack: LaunchPackV1
    try { pack = JSON.parse(input.launchPack.toString('utf8')) } catch { throw new Error('Launch Pack is not valid JSON') }
    const launchErrors = validateLaunchPack({ pack, expectedLocale: input.language, purchased: true })
    launchErrors.push(...validateLaunchPackRegister(pack,input.brief.items.find(item=>item.issueType==='reader_register')?.authorDecision))
    if (launchErrors.length) throw new Error(`Launch Pack validation failed: ${launchErrors.join('; ')}`)
    await renderCustomerLaunchPackDocx(input.launchPack,input.title,titleAuthority.translatedValue)
    await storeValidated(input, buildId, 'launch_pack', 'launch-pack.json', input.launchPack)
  }
  return { buildId, eligibility, pass1, pass2, manifest: await resolvePackageGate(input.supabase, { orderId: input.orderId, language: input.language, buildId }) }
}
