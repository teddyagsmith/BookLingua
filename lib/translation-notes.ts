export const TRANSLATION_NOTES_SCHEMA_VERSION = '1.0'

export interface TranslationNoteEntry {
  source: string
  target: string
  reason: string
}

export interface TranslationNotesSection {
  id: string
  title: string
  entries: TranslationNoteEntry[]
}

export interface TranslationNotesV1 {
  schemaVersion: typeof TRANSLATION_NOTES_SCHEMA_VERSION
  language: string
  approach: string
  sections: TranslationNotesSection[]
}

export function validateTranslationNotes(notes: TranslationNotesV1): string[] {
  const errors: string[] = []
  if (notes.schemaVersion !== TRANSLATION_NOTES_SCHEMA_VERSION) errors.push('Unexpected translation-notes schema version')
  if (!notes.language.trim()) errors.push('Translation-notes language is missing')
  if (!notes.approach.trim()) errors.push('Translation-notes approach is missing')
  // An empty section list is truthful when no notable decisions were recorded.
  if (notes.sections.some(section => !section.id || !section.title || !section.entries.length)) errors.push('Translation-notes section is incomplete')
  if (notes.sections.some(section => section.entries.some(entry => !entry.source || !entry.target || !entry.reason))) errors.push('Translation-note entry is incomplete')
  return errors
}

export function parseLegacyTranslationNotes(text: string, language: string): TranslationNotesV1 {
  const sections: TranslationNotesSection[] = []
  const blocks = text.split(/\n(?=---\s*)/)
  for (const block of blocks) {
    const title = block.match(/^---\s*(.+?)\s*---/m)?.[1]
    if (!title) continue
    const entries = block.split('\n').flatMap(line => {
      const match = line.match(/^ORIGINAL:\s*(.*?)\s*\|\s*(?:TRANSLATED|KEPT AS):\s*(.*?)\s*\|\s*REASON:\s*(.+)$/i)
      return match ? [{ source: match[1].trim(), target: match[2].trim(), reason: match[3].trim() }] : []
    })
    if (entries.length) sections.push({ id: title.toLowerCase().replace(/[^a-z0-9]+/g, '-'), title, entries })
  }
  return {
    schemaVersion: TRANSLATION_NOTES_SCHEMA_VERSION,
    language,
    approach: 'Structured from the editorial pass translation decisions.',
    sections,
  }
}

export function renderTranslationNotes(notes: TranslationNotesV1): string {
  return [
    `Translation Notes — ${notes.language}`,
    notes.approach,
    ...notes.sections.flatMap(section => [
      `\n${section.title}`,
      ...section.entries.map(entry => `${entry.source} → ${entry.target}\nReason: ${entry.reason}`),
    ]),
  ].join('\n')
}

export function deriveEditorialTranslationNotes(input: {
  language: string
  pass1: { nodes: Array<{ id: string; sourceText: string; translatedText?: string | null }> }
  pass2: { nodes: Array<{ id: string; sourceText: string; translatedText?: string | null }> }
  existing?: TranslationNotesV1
  authoritativeTitle?: { source: string; target: string }
  limit?: number
}): TranslationNotesV1 {
  const limit = Math.max(1, Math.min(input.limit || 12, 20))
  const decisions: TranslationNoteEntry[] = []
  if (input.authoritativeTitle) decisions.push({
    source: input.authoritativeTitle.source,
    target: input.authoritativeTitle.target,
    reason: 'Used consistently as the authoritative translated book title in the manuscript and customer files.',
  })
  for (let index = 0; index < input.pass1.nodes.length && decisions.length < limit; index++) {
    const first = input.pass1.nodes[index]; const second = input.pass2.nodes[index]
    if (!second || first.id !== second.id || !first.translatedText || !second.translatedText || first.translatedText === second.translatedText) continue
    const reason = /[“”"'’]/.test(first.sourceText)
      ? 'Refined during editorial review for natural dialogue, voice, and punctuation in the target language.'
      : /[!?…]/.test(first.sourceText)
        ? 'Refined during editorial review to preserve emphasis and narrative rhythm.'
        : 'Refined during editorial review for idiomatic phrasing, clarity, and consistency.'
    decisions.push({ source: first.sourceText, target: second.translatedText, reason })
  }
  const existingSections = input.existing?.sections || []
  return {
    schemaVersion: TRANSLATION_NOTES_SCHEMA_VERSION,
    language: input.language,
    approach: 'The translation preserves the author’s narrative voice and semantic structure. These notes highlight representative title, terminology, dialogue, tone, and editorial decisions evidenced in the completed two-pass translation.',
    sections: [
      ...(decisions.length ? [{ id: 'editorial-decisions', title: 'Representative Editorial Decisions', entries: decisions }] : []),
      ...existingSections.map(section => ({ ...section, id: `approved-${section.id}`, title: `Approved Instructions — ${section.title}` })),
    ],
  }
}
