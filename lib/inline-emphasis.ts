/**
 * Inline emphasis recovery.
 *
 * Emphasis was lost entirely from DOCX output: the source book carries 116 italic
 * spans and the delivered files contained no bold, italic or superscript runs at all.
 * Books mark emphasis with styled spans as often as with <em> or <strong>, so the
 * book's own stylesheet decides what a span means.
 *
 * Placement follows the same proportional word mapping the EPUB path already uses, so
 * both formats carry emphasis the same way.
 */

export interface EmphasisRun {
  text: string
  italic?: boolean
  bold?: boolean
  superscript?: boolean
}

export interface InlineStyle { italic?: boolean; bold?: boolean; superscript?: boolean }

const EMPHASIS_TAGS: Record<string, InlineStyle> = {
  em: { italic: true }, i: { italic: true },
  strong: { bold: true }, b: { bold: true },
  sup: { superscript: true },
}

/** Inline character styles declared by the book's stylesheet. */
export function parseInlineStyles(css: string): Map<string, InlineStyle> {
  const styles = new Map<string, InlineStyle>()
  for (const rule of Array.from(css.matchAll(/([^{}]+)\{([^{}]*)\}/g))) {
    const body = rule[2]
    const italic = /font-style\s*:\s*italic/i.test(body) || undefined
    const weight = body.match(/font-weight\s*:\s*([^;]+)/i)?.[1].trim().toLowerCase()
    const bold = weight && (weight === 'bold' || weight === 'bolder' || Number(weight) >= 600) ? true : undefined
    const superscript = /vertical-align\s*:\s*super/i.test(body) || undefined
    if (!italic && !bold && !superscript) continue
    for (const selector of rule[1].split(',')) {
      const name = selector.trim().match(/\.([A-Za-z0-9_-]+)\s*$/)?.[1]
      if (!name) continue
      const existing = styles.get(name.toLowerCase()) || {}
      styles.set(name.toLowerCase(), { italic: italic ?? existing.italic, bold: bold ?? existing.bold, superscript: superscript ?? existing.superscript })
    }
  }
  return styles
}

function merge(a: InlineStyle, b: InlineStyle): InlineStyle {
  return { italic: a.italic || b.italic, bold: a.bold || b.bold, superscript: a.superscript || b.superscript }
}

function decode(text: string): string {
  return text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#160;|&nbsp;/g, ' ')
}

/** Split one block's inner HTML into runs carrying their emphasis. */
export function blockEmphasisRuns(inner: string, styles: Map<string, InlineStyle>): EmphasisRun[] {
  const runs: EmphasisRun[] = []
  const stack: InlineStyle[] = []
  const tokens = inner.split(/(<[^>]+>)/g)
  for (const token of tokens) {
    if (!token) continue
    if (token.startsWith('<')) {
      const close = /^<\/\s*([a-zA-Z0-9]+)/.exec(token)
      if (close) { stack.pop(); continue }
      const open = /^<\s*([a-zA-Z0-9]+)([^>]*)>/.exec(token)
      if (!open) continue
      if (/\/>\s*$/.test(token)) continue // self-closing carries nothing
      const tag = open[1].toLowerCase()
      let style: InlineStyle = EMPHASIS_TAGS[tag] || {}
      const className = /class\s*=\s*["']([^"']*)["']/.exec(open[2])?.[1]
      for (const name of (className || '').split(/\s+/)) {
        const declared = name && styles.get(name.toLowerCase())
        if (declared) style = merge(style, declared)
      }
      stack.push(merge(stack[stack.length - 1] || {}, style))
      continue
    }
    const text = decode(token)
    if (!text.trim()) { if (runs.length) runs[runs.length - 1].text += text; continue }
    const active = stack[stack.length - 1] || {}
    runs.push({ text, italic: active.italic, bold: active.bold, superscript: active.superscript })
  }
  return runs.filter(run => run.text.length)
}

const styleKey = (run: EmphasisRun) => `${run.italic ? 'i' : ''}${run.bold ? 'b' : ''}${run.superscript ? 's' : ''}`

/**
 * Map translated words onto the source's emphasis runs, proportionally by word count.
 * Returns undefined when the block carries no emphasis, so callers keep the plain path.
 */
export function distributeEmphasis(runs: EmphasisRun[], translated: string): EmphasisRun[] | undefined {
  if (!runs.some(run => run.italic || run.bold || run.superscript)) return undefined
  const words = translated.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return undefined
  const weights = runs.map(run => Math.max(run.text.trim() ? run.text.trim().split(/\s+/).length : 0, 0))
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  if (!total) return undefined
  const output: EmphasisRun[] = []
  let offset = 0
  runs.forEach((run, index) => {
    const remaining = words.length - offset
    if (remaining <= 0) return
    const isLast = index === runs.length - 1
    const share = isLast ? remaining : Math.min(remaining, Math.max(weights[index] ? 1 : 0, Math.round(words.length * weights[index] / total)))
    if (!share) return
    // The word split discards separators, so carry one boundary space into every
    // later run. Without it, Word concatenates differently styled words.
    const text = `${offset > 0 ? ' ' : ''}${words.slice(offset, offset + share).join(' ')}`
    offset += share
    const previous = output[output.length - 1]
    // Adjacent runs sharing formatting are merged so the document keeps clean runs.
    const mapped = { text, italic: run.italic, bold: run.bold }
    if (previous && styleKey(previous) === styleKey(mapped)) previous.text += text
    else output.push(mapped)
  })
  if (offset < words.length && output.length) output[output.length - 1].text += ` ${words.slice(offset).join(' ')}`
  if (!output.length) return undefined

  // Footnote markers must be placed by their literal value, not by proportional
  // word position. Proportional placement can superscript an arbitrary nearby word.
  const sourceLength = Math.max(1, runs.reduce((sum, run) => sum + run.text.length, 0))
  const target = output.map(run => run.text).join('')
  let sourceOffset = 0
  let targetFloor = 0
  const intervals: Array<[number, number]> = []
  for (const run of runs) {
    const marker = run.superscript ? run.text.trim() : ''
    if (marker) {
      const expected = Math.round((sourceOffset / sourceLength) * target.length)
      const superscript = marker.replace(/[0-9]/g, digit => '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(digit)])
      const forms = Array.from(new Set([marker, superscript]))
      const candidates: Array<{ at: number; value: string }> = []
      for (const value of forms) for (let at = target.indexOf(value, targetFloor); at >= 0; at = target.indexOf(value, at + 1)) candidates.push({ at, value })
      if (candidates.length) {
        const match = candidates.reduce((best, value) => Math.abs(value.at - expected) < Math.abs(best.at - expected) ? value : best)
        intervals.push([match.at, match.at + match.value.length]); targetFloor = match.at + match.value.length
      }
    }
    sourceOffset += run.text.length
  }
  if (!intervals.length) return output
  const overlaid: EmphasisRun[] = []
  let globalOffset = 0
  for (const run of output) {
    let local = 0
    const end = globalOffset + run.text.length
    for (const [start, markerEnd] of intervals) {
      if (markerEnd <= globalOffset || start >= end) continue
      const a = Math.max(0, start - globalOffset), b = Math.min(run.text.length, markerEnd - globalOffset)
      if (a > local) overlaid.push({ ...run, text: run.text.slice(local, a) })
      overlaid.push({ ...run, text: run.text.slice(a, b), superscript: true })
      local = b
    }
    if (local < run.text.length) overlaid.push({ ...run, text: run.text.slice(local) })
    globalOffset = end
  }
  return overlaid
}
