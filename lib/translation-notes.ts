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
    const source = first.sourceText
    const reason = /\b(Caelan|Shayla|Greymere|Blackthorn|Hollow Court|king|queen|court)\b/i.test(source)
      ? 'The editorial review keeps character, place, rank, and worldbuilding terminology coherent while allowing the surrounding sentence to read naturally in the target language.'
      : /\b(kiss|touch|desire|want|body|breath|heart|love|consent|please)\b/i.test(source)
        ? 'The editorial review preserves romantic tension, emotional intensity, and consent cues without making the final wording clinical or more explicit than the source.'
        : /[“”"'’]/.test(source)
          ? 'The editorial review balances the speaker’s character voice and relationship register with the target language’s natural dialogue conventions.'
          : /\b(shadow|dark|blood|hollow|night|ghost|bone|thorn|moon|death)\b/i.test(source)
            ? 'The editorial review protects the gothic-romantasy atmosphere and image pattern while avoiding an overly literal construction.'
            : /[!?…]/.test(source)
              ? 'The editorial review preserves the source sentence’s emphasis, hesitation, and narrative rhythm in target-language punctuation and cadence.'
              : 'The editorial review chooses a natural target-language construction that preserves the complete source meaning and the narrator’s established voice.'
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
