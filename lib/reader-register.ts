/**
 * Reader register: how the book addresses its reader in the target language.
 *
 * This was previously an optional brief item somebody had to remember to add, and it
 * only existed on one order, added by hand after a German reader complained. Every other
 * order translated with no register decision at all, and the per-language guidance told
 * the model to pick formal or informal per context, so a single book came back with both.
 * Register is now resolved for every order, injected into both passes, and asserted on
 * the delivered manuscript.
 */

export type ReaderRegister = 'formal' | 'informal'

export const READER_REGISTER_BRIEF_ITEM_ID = 'reader-register'
export const READER_REGISTER_ISSUE_TYPE = 'reader_register'

/** Author decisions as they are stored on the brief. */
export const READER_REGISTER_DECISIONS: Record<ReaderRegister, string> = {
  formal: 'formal_address',
  informal: 'informal_address',
}

/** Legacy per-language decision strings that predate the generic ones. */
const LEGACY_DECISIONS: Record<string, ReaderRegister> = {
  formal_sie: 'formal', informal_du: 'informal',
  formal_vous: 'formal', informal_tu: 'informal',
  formal_usted: 'formal', informal_tu_es: 'informal',
  formal_lei: 'formal', formal_voce: 'formal',
}

interface RegisterForms {
  /** What each register is called in this language, for the prompt. */
  formalLabel: string
  informalLabel: string
  /** Second-person forms that are unambiguously informal. */
  informal: RegExp
  /** Second-person forms that are unambiguously formal in running text. */
  formal: RegExp
}

