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
