import { SupabaseClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'
import { GERMAN_HIGHSCHOOL_GUIDANCE, normalizeGermanTerminology } from './german-terminology'

export const TRANSLATION_BRIEF_SCHEMA_VERSION = '1.0'

export interface TranslationBriefItem {
  id: string
  sourceTerm: string
  sourceContext?: string
  issueType?: string
  authorDecision: string
  targetInstruction: string
  /** Optional exact target wording used by the book-wide explanatory-note gate. */
  targetTerm?: string
  explanatoryNote?: string
}

export interface TranslationBriefV1 {
  schemaVersion: typeof TRANSLATION_BRIEF_SCHEMA_VERSION
  language: string
  sourceManifestFingerprint: string
  approvedAt: string
  revision: number
  approvalSource: 'author_scan' | 'legacy_import' | 'admin'
  items: TranslationBriefItem[]
  authorGlossary?: string
}

type CanonicalExplanatoryWording = { targetTerm: string; explanatoryNote: string }

/**
 * Scanner choices predate the deterministic explanatory-note contract and do
 * not contain target-language wording. Materialise it here, per language,
 * before the semantic pipeline sees the brief. The resulting brief is stored
 * and fingerprinted, so rebuilds never depend on a fresh model response.
 */
function generatedExplanatoryWording(language: string, sourceTerm: string): CanonicalExplanatoryWording {
  const normalizedSource = sourceTerm.trim()
  if (/^high school$/i.test(normalizedSource)) {
    if (language === 'de') {
      const targetTerm = normalizeGermanTerminology('Highschool')
      return { targetTerm, explanatoryNote: 'Highschool: die amerikanische Oberstufe' }
    }
    if (language === 'es-es') return { targetTerm: 'instituto', explanatoryNote: 'Instituto: escuela secundaria estadounidense' }
    if (language === 'es-la') return { targetTerm: 'preparatoria', explanatoryNote: 'Preparatoria: escuela secundaria estadounidense' }
  }
  if (language === 'de') return { targetTerm: normalizeGermanTerminology(normalizedSource), explanatoryNote: `${normalizedSource}: kultureller Begriff aus den USA` }
  if (language.startsWith('es')) return { targetTerm: normalizedSource, explanatoryNote: `${normalizedSource}: término cultural estadounidense` }
  return { targetTerm: normalizedSource, explanatoryNote: `${normalizedSource}: cultural term from the source context` }
}

function isExplanatoryDecision(item: Pick<TranslationBriefItem, 'authorDecision'>): boolean {
  return item.authorDecision === 'footnote' || item.authorDecision === 'convert_with_note'
}

export function materializeExplanatoryWording(brief: TranslationBriefV1): TranslationBriefV1 {
  let changed = false
  const items = brief.items.map(item => {
    if (!isExplanatoryDecision(item) || (item.targetTerm?.trim() && item.explanatoryNote?.trim())) return item
    const generated = generatedExplanatoryWording(brief.language, item.sourceTerm)
    changed = true
    return {
      ...item,
      targetTerm: generated.targetTerm,
      explanatoryNote: generated.explanatoryNote,
      targetInstruction: `Use exactly "${generated.targetTerm}" and add "${generated.explanatoryNote}" once at the first source occurrence only.`,
    }
  })
  return changed ? { ...brief, items } : brief
}

export function verifiedExplanatoryNotesFromBrief(brief: TranslationBriefV1): Array<{
  sourceTerm: string
  targetTerm: string
  canonicalNote: string
}> {
  return brief.items
    .filter(item => item.authorDecision === 'footnote' || item.authorDecision === 'convert_with_note')
    .map(item => {
      if (!item.targetTerm?.trim() || !item.explanatoryNote?.trim()) {
        throw new Error(`Author-selected explanatory term lacks canonical target wording: ${item.sourceTerm}`)
      }
      return {
        sourceTerm: item.sourceTerm,
        targetTerm: item.targetTerm.trim(),
        canonicalNote: item.explanatoryNote.trim(),
      }
    })
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).filter(([,item]) => item !== undefined).sort(([a],[b]) => a.localeCompare(b)).map(([key,item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`
  return JSON.stringify(value)
}

export function translationBriefFingerprint(brief: TranslationBriefV1): string {
  const { revision: _revision, ...immutableContent } = brief
  return createHash('sha256').update(canonicalJson(immutableContent)).digest('hex')
}

function instructionFor(decision: Record<string, unknown>): string {
  const choice = String(decision.decision || 'translate')
  const replacement = decision.replacement || decision.target || decision.value
  if (choice === 'keep') return 'Keep exactly as written; do not translate.'
  if (choice === 'replace' || choice === 'adapt' || choice === 'convert') {
    return replacement ? `Use exactly: ${String(replacement)}` : 'Adapt consistently for the target locale.'
  }
  if (choice === 'footnote' || choice === 'convert_with_note') return 'Keep one short parenthetical explanation on the first source occurrence only; never repeat it or attach it to a sentence where the source term is absent.'
  if (choice === 'false_positive') return 'Ignore this scanner finding; apply normal literary translation.'
  return 'Translate naturally and use the same equivalent consistently.'
}

export function buildTranslationBrief(input: {
  language: string
  sourceManifestFingerprint: string
  approvedAt: string
  revision?: number
  approvalSource?: TranslationBriefV1['approvalSource']
  decisions: Array<Record<string, unknown>>
  authorGlossary?: string | null
}): TranslationBriefV1 {
  const brief: TranslationBriefV1 = {
    schemaVersion: TRANSLATION_BRIEF_SCHEMA_VERSION,
    language: input.language,
    sourceManifestFingerprint: input.sourceManifestFingerprint,
    approvedAt: input.approvedAt,
    revision: input.revision || 1,
    approvalSource: input.approvalSource || 'author_scan',
    items: input.decisions.map((decision, index) => ({
      id: `brief-${index + 1}`,
      sourceTerm: String(decision.term || decision.sourceTerm || ''),
      sourceContext: decision.context ? String(decision.context) : undefined,
      issueType: decision.type || decision.category ? String(decision.type || decision.category) : undefined,
      authorDecision: String(decision.decision || 'translate'),
      targetInstruction: instructionFor(decision),
      targetTerm: decision.targetTerm ? String(decision.targetTerm) : undefined,
      explanatoryNote: decision.explanatoryNote || decision.explanation ? String(decision.explanatoryNote || decision.explanation) : undefined,
    })).filter(item => item.sourceTerm.length > 0),
    ...(input.authorGlossary?.trim() ? { authorGlossary: input.authorGlossary.trim() } : {}),
  }
  return materializeExplanatoryWording(brief)
}

export function renderTranslationBriefPrompt(brief: TranslationBriefV1): string {
  const instructions = brief.items.length
    ? brief.items.map(item => `- "${item.sourceTerm}": ${item.targetInstruction}`).join('\n')
    : '- No special author terminology decisions were required.'
  const explanatoryPolicy = brief.items.some(item => item.authorDecision === 'footnote' || item.authorDecision === 'convert_with_note')
    ? '\nBook-wide explanatory-note state: explain each author-selected term exactly once, at its first source occurrence only, in one short parenthesis. Never explain an unselected term, repeat an explanation, or add the note to a sentence whose source lacks the exact term. The deterministic final gate checks the whole book.'
    : ''
  const languageGuidance = brief.language === 'de'
    ? `\nGerman grammar: article-taking country names retain their article and inflection in context: die Slowakei, die Schweiz, die Türkei, der Iran (for example in der Slowakei, aus der Schweiz, in die Türkei, im Iran).\nStable German terminology: ${GERMAN_HIGHSCHOOL_GUIDANCE}`
    : ''
  return `TRANSLATION BRIEF v${brief.schemaVersion} (${brief.language})
Brief fingerprint: ${brief.sourceManifestFingerprint}
Follow these author-approved decisions in this pass without exception:
${instructions}${brief.authorGlossary ? `\nAUTHOR-SUPPLIED GLOSSARY — apply these terms consistently. Where it gives a target-language equivalent, use it exactly; where it gives a note, follow the note:\n${brief.authorGlossary}\n` : ''}${explanatoryPolicy}${languageGuidance}`
}

export async function loadTranslationBrief(
  supabase: SupabaseClient,
  orderId: string,
  language: string,
): Promise<TranslationBriefV1 | null> {
  const { data, error } = await supabase.from('translation_briefs')
    .select('brief, source_manifest_fingerprint, content_fingerprint, approved_at, revision')
    .eq('order_id', orderId)
    .eq('language', language)
    .eq('schema_version', TRANSLATION_BRIEF_SCHEMA_VERSION)
    .order('revision', { ascending: false }).limit(1)
    .maybeSingle()
  if (error) {
    if (/translation_briefs|relation .* does not exist|schema cache/i.test(error.message)) return null
    throw new Error(`Unable to load translation brief: ${error.message}`)
  }
  if (!data?.brief) return null
  const brief = data.brief as TranslationBriefV1
  if (brief.sourceManifestFingerprint !== data.source_manifest_fingerprint) throw new Error('Translation brief source fingerprint mismatch')
  if (new Date(brief.approvedAt).getTime() !== new Date(data.approved_at).getTime()) throw new Error('Translation brief approval mismatch')
  if (brief.revision !== data.revision) throw new Error('Translation brief revision mismatch')
  if (translationBriefFingerprint(brief) !== data.content_fingerprint) throw new Error('Translation brief content fingerprint mismatch')
  return brief
}

/** Persist a one-time deterministic upgrade for briefs written before canonical explanatory wording existed. */
export async function ensureMaterializedExplanatoryWording(input: {
  supabase: SupabaseClient
  orderId: string
  brief: TranslationBriefV1
}): Promise<TranslationBriefV1> {
  const materialized = materializeExplanatoryWording(input.brief)
  if (materialized === input.brief) return input.brief
  const upgraded = { ...materialized, revision: input.brief.revision + 1 }
  const { error } = await input.supabase.from('translation_briefs').insert({
    order_id: input.orderId,
    language: upgraded.language,
    schema_version: upgraded.schemaVersion,
    revision: upgraded.revision,
    source_manifest_fingerprint: upgraded.sourceManifestFingerprint,
    content_fingerprint: translationBriefFingerprint(upgraded),
    approved_at: upgraded.approvedAt,
    approval_source: upgraded.approvalSource,
    brief: upgraded,
  })
  if (error) throw new Error(`Failed to persist canonical explanatory wording: ${error.message}`)
  return upgraded
}

export function assertTranslationBriefForSource(brief: TranslationBriefV1, language: string, sourceHash: string): void {
  if (brief.language !== language) throw new Error('Translation brief language mismatch')
  if (!brief.approvedAt || Number.isNaN(Date.parse(brief.approvedAt))) throw new Error('Translation brief is not approved')
  if (brief.sourceManifestFingerprint !== sourceHash) throw new Error('Translation brief is bound to a different source')
}

export async function storeTranslationBriefs(input: {
  supabase: SupabaseClient
  orderId: string
  languages: string[]
  sourceManifestFingerprint: string
  approvedAt: string
  approvalSource?: TranslationBriefV1['approvalSource']
  decisions: Array<Record<string, unknown>>
  authorGlossary?: string | null
}): Promise<void> {
  if (!input.approvedAt) throw new Error('Author approval timestamp is required')
  for (const language of input.languages) {
    const { data: latest, error: latestError } = await input.supabase.from('translation_briefs')
      .select('revision, content_fingerprint').eq('order_id', input.orderId).eq('language', language)
      .eq('schema_version', TRANSLATION_BRIEF_SCHEMA_VERSION).order('revision', { ascending: false }).limit(1).maybeSingle()
    if (latestError) throw new Error(`Failed to inspect translation brief history: ${latestError.message}`)
    const brief = buildTranslationBrief({ ...input, language, revision: (latest?.revision || 0) + 1 })
    const contentFingerprint = translationBriefFingerprint(brief)
    if (latest?.content_fingerprint === contentFingerprint) continue
    const { error } = await input.supabase.from('translation_briefs').insert({
      order_id: input.orderId,
      language,
      schema_version: brief.schemaVersion,
      revision: brief.revision,
      source_manifest_fingerprint: brief.sourceManifestFingerprint,
      content_fingerprint: contentFingerprint,
      approved_at: brief.approvedAt,
      approval_source: brief.approvalSource,
      brief,
    })
    if (error) throw new Error(`Failed to persist translation brief: ${error.message}`)
  }
}

export function prepareTranslationBriefRows(input: {
  languages: string[]
  sourceManifestFingerprint: string
  approvedAt: string
  decisions: Array<Record<string, unknown>>
  authorGlossary?: string | null
  approvalSource?: TranslationBriefV1['approvalSource']
}): Array<Record<string, unknown>> {
  if (!input.approvedAt) throw new Error('Author approval timestamp is required')
  return input.languages.map(language => {
    const brief = buildTranslationBrief({ ...input, language, revision: 1 })
    return {
      language,
      schema_version: brief.schemaVersion,
      revision: brief.revision,
      source_manifest_fingerprint: brief.sourceManifestFingerprint,
      content_fingerprint: translationBriefFingerprint(brief),
      approved_at: brief.approvedAt,
      approval_source: brief.approvalSource,
      brief,
    }
  })
}
