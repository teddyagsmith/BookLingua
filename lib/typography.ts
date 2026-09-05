/**
 * Typographic normalisation of translated text.
 *
 * Translation output arrives with typewriter punctuation mixed into typographic
 * punctuation: the French delivery carried roughly 1,500 straight apostrophes against
 * 550 typographic ones, and the German one was split almost evenly between English and
 * German quotation marks. These are mechanical properties of the output, so they are
 * corrected deterministically here rather than asked of a model.
 */

const APOSTROPHE = '’'

export interface QuoteStyle { open: string; close: string }

/** Book-publishing convention per language. */
export const QUOTE_STYLES: Record<string, QuoteStyle> = {
  fr: { open: '« ', close: ' »' },
  de: { open: '„', close: '“' },
  'es-es': { open: '«', close: '»' },
  'es-419': { open: '“', close: '”' },
  'pt-br': { open: '“', close: '”' },
  'pt-pt': { open: '“', close: '”' },
  it: { open: '«', close: '»' },
}

export function quoteStyle(language: string): QuoteStyle | undefined {
  return QUOTE_STYLES[language] || QUOTE_STYLES[language.split('-')[0]]
}

/** Every quote character that may stand in for an opening or closing quote. */
const QUOTE_CHARS = /["“”„«»]/g

/**
 * Straight apostrophes between letters are always elisions ("l'un", "qu'il", "don't"),
 * never quotation marks, so they convert with no ambiguity.
 */
const LETTER = 'A-Za-z\\u00C0-\\u024F'

export function normalizeApostrophes(text: string): string {
  return text.replace(new RegExp(`([${LETTER}])'([${LETTER}])`, 'g'), `$1${APOSTROPHE}$2`)
}

/**
 * Normalise quotation marks to the target language's convention.
 * Only applied when a paragraph's quote characters are balanced, since pairing an odd
 * number of marks would guess at which are opening and which are closing.
 */
export function normalizeQuotes(text: string, language: string): string {
  const style = quoteStyle(language)
  if (!style) return text
  const marks = text.match(QUOTE_CHARS)
  if (!marks || marks.length % 2 !== 0) return text
  let open = true
  return text.replace(QUOTE_CHARS, () => {
    const replacement = open ? style.open : style.close
    open = !open
    return replacement
  })
}

/** Apply the full typographic contract for one language. */
export function normalizeTypography(text: string, language: string): string {
  // Model/cache text can contain visible XML entities. Decode punctuation before
  // applying language rules, otherwise `N&apos;oubliez` bypasses apostrophe
  // normalisation and `&quot;...&quot;` bypasses quote pairing.
  let decoded = text
  for (let i = 0; i < 3; i++) {
    const next = decoded.replace(/&amp;/g, '&').replace(/&apos;/g, "'").replace(/&quot;/g, '"')
    if (next === decoded) break
    decoded = next
  }
  let normalized=normalizeQuotes(normalizeApostrophes(decoded).replace(/\.\.\./g, '…'), language)
  if(language==='fr')normalized=normalized
    .replace(/«[ \u00a0\u202f]*/g,'«\u202f')
    .replace(/[ \u00a0\u202f]*»/g,'\u202f»')
    .replace(/([A-Za-zÀ-ÖØ-öø-ÿ0-9,:;.!?])«/g,'$1 «')
  return normalized
}
