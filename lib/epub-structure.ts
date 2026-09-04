/**
 * Heading recovery for EPUB sources.
 *
 * Most manuscripts do not mark headings with <h1>-<h6>. InDesign, Vellum, Atticus,
 * Word and Google Docs exports commonly emit styled paragraphs such as
 * <p class="Chap-heading">, so tag-name-only detection reads a whole book as body
 * text. Headings are recovered here from the book's own stylesheet: a class that is
 * rendered materially larger than body text is a heading, and distinct sizes rank
 * into levels. Class naming is only a fallback for books that ship no usable CSS,
 * because names are inconsistent and frequently misspelled in real files.
 */

export interface ClassStyle {
  fontSizeEm?: number
  bold?: boolean
}

export interface HeadingModel {
  /** Lower-cased class name to heading level (1-3). */
  levels: Map<string, number>
  /** Body text size the scale was measured against, in em. */
  bodyAnchorEm: number
  /** Blocks whose class is visually promoted, used to measure detection coverage. */
  candidateBlocks: number
}

const CHAPTER_CLASS = /(^|[^a-z])(chap|chapter)/i
const SUB_CLASS = /(sub|secondary|minor)[-_ ]?(head|title)/i
const HEADING_CLASS = /head|title|rubric/i
/** A heading is a label, not prose. Anything longer is body text. */
export const MAX_HEADING_CHARS = 140
/** How much larger than body text a class must render before it counts as a heading. */
const SIZE_MARGIN = 1.15

function parseLength(value: string): number | undefined {
  const match = value.trim().match(/^([\d.]+)\s*(em|rem|px|pt|%)?$/i)
  if (!match) return undefined
  const size = Number(match[1])
  if (!Number.isFinite(size) || size <= 0) return undefined
  const unit = (match[2] || 'em').toLowerCase()
  if (unit === 'em' || unit === 'rem') return size
  if (unit === '%') return size / 100
  if (unit === 'px') return size / 16
  if (unit === 'pt') return size / 12
  return undefined
}

/** Per-class font size and weight, read from the book's stylesheets. */
export function parseClassStyles(css: string): Map<string, ClassStyle> {
  const styles = new Map<string, ClassStyle>()
  for (const rule of Array.from(css.matchAll(/([^{}]+)\{([^{}]*)\}/g))) {
    const body = rule[2]
    const sizeMatch = body.match(/font-size\s*:\s*([^;]+)/i)
    const weightMatch = body.match(/font-weight\s*:\s*([^;]+)/i)
    const fontSizeEm = sizeMatch ? parseLength(sizeMatch[1]) : undefined
    const weight = weightMatch?.[1].trim().toLowerCase()
    const bold = weight ? weight === 'bold' || weight === 'bolder' || Number(weight) >= 600 : undefined
    if (fontSizeEm === undefined && bold === undefined) continue
    for (const selector of rule[1].split(',')) {
      const name = selector.trim().match(/\.([A-Za-z0-9_-]+)\s*$/)?.[1]
      if (!name) continue
      const existing = styles.get(name.toLowerCase()) || {}
      styles.set(name.toLowerCase(), { fontSizeEm: fontSizeEm ?? existing.fontSizeEm, bold: bold ?? existing.bold })
    }
  }
  return styles
}

/** Decide which classes are headings, and at which level, for one book. */
export function buildHeadingModel(classCounts: Map<string, number>, styles: Map<string, ClassStyle>): HeadingModel {
  const levels = new Map<string, number>()
  // Body size is taken from the most-used class that declares one. Usage is a far
  // more reliable signal of "this is the body" than any naming convention.
  let anchor: number | undefined
  let anchorCount = 0
  for (const [name, count] of Array.from(classCounts)) {
    const size = styles.get(name)?.fontSizeEm
    if (size !== undefined && count > anchorCount) { anchor = size; anchorCount = count }
  }
  const sized: Array<{ name: string; size: number; count: number }> = []
  const unsized: string[] = []
  for (const [name, count] of Array.from(classCounts)) {
    const style = styles.get(name)
    if (anchor !== undefined && style?.fontSizeEm !== undefined) {
      const promoted = style.fontSizeEm >= anchor * SIZE_MARGIN || (style.bold === true && style.fontSizeEm >= anchor)
      if (promoted) sized.push({ name, size: style.fontSizeEm, count })
      // A class rendered at body size is body text, whatever it happens to be called.
      continue
    }
    if (CHAPTER_CLASS.test(name) || SUB_CLASS.test(name) || HEADING_CLASS.test(name)) unsized.push(name)
  }
  const distinctSizes = Array.from(new Set(sized.map(entry => entry.size))).sort((a, b) => b - a)
  for (const entry of sized) levels.set(entry.name, Math.min(3, distinctSizes.indexOf(entry.size) + 1))
  for (const name of unsized) {
    if (SUB_CLASS.test(name)) levels.set(name, 3)
    else if (CHAPTER_CLASS.test(name)) levels.set(name, 1)
    else levels.set(name, 2)
  }
  return { levels, bodyAnchorEm: anchor ?? 1, candidateBlocks: sized.reduce((total, entry) => total + entry.count, 0) }
}

/** Heading level for one block, or 0 when it is body text. */
export function headingLevelFor(tag: string, className: string | undefined, text: string, model: HeadingModel): number {
  if (/^h[1-6]$/i.test(tag)) return Math.min(3, Number(tag.slice(1)))
  if (!className || text.length > MAX_HEADING_CHARS) return 0
  // Pull quotes and captions are often set in a promoted style but broken mid-sentence.
  if (/^[a-zà-öø-ÿ]/.test(text)) return 0
  for (const name of className.split(/\s+/)) {
    const level = model.levels.get(name.toLowerCase())
    if (level) return level
  }
  return 0
}

/**
 * Confidence in the recovered structure, measured from what was found rather than
 * asserted. Missing most of the book's visibly promoted blocks scores low, which is
 * the signal that a source's structure was not actually understood.
 */
export function structuralConfidence(input: { blocks: number; headings: number; candidateBlocks?: number; navEntries?: number }): number {
  const { blocks, headings, candidateBlocks = 0, navEntries = 0 } = input
  if (!blocks || !headings) return 0.3
  const ratio = headings / blocks
  // A heading-dense ratio only indicates a misfire once there is enough text for the
  // ratio to mean anything; short documents are legitimately mostly headings.
  if (blocks >= 40 && ratio > 0.5) return 0.5
  if (candidateBlocks && headings / candidateBlocks < 0.5) return 0.5
  let score = ratio >= 0.005 ? 0.9 : 0.6
  if (navEntries > 0 && score >= 0.9) score = 0.95
  return score
}
