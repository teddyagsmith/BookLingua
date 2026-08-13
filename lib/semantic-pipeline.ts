import { createHash } from 'crypto'
import { readFile } from 'fs/promises'
import path from 'path'
import { SupabaseClient } from '@supabase/supabase-js'
import { parseSemanticDocx, parseSemanticEpub, parseSemanticTxt } from './semantic-parser'
import { evaluateSemanticEligibility, SemanticDocumentV2 } from './semantic-document'
import { createNodeTranslationInput, nodeBatchFingerprint, NodeTranslationInput, NodeTranslationOutput, validateAndMergeNodeOutput } from './node-translation-contract'
import { buildSemanticDocx, buildSemanticEpub, buildSemanticReviewDocx } from './semantic-artifacts'
import { buildChapterMap, renderChapterMapCsv, renderChapterMapDocx } from './chapter-map'
import { validateArtifact } from './artifact-validation-v2'
import { storeImmutableArtifact } from './artifact-store'
import { resolvePackageGate } from './package-gate'
import { renderTranslationNotes, TranslationNotesV1, validateTranslationNotes } from './translation-notes'
import { TranslationBriefV1, assertTranslationBriefForSource, translationBriefFingerprint } from './translation-brief'
import { ArtifactType } from './package-manifest'
import { UPLOAD_GUIDE_ASSET_PATH, UPLOAD_GUIDE_SHA256 } from './upload-guide'
import { LaunchPackV1, validateLaunchPack } from './launch-pack-schema'

export type SemanticTranslator = (input: NodeTranslationInput, context: { pass: 1 | 2; language: string; brief: TranslationBriefV1 }) => Promise<NodeTranslationOutput>

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
  launchMarket?: string
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
  const { data, error } = await supabase.from('validation_reports').insert({ order_id: input.orderId, language: input.language, build_id: input.buildId, stage: input.stage, validator_version: 'semantic-v2.0', passed: input.passed, errors: input.errors || [], metrics: input.metrics || {} }).select('id').single()
  if (error?.code === '23505') {
    const { data: existing, error: existingError } = await supabase.from('validation_reports').select('id,passed,errors,metrics').eq('order_id',input.orderId).eq('language',input.language).eq('build_id',input.buildId).eq('stage',input.stage).eq('validator_version','semantic-v2.0').single()
    if (existingError || !existing || existing.passed !== input.passed || JSON.stringify(existing.errors)!==JSON.stringify(input.errors||[])) throw new Error('Validation retry differs from immutable report')
    return existing.id
  }
  if (error) throw new Error(`Validation report persistence failed: ${error.message}`)
  return data.id
}

async function storeValidated(input: SemanticPipelineInput, buildId: string, type: ArtifactType, filename: string, buffer: Buffer, kind?: 'docx'|'epub') {
  const result = kind ? validateArtifact(buffer, kind) : { passed: buffer.length > 0, errors: buffer.length ? [] : [{ code: 'EMPTY', message: 'Artifact empty' }], metrics: {} }
  const reportId = await validationReport(input.supabase, { orderId: input.orderId, language: input.language, buildId, stage: `artifact:${type}`, passed: result.passed, errors: result.errors, metrics: result.metrics })
  if (!result.passed) throw new Error(`${type} validation failed: ${result.errors.map((error: any) => error.message).join('; ')}`)
  return storeImmutableArtifact({ supabase: input.supabase, orderId: input.orderId, language: input.language, buildId, type, filename, buffer, schemaVersion: 'semantic-v2', validationStatus: 'pass', validationReportId: reportId })
}

async function cachedTranslation(input: SemanticPipelineInput, batch: NodeTranslationInput, pass: 1|2): Promise<NodeTranslationOutput> {
  const cache = input.supabase.from('translation_chunks').select('content').eq('order_id',input.orderId).eq('lang_code',input.language)
    .eq('chunk_index',0).eq('pass',`semantic-pass${pass}`).eq('pipeline_version','semantic-v2').eq('schema_version',batch.schemaVersion).eq('structure_fingerprint',batch.sourceFingerprint)
  const { data: existing, error: readError } = await cache.maybeSingle()
  if (readError) throw new Error(`Semantic cache read failed: ${readError.message}`)
  if (existing?.content) return JSON.parse(existing.content)
  const output = await input.translate(batch,{pass,language:input.language,brief:input.brief})
  const { error } = await input.supabase.from('translation_chunks').upsert({ order_id:input.orderId,lang_code:input.language,chunk_index:0,pass:`semantic-pass${pass}`,content:JSON.stringify(output),pipeline_version:'semantic-v2',schema_version:batch.schemaVersion,structure_fingerprint:batch.sourceFingerprint },{onConflict:'order_id,lang_code,chunk_index,pass,pipeline_version,schema_version,structure_fingerprint'})
  if (error) throw new Error(`Semantic cache persistence failed: ${error.message}`)
  return output
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
  const pass1Input = createNodeTranslationInput(sourceDocument.nodes)
  const pass1 = { ...sourceDocument, nodes: validateAndMergeNodeOutput(sourceDocument.nodes, await cachedTranslation(input,pass1Input,1), pass1Input.sourceFingerprint) }
  await persistSemantic(input.supabase, { orderId: input.orderId, language: input.language, buildId, pass: 'pass1', document: pass1, eligibility: eligibility.status })
  const pass2Input = createNodeTranslationInput(pass1.nodes)
  const pass2 = { ...pass1, nodes: validateAndMergeNodeOutput(pass1.nodes, await cachedTranslation(input,pass2Input,2), pass2Input.sourceFingerprint) }
  await persistSemantic(input.supabase, { orderId: input.orderId, language: input.language, buildId, pass: 'pass2', document: pass2, eligibility: eligibility.status })

  await storeValidated(input, buildId, 'translation_brief', 'translation-brief.json', Buffer.from(JSON.stringify(input.brief, null, 2)))
  await storeValidated(input, buildId, 'pass1_docx', `${input.title} - ${input.language} - Pass 1.docx`, await buildSemanticDocx(pass1, input.title, 'pass1'), 'docx')
  await storeValidated(input, buildId, 'review_docx', `${input.title} - ${input.language} - Review.docx`, await buildSemanticReviewDocx(pass1, pass2, input.title), 'docx')
  if (input.sourceFormat === 'epub') await storeValidated(input, buildId, 'final_epub', `${input.title} - ${input.language} - Final.epub`, buildSemanticEpub(input.source, pass2), 'epub')
  else await storeValidated(input, buildId, 'final_docx', `${input.title} - ${input.language} - Final.docx`, await buildSemanticDocx(pass2, input.title, 'final'), 'docx')
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
    const launchErrors = validateLaunchPack({ pack, expectedLanguage: input.language, expectedMarket: input.launchMarket || pack.market, purchased: true })
    if (launchErrors.length) throw new Error(`Launch Pack validation failed: ${launchErrors.join('; ')}`)
    await storeValidated(input, buildId, 'launch_pack', 'launch-pack.json', input.launchPack)
  }
  return { buildId, eligibility, pass1, pass2, manifest: await resolvePackageGate(input.supabase, { orderId: input.orderId, language: input.language, buildId }) }
}
