import { SupabaseClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'

export const TRANSLATION_BRIEF_SCHEMA_VERSION = '1.0'

export interface TranslationBriefItem {
  id: string
  sourceTerm: string
  sourceContext?: string
  issueType?: string
  authorDecision: string
  targetInstruction: string
}

export interface TranslationBriefV1 {
  schemaVersion: typeof TRANSLATION_BRIEF_SCHEMA_VERSION
  language: string
  sourceManifestFingerprint: string
  approvedAt: string
  revision: number
  approvalSource: 'author_scan' | 'legacy_import' | 'admin'
  items: TranslationBriefItem[]
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
  if (choice === 'footnote' || choice === 'convert_with_note') return 'Translate or convert consistently and include the requested explanatory note.'
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
}): TranslationBriefV1 {
  return {
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
    })).filter(item => item.sourceTerm.length > 0),
  }
}

export function renderTranslationBriefPrompt(brief: TranslationBriefV1): string {
  const instructions = brief.items.length
    ? brief.items.map(item => `- "${item.sourceTerm}": ${item.targetInstruction}`).join('\n')
    : '- No special author terminology decisions were required.'
  return `TRANSLATION BRIEF v${brief.schemaVersion} (${brief.language})
Brief fingerprint: ${brief.sourceManifestFingerprint}
Follow these author-approved decisions in this pass without exception:
${instructions}`
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
