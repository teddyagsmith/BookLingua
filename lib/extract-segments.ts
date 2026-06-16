import mammoth from 'mammoth'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface Segment {
  id: number
  type: 'heading' | 'paragraph' | 'listitem' | 'blockquote'
  level: number // 1, 2, 3 for headings; 0 for others
  text: string
  styleName?: string // original DOCX style (e.g., "Heading 1")
}

// ─── Heuristic heading detection (for files without proper styles) ───────────

const CHAPTER_RE = /^(chapter|chapitre|capítulo|kapitel|capitolo|capitulo)\s*[\d\w]/i
const ALL_CAPS_RE = /^[A-Z\s\d'"!?]+$///
const ROMAN_NUMERAL_RE = /^(I{1,3}|IV|V|VI{0,3}|IX|X|XI{0,3})$/

function isHeuristicHeading(
  text: string,
  index: number,
  totalSegments: number,
  formatting: { isBold?: boolean; isItalic?: boolean; fontSize?: number }
): { isHeading: boolean; level: number } {
  const trimmed = text.trim()
  const len = trimmed.length

  // Empty
  if (len === 0) return { isHeading: false, level: 0 }

  // Chapter markers: "CHAPTER ONE", "Chapter 1", etc.
  if (CHAPTER_RE.test(trimmed)) {
    return { isHeading: true, level: 1 }
  }

  // All-caps short lines (4–40 chars): "PREFACE", "COPYRIGHT", etc.
  if (len >= 4 && len <= 40 && ALL_CAPS_RE.test(trimmed)) {
    return { isHeading: true, level: 1 }
  }

  // Roman numerals alone: "I", "II", "III", "IV", "V"
  if (ROMAN_NUMERAL_RE.test(trimmed) && len <= 5) {
    return { isHeading: true, level: 2 }
  }

  // Short lines after a chapter heading (subheading like "1938")
  // We don't have prev/next here; handled in post-processing
  if (len <= 20 && index > 0 && /^\d{4}$/.test(trimmed)) {
    return { isHeading: true, level: 2 }
  }

  // First paragraph of document — likely title if short and title-case
  if (index === 0 && len <= 60 && formatting.isBold) {
    return { isHeading: true, level: 1 }
  }

  // First paragraph of document — title even without bold if very short and title-case
  if (index === 0 && len <= 40 && /^[A-Z][a-z]+(\s+[A-Z][a-z]+){1,5}$/.test(trimmed)) {
    return { isHeading: true, level: 1 }
  }

  // Section starters: "Dedication:", "Acknowledgements:", "Foreword:", etc.
  if (/^(dedication|acknowledgements?|foreword|preface|prologue|epilogue|introduction|afterword|notes|about the author|also by)\s*[:\-]?/i.test(trimmed) && len <= 100) {
    return { isHeading: true, level: 1 }
  }

  return { isHeading: false, level: 0 }
}

// ─── Extract text and formatting from mammoth paragraph node ────────────────

interface ParagraphInfo {
  text: string
  styleName?: string
  styleId?: string
  isBold: boolean
  isItalic: boolean
  fontSize?: number // in half-points (e.g., 24 = 12pt)
}

function extractParagraphInfo(node: any): ParagraphInfo {
  let text = ''
  let isBold = false
  let isItalic = false
  let fontSize: number | undefined

  function walk(n: any) {
    if (n.type === 'text') {
      text += n.value
    }
    // Check run properties for bold/italic/size
    if (n.type === 'run' && n.properties) {
      if (n.properties.bold) isBold = true
      if (n.properties.italic) isItalic = true
      if (n.properties.fontSize) fontSize = n.properties.fontSize
    }
    if (n.children) {
      n.children.forEach(walk)
    }
  }

  walk(node)

  return {
    text: text.trim(),
    styleName: node.styleName,
    styleId: node.styleId,
    isBold,
    isItalic,
    fontSize,
  }
}

// ─── Main DOCX extractor ────────────────────────────────────────────────────

export async function extractDocxSegments(buffer: Buffer): Promise<Segment[]> {
  const segments: Segment[] = []
  let segmentId = 0

  const result = await mammoth.convertToHtml({ buffer }, {
    transformDocument: (doc) => {
      // Collect all paragraphs first
      const paragraphs: ParagraphInfo[] = []

      function walk(node: any) {
        if (node.type === 'paragraph') {
          const info = extractParagraphInfo(node)
          if (info.text.length > 0) {
            paragraphs.push(info)
          }
        }
        if (node.children) {
          node.children.forEach(walk)
        }
      }

      walk(doc)

      // Second pass: classify each paragraph
      for (let i = 0; i < paragraphs.length; i++) {
        const para = paragraphs[i]

        // Method 1: Proper Word styles
        if (para.styleId?.toLowerCase().includes('heading') ||
            para.styleName?.toLowerCase().includes('heading')) {
          const level = para.styleId?.includes('Heading1') || para.styleName?.includes('Heading 1') ? 1
                      : para.styleId?.includes('Heading2') || para.styleName?.includes('Heading 2') ? 2
                      : 1
          segments.push({
            id: segmentId++,
            type: 'heading',
            level,
            text: para.text,
            styleName: para.styleName || para.styleId,
          })
          continue
        }

        // Method 2: Heuristic detection for manually formatted files
        const heuristic = isHeuristicHeading(para.text, i, paragraphs.length, {
          isBold: para.isBold,
          isItalic: para.isItalic,
          fontSize: para.fontSize,
        })

        if (heuristic.isHeading) {
          segments.push({
            id: segmentId++,
            type: 'heading',
            level: heuristic.level,
            text: para.text,
            styleName: para.styleName || para.styleId,
          })
          continue
        }

        // Default: paragraph
        segments.push({
          id: segmentId++,
          type: 'paragraph',
          level: 0,
          text: para.text,
          styleName: para.styleName || para.styleId,
        })
      }

      return doc // Return unchanged (we just inspected)
    },
  })

  // Log for debugging
  const headingCount = segments.filter(s => s.type === 'heading').length
  console.log(`[extractDocxSegments] Extracted ${segments.length} segments (${headingCount} headings)`)

  return segments
}

// ─── TXT extractor ───────────────────────────────────────────────────────────

export function extractTxtSegments(text: string): Segment[] {
  const lines = text.split('\n')
  const segments: Segment[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (line.length === 0) continue

    // Markdown-style headings
    if (line.startsWith('# ')) {
      segments.push({ id: i, type: 'heading', level: 1, text: line.replace(/^#\s+/, '') })
      continue
    }
    if (line.startsWith('## ')) {
      segments.push({ id: i, type: 'heading', level: 2, text: line.replace(/^##\s+/, '') })
      continue
    }

    // Heuristic heading detection (same rules as DOCX)
    const heuristic = isHeuristicHeading(line, i, lines.length, {})
    if (heuristic.isHeading) {
      segments.push({ id: i, type: 'heading', level: heuristic.level, text: line })
      continue
    }

    segments.push({ id: i, type: 'paragraph', level: 0, text: line })
  }

  return segments
}

// ─── Serialization: segments → text (for feeding into current pipeline) ──────

export function segmentsToText(segments: Segment[]): string {
  return segments
    .map(s => `###SEGMENT:${s.id}:${s.type}:${s.level}###\n${s.text}`)
    .join('\n\n')
}

// ─── Deserialization: text → segments (after translation) ────────────────────

export function textToSegments(text: string): Segment[] {
  const segments: Segment[] = []
  const blocks = text.split(/\n?###SEGMENT:(\d+):(\w+):(\d+)###\n?/)

  // blocks[0] is any text before first marker (usually empty)
  for (let i = 1; i < blocks.length; i += 4) {
    const id = parseInt(blocks[i], 10)
    const type = blocks[i + 1] as Segment['type']
    const level = parseInt(blocks[i + 2], 10)
    const content = blocks[i + 3]?.trim() || ''

    segments.push({ id, type, level, text: content })
  }

  return segments
}

// ─── Test helper ─────────────────────────────────────────────────────────────

export async function testExtraction(buffer: Buffer, label: string): Promise<void> {
  const segments = await extractDocxSegments(buffer)
  console.log(`\n=== ${label} ===`)
  console.log(`Total segments: ${segments.length}`)
  console.log(`Headings: ${segments.filter(s => s.type === 'heading').length}`)

  // Show first 10 segments
  segments.slice(0, 10).forEach(s => {
    const icon = s.type === 'heading' ? 'H' : 'P'
    console.log(`[${s.id}] ${icon}${s.level}: "${s.text.slice(0, 60)}${s.text.length > 60 ? '...' : ''}" (style: ${s.styleName || 'none'})`)
  })
}
