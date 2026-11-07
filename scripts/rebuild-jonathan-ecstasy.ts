import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { downloadOriginalBinary } from '../lib/source-binary'
import { parseSemanticEpub } from '../lib/semantic-parser'
import { deterministicSemanticBuildId, runSemanticPipeline, SEMANTIC_PROMPT_SIGNATURE } from '../lib/semantic-pipeline'
import { TranslationBriefV1 } from '../lib/translation-brief'
import { TranslationNotesV1 } from '../lib/translation-notes'
import { renderCustomerTranslationNotesDocx } from '../lib/customer-delivery-docx'

const ORDER_ID = '4639f634-8c58-495b-b418-8371b018df77'
const LANGUAGE = 'de'
const REPAIRED_EPUB = process.env.JONATHAN_REPAIRED_EPUB || path.resolve(process.cwd(), '../media/inbound/openclaw-staged-176290e1-6c93-4dd1-b996-3f0b9f2f5865/ecstasy_as_medicine_-_Final_-_DE---64f058db-4c65-4708-a81e-489bc51880db.epub')

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

async function artifactBytes(artifact: any): Promise<Buffer> {
  const result = await db.storage.from(artifact.storage_bucket).download(artifact.storage_path)
  if (result.error || !result.data) throw new Error(result.error?.message || `Missing ${artifact.artifact_type}`)
  return Buffer.from(await result.data.arrayBuffer())
}

