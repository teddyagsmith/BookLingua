import { SupabaseClient } from '@supabase/supabase-js'

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
  items: TranslationBriefItem[]
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
  decisions: Array<Record<string, unknown>>
}): TranslationBriefV1 {
  return {
    schemaVersion: TRANSLATION_BRIEF_SCHEMA_VERSION,
    language: input.language,
    sourceManifestFingerprint: input.sourceManifestFingerprint,
    approvedAt: input.approvedAt,
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
    .select('brief')
    .eq('order_id', orderId)
    .eq('language', language)
    .eq('schema_version', TRANSLATION_BRIEF_SCHEMA_VERSION)
    .maybeSingle()
  if (error) throw new Error(`Unable to load translation brief: ${error.message}`)
  return data?.brief as TranslationBriefV1 || null
}

export async function storeTranslationBriefs(input: {
  supabase: SupabaseClient
  orderId: string
  languages: string[]
  sourceManifestFingerprint: string
  approvedAt: string
  decisions: Array<Record<string, unknown>>
}): Promise<void> {
  const rows = input.languages.map(language => {
    const brief = buildTranslationBrief({ ...input, language })
    return {
      order_id: input.orderId,
      language,
      schema_version: brief.schemaVersion,
      source_manifest_fingerprint: brief.sourceManifestFingerprint,
      approved_at: brief.approvedAt,
      brief,
    }
  })
  const { error } = await input.supabase.from('translation_briefs').upsert(rows, {
    onConflict: 'order_id,language,schema_version',
  })
  if (error) throw new Error(`Failed to persist translation briefs: ${error.message}`)
}