/** Languages where the reader notices the difference. Others need no decision. */
const FORMS: Record<string, RegisterForms> = {
  de: {
    formalLabel: 'Sie/Ihnen/Ihr',
    informalLabel: 'du/dich/dir/dein',
    informal: /(?<![\wäöüß])(du|dich|dir|dein|deine|deinen|deinem|deiner|deines)(?![\wäöüß])/gi,
    // "sie" lowercase is she/they and "Sie"/"Ihr" at a sentence start is ambiguous, so
    // only capitalised forms in mid-sentence position count as formal address.
    formal: /(?<=[^.!?:;\n]\s)(Sie|Ihnen|Ihr|Ihre|Ihren|Ihrem|Ihrer|Ihres)(?![\wäöüß])/g,
  },
  fr: {
    formalLabel: 'vous/votre/vos',
    informalLabel: 'tu/toi/ton/ta/tes',
    informal: /(?<![\wàâçéèêëîïôûùüÿœ'’-])(tu|toi|ton|ta|tes|tien|tienne)(?![\wàâçéèêëîïôûùüÿœ'’-])/gi,
    formal: /(?<![\wàâçéèêëîïôûùüÿœ'’-])(vous|votre|vos)(?![\wàâçéèêëîïôûùüÿœ'’-])/gi,
  },
  it: {
    formalLabel: 'Lei/Suo',
    informalLabel: 'tu/ti/tuo',
    informal: /(?<![\wàèéìòù'’-])(tu|ti|tuo|tua|tuoi|tue)(?![\wàèéìòù'’-])/gi,
    formal: /(?<=[^.!?:;\n]\s)(Lei|Suo|Sua|Suoi|Sue)(?![\wàèéìòù'’-])/g,
  },
  'es-es': {
    formalLabel: 'usted/su/sus',
    informalLabel: 'tú/ti/tu/tus',
    informal: /(?<![\wáéíóúñü'’-])(tú|ti|tu|tus|tuyo|tuya|contigo)(?![\wáéíóúñü'’-])/gi,
    formal: /(?<![\wáéíóúñü'’-])(usted|ustedes)(?![\wáéíóúñü'’-])/gi,
  },
  'pt-pt': {
    formalLabel: 'você/o senhor',
    informalLabel: 'tu/ti/teu/tua',
    informal: /(?<![\wáàâãçéêíóôõú'’-])(tu|ti|teu|tua|teus|tuas|contigo)(?![\wáàâãçéêíóôõú'’-])/gi,
    formal: /(?<![\wáàâãçéêíóôõú'’-])(você|vocês)(?![\wáàâãçéêíóôõú'’-])/gi,
  },
  pl: {
    formalLabel: 'Pan/Pani',
    informalLabel: 'ty/ciebie/twój',
    informal: /(?<![\wąćęłńóśźż-])(ty|ciebie|cię|tobie|twój|twoja|twoje|twoim|twojej)(?![\wąćęłńóśźż-])/gi,
    formal: /(?<=[^.!?:;\n]\s)(Pan|Pani|Panu|Pani[aą]|Państwo)(?![\wąćęłńóśźż-])/g,
  },
  nl: {
    formalLabel: 'u/uw',
    informalLabel: 'jij/jou/jouw',
    informal: /(?<![\wéëï-])(jij|jou|jouw)(?![\wéëï-])/gi,
    formal: /(?<![\wéëï-])(u|uw)(?![\wéëï-])/gi,
  },
}

/** Latin American Spanish and Brazilian Portuguese share their forms with the Iberian variants. */
const ALIASES: Record<string, string> = { 'es-419': 'es-es', es: 'es-es', 'pt-br': 'pt-pt', pt: 'pt-pt' }

function formsFor(language: string): RegisterForms | undefined {
  const key = language.toLowerCase()
  return FORMS[key] || FORMS[ALIASES[key]]
}

/** True when the target language makes a second-person distinction worth deciding. */
export function languageHasReaderRegister(language: string): boolean {
  return formsFor(language) !== undefined
}

const INFORMAL_GENRES = /romance|fantasy|romantasy|fiction|young adult|ya\b|children|middle grade|thriller|mystery|horror|erotic/i
const FORMAL_GENRES = /self[- ]?help|health|wellness|business|finance|money|academic|professional|reference|non[- ]?fiction|memoir|history|science|technical|medical|legal/i

/**
 * The register an order gets when the author expressed no preference. Brazilian
 * Portuguese always addresses the reader as você, so it never defaults to tu.
 */
export function defaultReaderRegister(genre: string | undefined, language: string): ReaderRegister {
  const key = language.toLowerCase()
  if (key === 'pt-br' || key === 'pt') return 'formal'
  const value = genre || ''
  if (INFORMAL_GENRES.test(value)) return 'informal'
  if (FORMAL_GENRES.test(value)) return 'formal'
  return 'formal'
}

interface BriefLike { items: Array<{ id?: string; issueType?: string; authorDecision?: string }> }

/** The author's own decision, if the brief carries one. */
export function readerRegisterFromBrief(brief: BriefLike | undefined): ReaderRegister | undefined {
  const item = brief?.items?.find(entry =>
    entry.issueType === READER_REGISTER_ISSUE_TYPE || entry.id === READER_REGISTER_BRIEF_ITEM_ID)
  if (!item?.authorDecision) return undefined
  const decision = item.authorDecision.toLowerCase()
  if (decision === READER_REGISTER_DECISIONS.formal) return 'formal'
  if (decision === READER_REGISTER_DECISIONS.informal) return 'informal'
  return LEGACY_DECISIONS[decision]
}

/**
 * Every order resolves to exactly one register. The author's decision wins; absent one,
 * the genre default applies. There is no "unset" state for the pipeline to drift in.
 */
export function resolveReaderRegister(input: { brief?: BriefLike; genre?: string; language: string }): ReaderRegister {
  return readerRegisterFromBrief(input.brief) || defaultReaderRegister(input.genre, input.language)
}

/** The register instruction both passes receive, verbatim, for every batch. */
export function readerRegisterPromptLine(language: string, register: ReaderRegister): string {
  const forms = formsFor(language)
  if (!forms) return ''
  const use = register === 'formal' ? forms.formalLabel : forms.informalLabel
  const avoid = register === 'formal' ? forms.informalLabel : forms.formalLabel
  return `READER REGISTER, absolute and non-negotiable: this book addresses its reader as ${use} throughout. `
    + `Use ${use} in every author-to-reader passage, including headings, captions, exercises, instructions and lists. `
    + `Never use ${avoid} to address the reader anywhere in the book, however casual or instructional the passage feels. `
    + `Dialogue between characters quoting each other may use whatever the source implies; the author's own voice may not.`
}

export interface RegisterViolation {
  form: string
  index: number
  excerpt: string
}

/**
 * Forms of address that contradict the decided register. Runs on delivered text, so it
 * reports what a reader would see rather than what the pipeline believes it produced.
 */
export function readerRegisterViolations(text: string, language: string, register: ReaderRegister): RegisterViolation[] {
  const forms = formsFor(language)
  if (!forms) return []
  const pattern = new RegExp(register === 'formal' ? forms.informal.source : forms.formal.source,
    register === 'formal' ? 'gi' : 'g')
  const violations: RegisterViolation[] = []
  for (const match of Array.from(text.matchAll(pattern))) {
    const index = match.index ?? 0
    violations.push({
      form: match[1] ?? match[0],
      index,
      excerpt: text.slice(Math.max(0, index - 40), index + 40).replace(/\s+/g, ' ').trim(),
    })
  }
  return violations
}
