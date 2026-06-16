import { Document, Paragraph, TextRun, HeadingLevel, AlignmentType, ShadingType, Packer } from 'docx'

interface SegmentMeta { id: number; type: 'heading' | 'paragraph' | string; level: number }

interface TypedSegment {
  type: 'heading' | 'paragraph'
  level: number
  text: string
}

// ─── Public builders ─────────────────────────────────────────────────────────

/**
 * Build review DOCX (with yellow highlights) using segment type metadata.
 * Headings are correct because we KNOW their types — no regex guessing.
 */
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
        text: 'Yellow highlighted text = original first-pass translation. Clean text = editorial improvement.',
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
        heading: seg.level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_1,
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

/**
 * Build final clean DOCX using segment type metadata.
 */
export async function buildFinalDocxFromSegments(
  translatedText: string,
  segmentMeta: SegmentMeta[],
  bookTitle: string,
  langDisplay: string,
): Promise<Buffer> {
  const segments = mapTextToSegments(translatedText, segmentMeta)

  const children: Paragraph[] = [
    new Paragraph({ text: bookTitle, heading: HeadingLevel.TITLE }),
    new Paragraph({
      children: [new TextRun({ text: `Translated into ${langDisplay} by BookLingua`, italics: true, color: '555555' })],
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({ text: '' }),
  ]

  for (const seg of segments) {
    if (seg.type === 'heading') {
      children.push(new Paragraph({
        text: seg.text,
        heading: seg.level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_1,
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

// ─── Core: map translated text → typed segments ──────────────────────────────

/**
 * Maps plain translated text to typed segments using segment metadata.
 * The translation pipeline outputs paragraphs (double-newline separated).
 * We match them positionally to the segment metadata to restore types.
 */
function mapTextToSegments(translatedText: string, meta: SegmentMeta[]): TypedSegment[] {
  // Split into paragraphs, filtering empties
  const paras = translatedText
    .split(/\n\n+/)
    .map(p => p.trim())
    .filter(p => p.length > 0)

  return paras.map((text, i) => {
    const m = meta[i]
    return {
      type: (m?.type === 'heading' ? 'heading' : 'paragraph') as 'heading' | 'paragraph',
      level: m?.level ?? 0,
      text,
    }
  })
}

// ─── Text helpers ────────────────────────────────────────────────────────────

function stripMarkers(text: string): string {
  return text
    .replace(/\[\[ORIGINAL:([^\]]|\](?!\]))*\]\]/g, '')
    .replace(/===SEGMENT_\d+_(START|END)===/g, '')
    .replace(/###CHAPTER:[^#]*###/g, '')
    .replace(/[^\S\n]{2,}/g, ' ')
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
  const re = /\[\[ORIGINAL:\s*([^\]]+?)\]\]/g
  let last = 0
  let m: RegExpExecArray | null

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      const before = text.slice(last, m.index)
      if (before) runs.push(...parseInlineRuns(before, size))
    }
    // Yellow highlight for the original phrase
    runs.push(new TextRun({
      text: m[1],
      size,
      shading: { type: ShadingType.SOLID, color: 'FFEB3B', fill: 'FFEB3B' },
    }))
    last = re.lastIndex
  }

  if (last < text.length) {
    const rest = text.slice(last)
    if (rest.trim()) runs.push(...parseInlineRuns(rest, size))
  }

  return runs.length ? runs : [new TextRun({ text, size })]
}
