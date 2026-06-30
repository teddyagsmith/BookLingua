import { Document, Paragraph, TextRun, HeadingLevel, AlignmentType, ShadingType, Packer } from 'docx'

interface SegmentMeta { id: number; type: 'heading' | 'paragraph' | string; level: number; text?: string }

interface TypedSegment {
  type: 'heading' | 'paragraph'
  level: number
  text: string
}

// ─── Heading level mapping (supports H1–H4) ─────────────────────────────────

function headingLevelFromSegment(level: number): any {
  switch (level) {
    case 1: return HeadingLevel.HEADING_1
    case 2: return HeadingLevel.HEADING_2
    case 3: return HeadingLevel.HEADING_3
    case 4: return HeadingLevel.HEADING_4
    default: return HeadingLevel.HEADING_1
  }
}

// ─── Public builders ─────────────────────────────────────────────────────────

export async function buildReviewDocxFromSegments(
  translatedText: string,
  segmentMeta: SegmentMeta[],
  bookTitle: string,
  langDisplay: string,
): Promise<Buffer> {
  const segments = mapTextToSegments(translatedText, segmentMeta)
  const highlightCount = segments.reduce((n, s) => n + ((s.text.match(/\[\[ORIGINAL:/g) || []).length), 0)

  const children: Paragraph[] = [
    new Paragraph({ text: bookTitle, heading: HeadingLevel.TITLE }),
    new Paragraph({
      children: [new TextRun({ text: `Translated into ${langDisplay} by BookLingua`, italics: true, color: '555555' })],
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({ text: '' }),
    new Paragraph({
      children: [new TextRun({ text: '📖 How to Use This Document', bold: true, color: '111827', size: 22 })],
    }),
    new Paragraph({
      children: [new TextRun({
        text: 'Yellow highlighted text = editorial improvement. Clean text = original first-pass translation.',
        color: '374151', size: 20,
      })],
      spacing: { after: 60 },
    }),
    new Paragraph({
      children: [new TextRun({
        text: highlightCount === 0
          ? '✅ Editorial Review: No changes needed — translation was already excellent.'
          : `✏️ Editorial Review: ${highlightCount} improvement${highlightCount !== 1 ? 's' : ''} made.`,
        bold: true, color: highlightCount === 0 ? '166534' : '92400E', size: 20,
      })],
    }),
    new Paragraph({ text: '' }),
  ]

  for (const seg of segments) {
    if (seg.type === 'heading') {
      children.push(new Paragraph({
        text: seg.text,
        heading: headingLevelFromSegment(seg.level),
        spacing: { before: 240, after: 120 },
      }))
    } else {
      children.push(new Paragraph({
        children: parseHighlightedRuns(seg.text),
        spacing: { after: 120 },
      }))
    }
  }

  const doc = new Document({ sections: [{ properties: {}, children }] })
  return Buffer.from(await Packer.toBuffer(doc))
}

export async function buildFinalDocxFromSegments(
  translatedText: string,
  segmentMeta: SegmentMeta[],
  bookTitle: string,
  langDisplay: string,
): Promise<Buffer> {
  const segments = mapTextToSegments(translatedText, segmentMeta)

  const children: Paragraph[] = []

  // Only prepend cover block if title is NOT already in the translation
  if (!hasTitleInTranslation(segments, bookTitle)) {
    children.push(new Paragraph({ text: bookTitle, heading: HeadingLevel.TITLE }))
    children.push(new Paragraph({
      children: [new TextRun({ text: `Translated into ${langDisplay} by BookLingua`, italics: true, color: '555555' })],
      alignment: AlignmentType.CENTER,
    }))
    children.push(new Paragraph({ text: '' }))
  }

  for (const seg of segments) {
    if (seg.type === 'heading') {
      children.push(new Paragraph({
        text: seg.text,
        heading: headingLevelFromSegment(seg.level),
        spacing: { before: 240, after: 120 },
      }))
    } else {
      const clean = stripMarkers(seg.text)
      children.push(new Paragraph({
        children: parseInlineRuns(clean),
        spacing: { after: 120 },
      }))
    }
  }

  const doc = new Document({ sections: [{ properties: {}, children }] })
  return Buffer.from(await Packer.toBuffer(doc))
}

// ─── Core: map translated text → typed segments with drift correction ────────

function mapTextToSegments(
  translatedText: string,
  meta: SegmentMeta[]
): TypedSegment[] {
  const paras = translatedText
    .split(/\n\n+/)
    .map(p => p.trim())
    .filter(p => p.length > 0)

  // Build heading-position index from meta
  const headingsInMeta = meta
    .map((m, i) => ({ ...m, pos: i / Math.max(meta.length - 1, 1) }))
    .filter(m => m.type === 'heading')

  // Pass 1: try positional match
  const result: TypedSegment[] = paras.map((text, i) => {
    const m = meta[i]
    if (m) {
      return {
        type: m.type === 'heading' ? 'heading' : 'paragraph',
        level: m.level ?? 0,
        text,
      }
    }
    return { type: 'paragraph', level: 0, text }
  })

  // Pass 2: drift correction
  const foundHeadings = result.filter(r => r.type === 'heading').length
  const expectedHeadings = headingsInMeta.length

  if (foundHeadings >= expectedHeadings * 0.85) {
    return result
  }

  // Drift detected — use position-ratio matching
  const corrected = result.map(r => ({ ...r }))
  corrected.forEach(r => { r.type = 'paragraph'; r.level = 0 })

  headingsInMeta.forEach(mh => {
    const targetIdx = Math.round(mh.pos * (corrected.length - 1))
    let bestIdx = targetIdx
    for (let offset = 0; offset <= 5; offset++) {
      for (const delta of [offset, -offset]) {
        const idx = targetIdx + delta
        if (idx >= 0 && idx < corrected.length && corrected[idx].type !== 'heading') {
          bestIdx = idx
          break
        }
      }
      if (corrected[bestIdx].type !== 'heading') break
    }
    corrected[bestIdx].type = 'heading'
    corrected[bestIdx].level = mh.level
  })

  return corrected
}

// ─── Duplicate title guard ───────────────────────────────────────────────────

function hasTitleInTranslation(segments: TypedSegment[], titleText: string): boolean {
  if (!titleText) return false
  const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  const normTitle = normalise(titleText)
  return segments.slice(0, 5).some(s => {
    const normSeg = normalise(s.text)
    return normSeg.includes(normTitle) || normTitle.includes(normSeg)
  })
}

// ─── Text helpers ────────────────────────────────────────────────────────────

function stripMarkers(text: string): string {
  return text
    .replace(/\[\[ORIGINAL:([^\]]|\](?!\]))*\]\]/g, '')
    .replace(/===SEGMENT_\d+_(START|END)===/g, '')
    .replace(/###CHAPTER:[^#]*###/g, '')
    .replace(/###H[1-6]:[^#]*###/g, '')
    .replace(/###SEGMENT:\d+:\w+:\d+###/g, '')
    // Strip translation notes blocks — handles both delimited and open-ended forms
    .replace(/===TRANSLATION_NOTES===([\s\S]*?)(===END_NOTES===|===TRANSLATION_NOTES===)/g, '')
    .replace(/===TRANSLATION_NOTES===([\s\S]*)$/, '')  // open-ended: notes at end of document
    .replace(/\[TRANSLATION_NOTES\][\s\S]*?\[\/TRANSLATION_NOTES\]/g, '')
    // Strip any leftover section delimiters
    .replace(/===\w[\w_]*===\n?/g, '')
    .replace(/BookLingua Translation Notes[\s\S]*?(?=\n─{3,}|\n={3,}|$)/g, '')
    .replace(/\n\n(?:\*\*\d+\.\s[^\n]+\n?)+/g, '\n\n')
    .replace(/\n\n[^\n]*(?:RAE|ASALE|ortografía académica)[^\n]*\n/g, '\n')
    .replace(/\n\n[^\n]*(?:fórmula más natural|término estándar|calco del inglés)[^\n]*\n/g, '\n')
    .replace(/[^\S\n]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function parseInlineRuns(text: string, size = 20): TextRun[] {
  const runs: TextRun[] = []
  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*|_([^_]+)_/g
  let last = 0
  let m: RegExpExecArray | null

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      const before = text.slice(last, m.index)
      if (before) runs.push(new TextRun({ text: before, size }))
    }
    if (m[1] !== undefined) runs.push(new TextRun({ text: m[1], bold: true, size }))
    else if (m[2] !== undefined) runs.push(new TextRun({ text: m[2], italics: true, size }))
    else if (m[3] !== undefined) runs.push(new TextRun({ text: m[3], italics: true, size }))
    last = re.lastIndex
  }

  if (last < text.length) {
    const rest = text.slice(last)
    if (rest.trim()) runs.push(new TextRun({ text: rest, size }))
  }

  return runs.length ? runs : [new TextRun({ text, size })]
}

function parseHighlightedRuns(text: string, size = 20): TextRun[] {
  const runs: TextRun[] = []
  const markerRe = /\[\[ORIGINAL:\s*[^\]]*?\]\]([\s\S]*?)(?=\[\[ORIGINAL:|$)/g
  let lastIndex = 0

  const firstMarker = text.indexOf('[[ORIGINAL:')
  if (firstMarker > 0) {
    runs.push(new TextRun({ text: text.slice(0, firstMarker), size }))
    lastIndex = firstMarker
  }

  markerRe.lastIndex = lastIndex
  let match: RegExpExecArray | null

  while ((match = markerRe.exec(text)) !== null) {
    const improvedPhrase = match[1]
    if (improvedPhrase.trim()) {
      runs.push(new TextRun({
        text: improvedPhrase,
        size,
        shading: { type: ShadingType.SOLID, color: 'FFEB3B', fill: 'FFEB3B' },
      }))
    }
    lastIndex = markerRe.lastIndex
  }

  if (lastIndex < text.length) {
    const trailing = text.slice(lastIndex)
    if (trailing.trim()) {
      runs.push(new TextRun({ text: trailing, size }))
    }
  }

  if (runs.length === 0) {
    runs.push(new TextRun({ text, size }))
  }

  return runs
}