async function main() {
  const orderResult = await db.from('orders').select('*').eq('id', ORDER_ID).single()
  if (orderResult.error || !orderResult.data) throw new Error('Jonathan order is unavailable')
  const order = orderResult.data
  if (order.author_name !== 'Jonathan Robinson' || order.book_title.toLowerCase() !== 'ecstasy as medicine' || order.status !== 'ready_for_review') throw new Error('Order preflight changed')

  const sourceRow = await db.from('files').select('file_url,original_content').eq('order_id', ORDER_ID).eq('type', 'original').single()
  if (sourceRow.error || !sourceRow.data) throw new Error('Original EPUB is unavailable')
  const metadata = typeof sourceRow.data.original_content === 'string' ? JSON.parse(sourceRow.data.original_content) : sourceRow.data.original_content || {}
  const source = await downloadOriginalBinary(db, sourceRow.data.file_url, metadata.sha256 || null, metadata.storageBucket)
  const sourceHash = createHash('sha256').update(source).digest('hex')
  if (metadata.sha256 && sourceHash !== metadata.sha256) throw new Error('Original EPUB hash changed')

  const repaired = await readFile(REPAIRED_EPUB)
  const sourceDocument = parseSemanticEpub(source, sourceHash)
  const repairedDocument = parseSemanticEpub(repaired, sourceHash)
  if (sourceDocument.nodes.length !== repairedDocument.nodes.length) throw new Error('Repaired EPUB node count differs from source')
  for (let index = 0; index < sourceDocument.nodes.length; index++) {
    if (sourceDocument.nodes[index].sourceLocation !== repairedDocument.nodes[index].sourceLocation) throw new Error(`Repaired EPUB structure differs at node ${index + 1}`)
  }

  const currentBuild = await db.from('package_manifests').select('build_id').eq('order_id', ORDER_ID).eq('language', LANGUAGE).eq('status', 'pass').order('created_at', { ascending: false }).limit(1).single()
  if (currentBuild.error || !currentBuild.data) throw new Error('Latest passed build is unavailable')
  const passRows = await db.from('semantic_documents').select('pass,document').eq('order_id', ORDER_ID).eq('language', LANGUAGE).eq('build_id', currentBuild.data.build_id).in('pass', ['pass1', 'pass2'])
  if (passRows.error) throw new Error(passRows.error.message)
  const prior = Object.fromEntries((passRows.data || []).map(row => [row.pass, row.document])) as Record<string, any>
  if (!prior.pass1 || !prior.pass2 || prior.pass1.nodes.length !== sourceDocument.nodes.length) throw new Error('Current semantic passes are incomplete')

  const briefRow = await db.from('translation_briefs').select('brief,revision').eq('order_id', ORDER_ID).eq('language', LANGUAGE).order('revision', { ascending: false }).limit(1).single()
  if (briefRow.error || !briefRow.data?.brief) throw new Error('Translation brief is unavailable')
  const brief = briefRow.data.brief as TranslationBriefV1
  const translatedById = new Map(repairedDocument.nodes.map(node => [node.id, node.sourceText]))
  const pass1ById = new Map(prior.pass1.nodes.map((node: any) => [node.id, node.translatedText]))

  const buildId = deterministicSemanticBuildId(ORDER_ID, LANGUAGE, sourceHash, brief.revision, `${SEMANTIC_PROMPT_SIGNATURE}+jonathan-reviewed-epub-v16`)
  const notes: TranslationNotesV1 = {
    schemaVersion: '1.0', language: LANGUAGE,
    approach: 'These notes link representative English wording directly to the reviewed German wording in the delivered Final.',
    sections: [{ id: 'translation-decisions', title: 'Translation Decisions', entries: [
      { source: 'unknown chemical makeup and purity', target: 'unbekannte chemische Zusammensetzung und Reinheit', reason: 'The reviewed German uses the standard scientific nouns “Zusammensetzung” and “Reinheit” to retain the disclaimer’s precise warning about illicit-substance uncertainty.' },
      { source: 'what six years of intense talk therapy could not solve', target: 'was sechs Jahre intensive Gesprächstherapie nicht lösen konnte', reason: 'The singular German verb agrees with the quoted experience as a single unresolved result while preserving the testimonial’s contrast with one MDMA session.' },
      { source: 'MDMA-assisted therapy', target: 'MDMA-gestützte Therapie', reason: 'The compound “MDMA-gestützt” is used consistently as the natural German clinical term rather than the more literal first-pass wording “MDMA-unterstützt”.' },
      { source: 'FDA', target: 'FDA (US-amerikanische Lebensmittel- und Arzneimittelbehörde)', reason: 'The author-approved first-occurrence explanation retains the familiar US abbreviation and gives German readers the agency’s full function once.' },
      { source: 'top 8 recommendations', target: 'Top-8-Empfehlungen', reason: 'German compound spelling joins the ranked list label with hyphens, making the practical Chapter 2 guidance read naturally and cleanly.' },
    ] }],
  }
  const result = await runSemanticPipeline({
    supabase: db,
    orderId: ORDER_ID,
    language: LANGUAGE,
    sourceFormat: 'epub',
    source,
    title: order.book_title,
    verifiedTranslatedTitle: 'Ecstasy als Medizin',
    authorName: order.author_name,
    genre: order.genre,
    brief,
    notes,
    customerNotesAreAuthoritative: true,
    buildId,
    verifiedExplanatoryNotes: [{ sourceTerm: 'FDA', targetTerm: 'FDA', canonicalNote: 'US-amerikanische Lebensmittel- und Arzneimittelbehörde' }],
    repairUnexpectedExplanatoryBrackets: true,
    bookWideReplacements: [
      { before: 'Food and Drug Administration (FDA, die US-Arzneimittelbehörde)', after: 'Food and Drug Administration (FDA)', expectedCount: 1 },
      { before: 'das Ihnen Spaß gemacht oder Sie sich gut fühlen lassen hat?', after: 'das Ihnen Spaß gemacht oder Ihnen ein gutes Gefühl gegeben hat?', expectedCount: 1 },
      { before: 'Klientinnen und Klienten', after: 'Klienten', expectedCount: 8 },
    ],
    allowReviewedStructure: true,
    translationModel: 'reviewed-epub-jonathan-v1',
    editorialModel: 'reviewed-epub-jonathan-v1',
    translate: async (batch, context) => ({
      schemaVersion: batch.schemaVersion,
      sourceFingerprint: batch.sourceFingerprint,
      nodes: batch.nodes.map(node => {
        const text = context.pass === 1 ? pass1ById.get(node.id) : translatedById.get(node.id)
        if (!text) throw new Error(`Reviewed text missing for pass ${context.pass}, ${node.id}`)
        return { id: node.id, text: String(text) }
      }),
    }),
  })
  if (result.manifest.status !== 'pass') throw new Error('Rebuilt package did not pass')

  const artifacts = await db.from('artifacts').select('*').eq('order_id', ORDER_ID).eq('language', LANGUAGE).eq('build_id', buildId)
  if (artifacts.error) throw new Error(artifacts.error.message)
  const byType = new Map((artifacts.data || []).map(item => [item.artifact_type, item]))
  const required = ['final_epub','final_docx','review_docx','chapter_map_docx','translation_notes']
  for (const type of required) if (!byType.has(type)) throw new Error(`Rebuilt package is missing ${type}`)
  const outputDir = path.join(process.cwd(), 'working', 'jonathan-ecstasy-rebuild-2026-11-06')
  await mkdir(outputDir, { recursive: true })
  for (const type of ['final_epub','final_docx','review_docx','chapter_map_docx']) {
    const artifact: any = byType.get(type)
    await writeFile(path.join(outputDir, artifact.filename), await artifactBytes(artifact))
  }
  const notesArtifact: any = byType.get('translation_notes')
  const notesText = await artifactBytes(notesArtifact)
  const notesDocx = await renderCustomerTranslationNotesDocx(notesText, 'Ecstasy als Medizin', 'German')
  await writeFile(path.join(outputDir, 'Ecstasy als Medizin - Notes - DE.docx'), notesDocx)
  const report = { orderId: ORDER_ID, previousBuildId: currentBuild.data.build_id, buildId, manifestStatus: result.manifest.status, artifactCount: artifacts.data?.length, artifacts: (artifacts.data || []).map(item => ({ type: item.artifact_type, filename: item.filename, sha256: item.sha256, validation: item.validation_status })), productionOrderStatus: order.status, customerEmailSent: false }
  await writeFile(path.join(outputDir, 'audit.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
}

main().catch(error => { console.error(error); process.exitCode = 1 })
