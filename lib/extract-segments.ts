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

// ─── Heading level extraction (robust to spacing variations) ────────────────

function extractHeadingLevel(styleId?: string, styleName?: string): number {
  const sid = (styleId ?? '').toLowerCase().replace(/\s/g, '')
  const sna = (styleName ?? '').toLowerCase().replace(/\s/g, '')
  const combined = sid + '|' + sna

  // Match heading1, heading 1, h1, etc.
  const m = combined.match(/heading(\d)/)
  if (m) {
    const n = parseInt(m[1])
    return n >= 1 && n <= 4 ? n : 1
  }
  return 1 // fallback: unknown heading style → H1
}

// ─── Pages H2-inflation guard ───────────────────────────────────────────────

function sanitizePagesExport(segments: Segment[]): Segment[] {
  const total = segments.length
  if (total === 0) return segments

  const headings = segments.filter(s => s.type === 'heading')
  const allH2 = headings.length > 0 && headings.every(s => s.level === 2)

  if (!allH2) return segments

  // Everything is H2 — this is a Pages export. Use heuristic to assign H1 vs H2.
  return segments.map(s => {
    if (s.type !== 'heading') return s
    const isTopLevel = /^(introduction|preface|foreword|dedication|conclusion|epilogue|chapter|chapitre|capítulo|kapitel|capitolo|teil|parte|section)/i.test(s.text.trim())
    return { ...s, level: isTopLevel ? 1 : 2 }
  })
}

function tocKey(value: string): string {
  return value.normalize('NFKC').toLowerCase()
    .replace(/[.…·_]{2,}\s*\d*\s*$/, '')
    .replace(/\s+\d+\s*$/, '')
    .replace(/[^a-z0-9À-ž]+/gi, ' ').replace(/\s+/g, ' ').trim()
}

// Google Docs/Pages conversions often flatten every paragraph to "Default"
// while leaving a readable contents list. Recover only headings that have an
// exact later body match; the contents entries themselves remain paragraphs.
export function inferHeadingsFromContents(segments: Segment[]): Segment[] {
  const contentsIndex = segments.findIndex(segment => /^(contents|table of contents)$/i.test(segment.text.trim()))
  if (contentsIndex < 0) return segments
  const candidates = new Map<string, { text: string; level: number; bodyIndex: number }>()
  const scanEnd = Math.min(segments.length, contentsIndex + 220)
  for (let index = contentsIndex + 1; index < scanEnd; index++) {
    const text = segments[index].text.trim(), key = tocKey(text)
    if (key.length < 3 || key.length > 120 || text.split(/\s+/).length > 18) continue
    const later = segments.findIndex((segment, candidateIndex) => candidateIndex > index + 2 && tocKey(segment.text) === key)
    if (later < 0) continue
    candidates.set(key, { text, level: /^(part|section)\b/i.test(text) ? 1 : 2, bodyIndex: later })
  }
  if (candidates.size < 3) return segments
  const firstBodyMatch = Math.min(...Array.from(candidates.values()).map(candidate => candidate.bodyIndex))
  return segments.map((segment, index) => {
    if (index < firstBodyMatch || segment.type === 'heading') return segment
    const candidate = candidates.get(tocKey(segment.text))
    return candidate && index >= candidate.bodyIndex ? { ...segment, type: 'heading', level: candidate.level } : segment
  })
}

export interface ExtractionResult {
  segments: Segment[]
  quality: QualityReport
}

export async function extractDocxSegments(buffer: Buffer): Promise<ExtractionResult> {
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
        if (para.styleId?.toLowerCase().replace(/\s/g,'').includes('heading') ||
            para.styleName?.toLowerCase().replace(/\s/g,'').includes('heading')) {
          const level = extractHeadingLevel(para.styleId, para.styleName)
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

  const inferred = inferHeadingsFromContents(sanitizePagesExport(segments))
  const quality = assessQuality(inferred)
  return { segments: inferred, quality }
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

// ─── Quality Gate ────────────────────────────────────────────────────────────
// Flags documents that are too messy for automated processing

export interface QualityReport {
  score: number        // 0–100, higher is better
  status: 'clean' | 'needs_review' | 'unprocessable'
  issues: string[]
  headingCount: number
  paragraphCount: number
  avgParagraphLength: number
  hasProperStyles: boolean
}

export function assessQuality(segments: Segment[]): QualityReport {
  const issues: string[] = []
  const headings = segments.filter(s => s.type === 'heading')
  const paragraphs = segments.filter(s => s.type === 'paragraph')
  const hasProperStyles = segments.some(s => s.styleName && s.styleName !== 'none')

  // Calculate average paragraph length
  const avgLength = paragraphs.length > 0
    ? paragraphs.reduce((sum, s) => sum + s.text.length, 0) / paragraphs.length
    : 0

  // Issue: No headings detected in a long document
  if (headings.length === 0 && segments.length > 50) {
    issues.push('No headings detected — document may be one giant block of text')
  }

  // Issue: Very short paragraphs (possible broken sentences)
  const shortParagraphs = paragraphs.filter(p => p.text.length < 30).length
  if (paragraphs.length > 0 && shortParagraphs / paragraphs.length > 0.3) {
    issues.push(`${Math.round((shortParagraphs / paragraphs.length) * 100)}% of paragraphs are very short — possible broken sentences or line breaks`)
  }

  // Issue: Very long paragraphs (possible merged content)
  const longParagraphs = paragraphs.filter(p => p.text.length > 2000).length
  if (paragraphs.length > 0 && longParagraphs / paragraphs.length > 0.1) {
    issues.push(`${Math.round((longParagraphs / paragraphs.length) * 100)}% of paragraphs are extremely long — possible merged content`)
  }

  // Issue: No proper styles AND very few headings (manually formatted mess)
  if (!hasProperStyles && headings.length < 3 && segments.length > 100) {
    issues.push('Document has no heading styles and few detected headings — structure may be unreliable')
  }

  // Issue: Unusual character distribution (garbled text)
  const totalText = segments.map(s => s.text).join('')
  const nonAsciiRatio = (totalText.match(/[^\x00-\x7F]/g) || []).length / totalText.length
  if (nonAsciiRatio > 0.5 && totalText.length > 1000) {
    issues.push('High proportion of non-ASCII characters — possible encoding issues or garbled text')
  }

  // Issue: Excessive empty/whitespace-only segments
  const emptySegments = segments.filter(s => s.text.trim().length === 0).length
  if (emptySegments / segments.length > 0.2) {
    issues.push(`${Math.round((emptySegments / segments.length) * 100)}% empty segments — possible extraction failure`)
  }

  // Calculate score
  let score = 100
  score -= issues.length * 15
  if (!hasProperStyles) score -= 10
  if (headings.length === 0) score -= 20
  score = Math.max(0, Math.min(100, score))

  // Determine status
  let status: QualityReport['status'] = 'clean'
  if (score < 50 || issues.length >= 3) {
    status = 'unprocessable'
  } else if (score < 75 || issues.length >= 1) {
    status = 'needs_review'
  }

  return {
    score,
    status,
    issues,
    headingCount: headings.length,
    paragraphCount: paragraphs.length,
    avgParagraphLength: Math.round(avgLength),
    hasProperStyles,
  }
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
  const { segments, quality } = await extractDocxSegments(buffer)
  console.log(`\n=== ${label} ===`)
  console.log(`Total segments: ${segments.length}`)
  console.log(`Headings: ${segments.filter(s => s.type === 'heading').length}`)
  console.log(`Quality: ${quality.status} (score: ${quality.score})`)
  if (quality.issues.length > 0) {
    console.log(`Issues: ${quality.issues.join('; ')}`)
  }

  // Show first 10 segments
  segments.slice(0, 10).forEach(s => {
    const icon = s.type === 'heading' ? 'H' : 'P'
    console.log(`[${s.id}] ${icon}${s.level}: "${s.text.slice(0, 60)}${s.text.length > 60 ? '...' : ''}" (style: ${s.styleName || 'none'})`)
  })
}
