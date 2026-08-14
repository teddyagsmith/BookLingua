import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { verifyDownloadToken, verifyCustomerArtifactToken } from '@/lib/download-token'
import {
  Document,
  Paragraph,
  TextRun,
  HeadingLevel,
  Packer,
  AlignmentType,
  ShadingType,
} from 'docx'
import { default as EPub } from 'epub-gen-memory'
import JSZip from 'jszip'
import { HARDENED_V1_ENABLED } from '@/lib/pipeline-capabilities'
import { selectManifestArtifact, verifyStoredArtifact } from '@/lib/hardened-artifact'
import type { ArtifactType } from '@/lib/package-manifest'
import { CUSTOMER_ARTIFACT_TYPES, customerArtifactFilename, customerContentDisposition } from '@/lib/customer-delivery'
import { extractAuthoritativeTranslatedTitle, renderCustomerLaunchPackDocx, renderCustomerTranslationNotesDocx } from '@/lib/customer-delivery-docx'

const LANG_NAMES: Record<string, string> = {
  'es-es':    'Spanish_Spain',
  'es-latam': 'Spanish_LatAm',
  'es':       'Spanish',
  'fr':       'French',
  'de':       'German',
  'pt-pt':    'Portuguese_Portugal',
  'pt-br':    'Portuguese_Brazil',
  'pt':       'Portuguese',
  'it':       'Italian',
  'pl':       'Polish',
  'ja':       'Japanese',
}

const LANG_DISPLAY: Record<string, string> = {
  'es-es':    'Spanish (Spain)',
  'es-latam': 'Spanish (Latin America)',
  'es':       'Spanish',
  'fr':       'French',
  'de':       'German',
  'pt-pt':    'Portuguese (Portugal)',
  'pt-br':    'Portuguese (Brazil)',
  'pt':       'Portuguese',
  'it':       'Italian',
  'pl':       'Polish',
  'ja':       'Japanese',
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function stripHighlightMarkers(text: string): string {
  // Remove [[ORIGINAL: ...]] — keep only the improved text that follows
  // The ORIGINAL text may contain single ] characters (e.g. [citations]),
  // so we must match ] only when NOT followed by another ] (i.e. not ]])
  return text
    .replace(/\[\[ORIGINAL:([^\]]|\](?!\]))*\]\]/g, '')
    // Strip translation notes that Claude appends to the last editorial chunk
    .replace(/===TRANSLATION_NOTES===([\s\S]*?)(===END_NOTES===|===TRANSLATION_NOTES===)/g, '')
    .replace(/===TRANSLATION_NOTES===([\s\S]*)$/, '')
    // Strip any leftover section delimiters
    .replace(/===\w[\w_]*===\n?/g, '')
    .replace(/[^\S\n]{2,}/g, ' ')
}

function stripChapterMarkers(text: string): string {
  // Remove ###CHAPTER: markers used for EPUB structure
  return text.replace(/###CHAPTER:[^#]*###\n?\n?/g, '')
}

function isHeading(line: string): boolean {
  const t = line.trim()
  const len = t.length
  return (
    /^#{1,3}\s/.test(t) ||  // Markdown # headings
    /^###H[1-6]:/.test(t) ||  // EPUB heading markers (###H1:...###)
    // Chapter titles: "Chapter 1", "Kapitel 1", "Capítulo 1", etc. (with or without following text)
    (len < 120 && /^(chapter|chapitre|capítulo|kapitel|capitolo|capitulo)\s+\d+/i.test(t)) ||
    // Standalone chapter number + name pattern: "1. Lily", "1 - Lily", "1: Lily"
    (len < 80 && /^\d+\s*[.:\-]\s*\w+/i.test(t) && len > 2) ||
    // Character name chapters (common in romance): single word or two-word title case, < 30 chars
    (len < 30 && len > 2 && /^[A-Z][a-z]+(\s+[A-Z][a-z]+)?$/.test(t)) ||
    // For intro/outro words: only match if line is short (< 80 chars) to avoid
    // matching body text that starts with e.g. "Introducción Cuando me..."
    (len < 80 && /^(prologue|epilogue|introduction|conclusion|foreword|preface|préface|préambule|postface|avertissement|prólogo|epílogo|introducción|conclusión|vorwort|nachwort|vorrede|einleitung|schluss|prefazione|postfazione|introduzione|prefácio|posfácio)\b/i.test(t)) ||
    // All-caps: only match very short lines (4–20 chars) to avoid false-positives on
    // French/German/Spanish content where longer all-caps phrases are common in body text.
    // Also require no lowercase letters at all (i.e. exclude lines with accented lowercase).
    (len >= 4 && len <= 20 && t === t.toUpperCase() && /[A-Z]/.test(t) && !/[a-z]/.test(t)) ||
    /^\*{3}/.test(t)
  )
}

function stripMarkdownHeading(t: string): string {
  return t
    .replace(/^#{1,3}\s+/, '')
    .replace(/^###H[1-6]:/, '')
    .replace(/###$/, '')
}

function headingLevelFromMarker(t: string): any {
  const match = t.match(/^###H([1-6]):/)
  if (!match) return HeadingLevel.HEADING_1
  const levels: Record<string, any> = {
    '1': HeadingLevel.HEADING_1,
    '2': HeadingLevel.HEADING_2,
    '3': HeadingLevel.HEADING_3,
    '4': HeadingLevel.HEADING_4,
    '5': HeadingLevel.HEADING_5,
    '6': HeadingLevel.HEADING_6,
  }
  return levels[match[1]] || HeadingLevel.HEADING_1
}

// Parse inline *italic*, **bold**, _italic_ into TextRuns
function parseInlineRuns(text: string, size: number = 20): TextRun[] {
  const runs: TextRun[] = []
  // Match **bold**, *italic*, _italic_ — in that order (bold first to avoid partial match)
  const pattern = /\*\*([^*]+)\*\*|\*([^*]+)\*|_([^_]+)_/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const before = text.slice(lastIndex, match.index)
      if (before) runs.push(new TextRun({ text: before, size }))
    }
    if (match[1] !== undefined) {
      runs.push(new TextRun({ text: match[1], bold: true, size }))
    } else if (match[2] !== undefined) {
      runs.push(new TextRun({ text: match[2], italics: true, size }))
    } else if (match[3] !== undefined) {
      runs.push(new TextRun({ text: match[3], italics: true, size }))
    }
    lastIndex = pattern.lastIndex
  }

  if (lastIndex < text.length) {
    const rest = text.slice(lastIndex)
    if (rest.trim()) runs.push(new TextRun({ text: rest, size }))
  }

  if (runs.length === 0 && text.trim()) runs.push(new TextRun({ text, size }))
  return runs
}

function parseHighlightedRuns(text: string, size: number = 20): TextRun[] {
  const runs: TextRun[] = []
  const pattern = /\[\[ORIGINAL:\s*([^\]]+?)\]\]/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const before = text.slice(lastIndex, match.index)
      if (before) {
        // parse inline formatting within the regular text too
        runs.push(...parseInlineRuns(before, size))
      }
    }
    runs.push(new TextRun({ text: match[1], size, shading: { type: ShadingType.SOLID, color: 'FFEB3B', fill: 'FFEB3B' } }))
    lastIndex = pattern.lastIndex
  }

  if (lastIndex < text.length) {
    const rest = text.slice(lastIndex)
    if (rest.trim()) runs.push(...parseInlineRuns(rest, size))
  }

  if (runs.length === 0 && text.trim()) runs.push(new TextRun({ text, size }))
  return runs
}

// ─── DOCX: Review copy (with yellow highlights) ────────────────────────────

function buildReviewDocx(
  content: string,
  bookTitle: string,
  langDisplay: string,
  translationNotes?: string,
): Document {
  const highlightCount = (content.match(/\[\[ORIGINAL:/g) || []).length
  const cleanContent = stripChapterMarkers(content)
    // Strip each notes block (ends at next chapter marker or end-of-notes marker)
    .replace(/===TRANSLATION_NOTES===[\s\S]*?(?=###CHAPTER:|===END_NOTES===)/g, '')
    .replace(/===END_NOTES===/g, '')
    .trim()
  const blocks = cleanContent.split(/\n{2,}/)

  // Build review summary section
  const reviewSummaryParas: Paragraph[] = []

  // ─── Concise Instructions ──────────────────────────────────────────────
  reviewSummaryParas.push(
    new Paragraph({
      children: [new TextRun({ text: '📖 How to Use This Document', bold: true, color: '111827', size: 22 })],
    }),
    new Paragraph({
      children: [new TextRun({
        text: 'Yellow highlighted text = original first-pass translation. Clean text after it = editorial improvement.',
        color: '374151', size: 20,
      })],
      spacing: { after: 60 },
    }),
    new Paragraph({
      children: [new TextRun({
        text: 'What to check: character names, cultural adaptations, tone/voice, and that yellow sections reflect your intended meaning.',
        color: '374151', size: 20,
      })],
      spacing: { after: 80 },
    }),
  )

  // Build review summary section
  if (highlightCount === 0) {
    reviewSummaryParas.push(
      new Paragraph({
        children: [new TextRun({ text: '✅ Editorial Review: No Changes Needed', bold: true, color: '166534', size: 20 })],
      }),
      new Paragraph({
        children: [new TextRun({
          text: 'Our editorial AI reviewed this translation and found no changes were necessary.',
          color: '374151', size: 20,
        })],
        spacing: { after: 120 },
      }),
    )
  } else {
    reviewSummaryParas.push(
      new Paragraph({
        children: [new TextRun({ text: `✏️ Editorial Review: ${highlightCount} Improvement${highlightCount !== 1 ? 's' : ''}`, bold: true, color: '92400E', size: 20 })],
      }),
      new Paragraph({
        children: [new TextRun({
          text: 'See Translation Report below for detailed notes on each change.',
          color: '374151', size: 20,
        })],
        spacing: { after: 120 },
      }),
    )
  }

  // ─── Translation Notes section ───────────────────────────────────────────
  // Category colours: rotate through a warm editorial palette
  const CATEGORY_COLORS = ['4F46E5', '7C3AED', '0F766E', 'B45309', 'BE185D', '1D4ED8']
  const DEFAULT_NOTES = [
    'Character names and proper nouns preserved consistently throughout',
    'Chapter titles and section headings maintained in their original position',
    'Author\'s narrative voice and register carried faithfully into the target language',
    'Cultural references adapted for natural readability in the target market',
    'Dialogue rhythm, pacing, and character tone matched to the original',
  ]

  if (translationNotes) {
    // Try new categorized format first (--- Category --- headers)
    const categoryBlocks = translationNotes.split(/\n(?=---\s)/g)
    const parsedCategories: Array<{ title: string; entries: Array<{ orig: string; trans: string; reason: string }> }> = []

    for (const block of categoryBlocks) {
      const headerMatch = block.match(/^---\s+(.+?)\s+---/)
      if (!headerMatch) continue
      const title = headerMatch[1]
      const entries: Array<{ orig: string; trans: string; reason: string }> = []
      const lines = block.split('\n').slice(1)
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('ORIGINAL:') && !trimmed.startsWith('KEPT AS:')) continue
        const parts = trimmed.replace(/^ORIGINAL:\s*/, '').split(/\s*\|\s*/)
        const orig = parts[0]?.trim() || ''
        const rawTrans = parts[1]?.trim() || ''
        const trans = rawTrans.replace(/^(TRANSLATED|KEPT AS):\s*/, '')
        const reason = (parts[2]?.trim() || '').replace(/^REASON:\s*/, '')
        if (orig) entries.push({ orig, trans, reason })
      }
      if (entries.length > 0) parsedCategories.push({ title, entries })
    }

    if (parsedCategories.length > 0) {
      // Categorized format — render as proper editorial report sections
      reviewSummaryParas.push(
        new Paragraph({ text: '' }),
        new Paragraph({
          children: [new TextRun({ text: 'Editorial Translation Report', bold: true, color: '111827', size: 20 })],
        }),
        new Paragraph({
          children: [new TextRun({
            text: 'Key decisions made during translation and editorial review.',
            italics: true, color: '6B7280', size: 18,
          })],
          spacing: { after: 80 },
        }),
      )

      parsedCategories.forEach(({ title, entries }, idx) => {
        const color = CATEGORY_COLORS[idx % CATEGORY_COLORS.length]
        reviewSummaryParas.push(
          new Paragraph({
            children: [
              new TextRun({ text: `${title}`, bold: true, color, size: 20 }),
            ],
            spacing: { before: 200, after: 100 },
          }),
        )
        for (const { orig, trans, reason } of entries) {
          reviewSummaryParas.push(
            new Paragraph({
              children: [
                new TextRun({ text: orig, bold: true, color: '111827', size: 20 }),
                ...(trans ? [
                  new TextRun({ text: '   →   ', color: '9CA3AF', size: 20 }),
                  new TextRun({ text: trans, bold: true, color, size: 20 }),
                ] : []),
                ...(reason ? [new TextRun({ text: `\n${reason}`, italics: true, color: '6B7280', size: 18 })] : []),
              ],
              indent: { left: 360 },
              spacing: { after: 120 },
            }),
          )
        }
      })
    } else {
      // Legacy flat format (ORIGINAL: ... | TRANSLATED: ... | REASON: ...)
      const noteLines = translationNotes.split('\n').filter(l => l.startsWith('ORIGINAL:'))
      if (noteLines.length > 0) {
        reviewSummaryParas.push(
          new Paragraph({ text: '' }),
          new Paragraph({
            children: [new TextRun({ text: 'Key Translation Decisions', bold: true, color: '374151', size: 20 })],
          }),
          new Paragraph({
            children: [new TextRun({ text: 'How our editors handled important terms, names, and cultural references:', italics: true, color: '6B7280', size: 20 })],
            spacing: { after: 80 },
          }),
        )
        for (const line of noteLines.slice(0, 15)) {
          const parts = line.replace('ORIGINAL: ', '').split(' | ')
          const orig = parts[0] || ''
          const trans = (parts[1] || '').replace('TRANSLATED: ', '')
          const reason = (parts[2] || '').replace('REASON: ', '')
          reviewSummaryParas.push(
            new Paragraph({
              children: [
                new TextRun({ text: orig, bold: true, size: 20 }),
                new TextRun({ text: '  →  ', size: 20 }),
                new TextRun({ text: trans, bold: true, color: '4F46E5', size: 20 }),
                new TextRun({ text: reason ? `  — ${reason}` : '', italics: true, color: '6B7280', size: 20 }),
              ],
              spacing: { after: 80 },
            })
          )
        }
      }
    }
  } else {
    // No notes available — add standard consistency confirmation
    reviewSummaryParas.push(
      new Paragraph({ text: '' }),
      new Paragraph({
        children: [new TextRun({ text: 'Translation Consistency Confirmed', bold: true, color: '374151', size: 20 })],
      }),
      new Paragraph({
        children: [new TextRun({ text: 'Our editorial review confirmed the following throughout:', italics: true, color: '6B7280', size: 20 })],
        spacing: { after: 100 },
      }),
      ...DEFAULT_NOTES.map(note => new Paragraph({
        children: [
          new TextRun({ text: '✓  ', bold: true, color: '4F46E5', size: 20 }),
          new TextRun({ text: note, color: '374151', size: 20 }),
        ],
        spacing: { after: 60 },
      }))
    )
  }

  const paragraphs: Paragraph[] = [
    new Paragraph({ text: bookTitle, heading: HeadingLevel.TITLE }),
    new Paragraph({
      children: [new TextRun({ text: `Translated into ${langDisplay} by BookLingua`, italics: true, color: '555555' })],
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({ text: '' }),
    ...reviewSummaryParas,
    new Paragraph({ text: '' }),
    new Paragraph({
      children: [new TextRun({ text: '─'.repeat(60), color: 'D1D5DB' })],
    }),
    new Paragraph({ text: '' }),
    ...(highlightCount > 0 ? [new Paragraph({
      children: [new TextRun({ text: 'Yellow = original first-pass  |  Clean text = editorial improvement', color: '92400E', italics: true })],
      alignment: AlignmentType.CENTER,
    }), new Paragraph({ text: '' })] : []),
  ]

  for (const block of blocks) {
    const t = block.trim()
    if (!t) { paragraphs.push(new Paragraph({ text: '' })); continue }

    if (isHeading(t)) {
      paragraphs.push(new Paragraph({ text: stripMarkdownHeading(t), heading: headingLevelFromMarker(t) }))
    } else {
      for (const line of t.split('\n')) {
        if (!line.trim()) continue
        paragraphs.push(new Paragraph({ children: parseHighlightedRuns(line), spacing: { after: 120 } }))
      }
    }
  }

  return new Document({ sections: [{ properties: {}, children: paragraphs }] })
}

// ─── DOCX: Final clean version ───────────────────────────────────────────────

function buildFinalDocx(content: string, bookTitle: string, langDisplay: string): Document {
  const clean = stripHighlightMarkers(stripChapterMarkers(
    content
      .replace(/===TRANSLATION_NOTES===[\s\S]*?(?=###CHAPTER:|===END_NOTES===)/g, '')
      .replace(/===END_NOTES===/g, '')
  )).trim()
  const blocks = clean.split(/\n{2,}/)
  const paragraphs: Paragraph[] = [
    new Paragraph({ text: bookTitle, heading: HeadingLevel.TITLE }),
    new Paragraph({
      children: [new TextRun({ text: `Translated into ${langDisplay} by BookLingua`, italics: true, color: '555555' })],
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({ text: '' }),
  ]

  for (const block of blocks) {
    const t = block.trim()
    if (!t) { paragraphs.push(new Paragraph({ text: '' })); continue }

    if (isHeading(t)) {
      paragraphs.push(new Paragraph({ text: stripMarkdownHeading(t), heading: headingLevelFromMarker(t) }))
    } else {
      for (const line of t.split('\n')) {
        if (!line.trim()) continue
        paragraphs.push(new Paragraph({ children: parseInlineRuns(line), spacing: { after: 120 } }))
      }
    }
  }

  return new Document({ sections: [{ properties: {}, children: paragraphs }] })
}

// ─── EPUB: Final clean version ───────────────────────────────────────────────

async function buildFinalEpub(
  content: string,
  bookTitle: string,
  langDisplay: string,
  lang: string,
): Promise<Buffer> {
  // Step 1: Find chapter/heading markers in the ORIGINAL content (before stripping)
  const markerRe = /###(?:CHAPTER|H[1-6]):([^#]*)###\n*/g
  const markers: Array<{ index: number; title: string; level: string; end: number }> = []
  let m
  while ((m = markerRe.exec(content)) !== null) {
    const levelMatch = m[0].match(/^###(CHAPTER|H[1-6]):/)
    markers.push({ index: m.index, title: m[1].trim(), level: levelMatch ? levelMatch[1] : 'CHAPTER', end: m.index + m[0].length })
  }

  // Step 2: Strip all pipeline markers for clean output
  let clean = content
    // Strip segment markers
    .replace(/===SEGMENT_\d+_(START|END)===\n?/g, '')
    // Strip translation notes blocks
    .replace(/===TRANSLATION_NOTES===[\s\S]*?(?:===END_NOTES===|\n{3,}|$)/g, '')
    .replace(/===END_NOTES===/g, '')
    // Strip any remaining === markers
    .replace(/===\w[\w_]*===\n?/g, '')
    // Strip [[ORIGINAL:]] markers
    .replace(/\[\[ORIGINAL:([^\]]|\](?!\]))*\]\]/g, '')
    // Strip chapter/heading markers (they've been recorded already)
    .replace(/###CHAPTER:[^#]*###\n?/g, '')
    .replace(/###H[1-6]:[^#]*###\n?/g, '')
    .trim()

  const chapters: { title: string; content: string }[] = []

  // Step 3: Split into chapters using recorded marker positions
  if (markers.length > 0) {
    // Recalculate positions in the CLEANED text
    // We need to map original positions to cleaned positions
    // Simpler approach: split cleaned text by the marker text pattern
    const cleanMarkerRe = /###(?:CHAPTER|H[1-6]):([^#]*)###\n*/g
    const cleanMarkers: Array<{ index: number; title: string; end: number }> = []
    let cm
    while ((cm = cleanMarkerRe.exec(clean)) !== null) {
      cleanMarkers.push({ index: cm.index, title: cm[1].trim(), end: cm.index + cm[0].length })
    }

    for (let i = 0; i < cleanMarkers.length; i++) {
      const title = cleanMarkers[i].title || `Chapter ${i + 1}`
      const start = cleanMarkers[i].end
      const end = i + 1 < cleanMarkers.length ? cleanMarkers[i + 1].index : clean.length
      const chapterText = clean.slice(start, end).trim()
      if (chapterText) {
        chapters.push({
          title,
          content: `<p>${chapterText.split('\n').filter(l => l.trim()).join('</p><p>')}</p>`,
        })
      }
    }
  }

  // Fallback: no chapter markers found — use heading detection (legacy behavior)
  if (chapters.length === 0) {
    const lines = clean.split('\n')
    let currentTitle = 'Chapter 1'
    let currentLines: string[] = []

    for (const line of lines) {
      if (isHeading(line.trim()) && line.trim().length > 0) {
        if (currentLines.filter(l => l.trim()).length > 0) {
          chapters.push({
            title: currentTitle,
            content: `<p>${currentLines.filter(l => l.trim()).join('</p><p>')}</p>`,
          })
        }
        currentTitle = line.trim()
        currentLines = []
      } else {
        currentLines.push(line)
      }
    }

    // Final chapter
    if (currentLines.filter(l => l.trim()).length > 0) {
      chapters.push({
        title: currentTitle,
        content: `<p>${currentLines.filter(l => l.trim()).join('</p><p>')}</p>`,
      })
    }
  }

  // Fallback: single chapter if no chapters detected
  if (chapters.length === 0) {
    chapters.push({
      title: bookTitle,
      content: `<p>${clean.split('\n').filter(l => l.trim()).join('</p><p>')}</p>`,
    })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buffer = await new (EPub as any)(
    {
      title: bookTitle,
      author: 'Translated by BookLingua',
      description: `Translated into ${langDisplay}`,
      publisher: 'BookLingua',
    },
    chapters,
  )

  return Buffer.from(buffer)
}

// ─── DOCX: In-place XML replacement (preserves original formatting) ─────────

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

async function buildFormattedDocxFromOriginal(
  originalContent: string,
  translatedContent: string,
): Promise<Buffer | null> {
  try {
    const zip = await JSZip.loadAsync(Buffer.from(originalContent, 'base64'))
    const docXml = await zip.file('word/document.xml')?.async('text')
    if (!docXml) return null

    // Strip editorial highlight markers from final document — keep only improved text
    const cleanTranslated = stripHighlightMarkers(translatedContent)

    // Parse translated paragraphs (split by double newline, same as buildReviewDocx)
    const translatedParas = cleanTranslated
      .split(/\n{2,}/)
      .map(block => block.trim())
      .filter(Boolean)
      .flatMap(block => {
        if (isHeading(block)) return [stripMarkdownHeading(block)]
        return block.split('\n').map(l => l.trim()).filter(Boolean)
      })

    // Helper: extract text from <w:t> tags
    const getWtText = (wtTag: string): string => {
      const start = wtTag.indexOf('>') + 1
      const end = wtTag.lastIndexOf('</')
      return start < end ? wtTag.slice(start, end) : ''
    }

    // Regex that only matches <w:t> or <w:t attrs> — NOT <w:tbl>, <w:tr>, <w:titlePg> etc.
    const WT_RE = /<w:t(?:[ \t][^>]*)?>[\s\S]*?<\/w:t>/g

    let paraIndex = 0

    // Match each <w:p ...>...</w:p> block (paragraphs don't nest in DOCX body)
    const newXml = docXml.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, (match) => {
      // Collect all text from this paragraph
      const wtMatches = match.match(WT_RE) || []
      const paraText = wtMatches.map(getWtText).join('').trim()

      // Skip empty / formatting-only paragraphs
      if (!paraText) return match

      // If we've exhausted translated paragraphs, leave this paragraph empty rather than
      // falling back to the original English text (which was the cause of English leaking
      // into the final document for front matter, headers, and overflow paragraphs).
      if (paraIndex >= translatedParas.length) return match.replace(WT_RE, (_, attrs) => `<w:t${attrs ?? ''}></w:t>`)
      const translated = translatedParas[paraIndex]
      paraIndex++

      // Replace: put translated text in first <w:t>, empty the rest
      let firstDone = false
      return match.replace(/<w:t([ \t][^>]*)?>[\s\S]*?<\/w:t>/g, (_, attrs) => {
        const a = attrs ?? ''
        if (!firstDone) {
          firstDone = true
          const newAttrs = a.includes('xml:space') ? a : `${a} xml:space="preserve"`
          return `<w:t${newAttrs}>${escapeXml(translated)}</w:t>`
        }
        return `<w:t${a}></w:t>`
      })
    })

    zip.file('word/document.xml', newXml)
    const result = await zip.generateAsync({ type: 'nodebuffer' })
    console.log(`[BookLingua] XML DOCX replacement succeeded: ${paraIndex} paragraphs mapped, ${translatedParas.length} translated paras`)
    return result
  } catch (err) {
    console.error('[BookLingua] XML DOCX replacement failed:', err)
    return null
  }
}

// ─── Route handler ───────────────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: { orderId: string; lang: string } }
) {
  const { orderId, lang } = params
  const token = request.nextUrl.searchParams.get('token')
  const requestedArtifact = request.nextUrl.searchParams.get('artifact')
  const customerScope = request.nextUrl.searchParams.get('scope') === 'customer'
  const type = (request.nextUrl.searchParams.get('type') || 'review') as 'review' | 'final' | 'pass1'

  const validToken = token && (customerScope
    ? Boolean(requestedArtifact) && CUSTOMER_ARTIFACT_TYPES.includes(requestedArtifact as any) && verifyCustomerArtifactToken(orderId,lang,requestedArtifact!,token)
    : verifyDownloadToken(orderId, lang, token))
  if (!validToken) {
    return NextResponse.json({ error: 'Invalid or missing download token' }, { status: 403 })
  }

  try {
    const { data: order } = await getSupabaseAdmin()
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single()

    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    if (!['completed', 'pending_review', 'ready_for_review', 'delivery_pending'].includes(order.status)) return NextResponse.json({ error: 'Translation not yet approved for download' }, { status: 400 })
    if (customerScope && !['completed','delivery_pending'].includes(order.status)) return NextResponse.json({ error: 'Translation not approved for customer delivery' }, { status: 403 })

    const fileFormat  = (order.file_format || '.docx').toLowerCase()
    const upsells     = (order.upsells || []) as string[]
    const hasDualFormat = upsells.includes('dual-format')
    const requestedFormat = (request.nextUrl.searchParams.get('format') || fileFormat).toLowerCase()
    const effectiveFormat = (hasDualFormat && (requestedFormat === '.epub' || requestedFormat === '.docx'))
      ? requestedFormat
      : fileFormat

    // Hardened packages serve the exact immutable bytes that passed validation.
    // If no artifact table/row exists, legacy orders continue through the dynamic builder below.
    const allowedArtifactTypes = new Set(['translation_brief','pass1_docx','review_docx','final_epub','final_docx','translation_notes','chapter_map_docx','chapter_map_csv','upload_guide','launch_pack'])
    if (requestedArtifact && !allowedArtifactTypes.has(requestedArtifact)) return NextResponse.json({ error: 'Unsupported artifact type' }, { status: 400 })
    const artifactType = (requestedArtifact || (type === 'pass1' ? 'pass1_docx'
      : type === 'review' ? 'review_docx'
        : effectiveFormat === '.epub' ? 'final_epub' : 'final_docx')) as ArtifactType
    let storedArtifact: any = null
    if (HARDENED_V1_ENABLED && (order.status === 'ready_for_review' || order.status === 'delivery_pending' || (order.status === 'completed' && Boolean(order.source_linked_at)))) {
      const { data: currentBuild } = await getSupabaseAdmin().from('order_language_builds')
        .select('id').eq('order_id', orderId).eq('language', lang).eq('is_current', true).maybeSingle()
      if (!currentBuild) return NextResponse.json({ error: 'Current validated build unavailable' }, { status: 409 })
      const { data: packageRow } = await getSupabaseAdmin().from('package_manifests')
        .select('build_id, manifest').eq('order_id', orderId).eq('language', lang).eq('status', 'pass')
        .eq('build_id', currentBuild.id).maybeSingle()
      if (!packageRow?.manifest) return NextResponse.json({ error: 'Validated package artifact unavailable' }, { status: 409 })
      let manifestArtifact
      try { manifestArtifact = selectManifestArtifact(packageRow.manifest, artifactType) }
      catch { return NextResponse.json({ error: 'Validated package artifact unavailable' }, { status: 409 }) }
      const { data } = await getSupabaseAdmin().from('artifacts')
        .select('id, order_id, language, build_id, artifact_type, storage_bucket, storage_path, filename, sha256, size_bytes, validation_status, validation_report_id, validation_reports(passed)')
        .eq('id', manifestArtifact.id).eq('order_id', orderId).eq('language', lang)
        .eq('build_id', packageRow.build_id).eq('artifact_type', artifactType).eq('validation_status', 'pass').maybeSingle()
      if (!data) return NextResponse.json({ error: 'Artifact validation is not authoritative' }, { status: 409 })
      storedArtifact = { ...data, manifestArtifact, packageManifest:packageRow.manifest }
    }
    if (storedArtifact) {
      const { data: storedBytes, error: storedError } = await getSupabaseAdmin().storage
        .from(storedArtifact.storage_bucket).download(storedArtifact.storage_path)
      if (storedError || !storedBytes) return NextResponse.json({ error: 'Validated artifact unavailable' }, { status: 503 })
      const buffer = Buffer.from(await storedBytes.arrayBuffer())
      try { verifyStoredArtifact({ manifestArtifact: storedArtifact.manifestArtifact, record: storedArtifact, orderId, language: lang, buildId: storedArtifact.build_id, type: artifactType, bytes: buffer }) }
      catch {
        return NextResponse.json({ error: 'Stored artifact integrity check failed' }, { status: 409 })
      }
      let responseBuffer:Buffer<ArrayBufferLike>=buffer
      if(customerScope&&artifactType==='launch_pack'){
        let translatedTitle:string|undefined
        try{
          const notesManifest=selectManifestArtifact(storedArtifact.packageManifest,'translation_notes')
          const {data:notesRow}=await getSupabaseAdmin().from('artifacts')
            .select('id, order_id, language, build_id, artifact_type, storage_bucket, storage_path, filename, sha256, size_bytes, validation_status, validation_report_id, validation_reports(passed)')
            .eq('id',notesManifest.id).eq('order_id',orderId).eq('language',lang).eq('build_id',storedArtifact.build_id).eq('artifact_type','translation_notes').eq('validation_status','pass').maybeSingle()
          if(notesRow){
            const {data:notesBlob}=await getSupabaseAdmin().storage.from(notesRow.storage_bucket).download(notesRow.storage_path)
            if(notesBlob){
              const notesBytes=Buffer.from(await notesBlob.arrayBuffer())
              verifyStoredArtifact({manifestArtifact:notesManifest,record:notesRow,orderId,language:lang,buildId:storedArtifact.build_id,type:'translation_notes',bytes:notesBytes})
              translatedTitle=extractAuthoritativeTranslatedTitle(notesBytes,order.book_title)||undefined
            }
          }
        }catch{/* Preserve the validated original title rather than trust an unverified fallback. */}
        responseBuffer=await renderCustomerLaunchPackDocx(buffer,order.book_title,translatedTitle)
      }
      if(customerScope&&artifactType==='translation_notes')responseBuffer=await renderCustomerTranslationNotesDocx(buffer,order.book_title,LANG_DISPLAY[lang]||lang)
      const customerDocx=customerScope&&(artifactType==='launch_pack'||artifactType==='translation_notes')
      const contentType = customerDocx ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        : storedArtifact.filename.endsWith('.epub') ? 'application/epub+zip'
        : storedArtifact.filename.endsWith('.docx') ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          : storedArtifact.filename.endsWith('.json') ? 'application/json'
            : storedArtifact.filename.endsWith('.csv') ? 'text/csv; charset=utf-8' : 'text/plain; charset=utf-8'
      const responseFilename=customerScope?customerArtifactFilename(order.book_title,lang,storedArtifact.manifestArtifact):storedArtifact.filename.replace(/"/g, '')
      return new NextResponse(new Uint8Array(responseBuffer), { headers: {
        'Content-Type': contentType,
        'Content-Disposition': customerScope?customerContentDisposition(responseFilename):`attachment; filename="${responseFilename}"`,
        'Cache-Control':'private, no-store',
        'X-BookLingua-Artifact': 'stored-validated',
      } })
    }
    if (type === 'pass1') return NextResponse.json({ error: 'Pass 1 artifact unavailable for this legacy order' }, { status: 404 })

    const { data: file, error: fileError } = await getSupabaseAdmin()
      .from('files')
      .select('content')
      .eq('order_id', orderId)
      .eq('language', lang)
      .eq('type', 'translated')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!file) {
      // Diagnostic: count available files for this order so we can debug missing rows
      const { data: availableFiles } = await getSupabaseAdmin()
        .from('files')
        .select('type, language')
        .eq('order_id', orderId)
      console.error(`[Download] Translated file not found for order ${orderId} lang ${lang}. Available files:`, availableFiles)
      return NextResponse.json(
        {
          error: 'Translation not found',
          orderId,
          lang,
          availableFiles: availableFiles || [],
          dbError: fileError?.message || null,
        },
        { status: 404 }
      )
    }

    const langName    = LANG_NAMES[lang]    || lang
    const langDisplay = LANG_DISPLAY[lang]  || lang
    const safeTitle   = order.book_title.replace(/[^a-z0-9\s]/gi, '').trim()
    // ── Load segment metadata (if available) for type-safe building ──
    // Segment metadata tells us exactly which paragraphs are headings vs body text.
    // When present, we use segment-aware builders (no isHeading() regex guessing).
    // When absent, we fall back to the old regex-based builders.
    const { data: segFile } = await getSupabaseAdmin()
      .from('files')
      .select('content')
      .eq('order_id', orderId)
      .eq('type', 'segments')
      .eq('language', 'en')
      .maybeSingle()

    const segmentMeta: Array<{ id: number; type: 'heading' | 'paragraph'; level: number }> | null =
      segFile?.content ? JSON.parse(segFile.content) : null

    if (segmentMeta) {
      console.log(`[Download] Using segment-aware builder (${segmentMeta.length} segments, ${segmentMeta.filter(s => s.type === 'heading').length} headings)`)
    }

    // ── Review version: always DOCX with yellow highlights + review summary ──
    if (type === 'review') {
      // Fetch translation notes from the dedicated `type: 'notes'` file (preferred)
      // Fallback to last-chunk extraction for legacy orders
      let translationNotes: string | undefined
      const { data: notesFile } = await getSupabaseAdmin()
        .from('files')
        .select('content')
        .eq('order_id', orderId)
        .eq('language', lang)
        .eq('type', 'notes')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (notesFile?.content) {
        translationNotes = notesFile.content
      } else {
        const { data: notesChunk } = await getSupabaseAdmin()
          .from('translation_chunks')
          .select('content')
          .eq('order_id', orderId)
          .eq('lang_code', lang)
          .eq('pass', 'opus')
          .order('chunk_index', { ascending: false })
          .limit(1)
          .single()
        if (notesChunk?.content) {
          const notesMatch = notesChunk.content.match(/===TRANSLATION_NOTES===([\s\S]*?)===END_NOTES===/)
          if (notesMatch) translationNotes = notesMatch[1].trim()
        }
      }

      // Use segment-aware builder if metadata is available (better heading detection)
      if (segmentMeta) {
        const { buildReviewDocxFromSegments } = await import('@/lib/build-docx-segments')
        const reviewBuffer = await buildReviewDocxFromSegments(file.content, segmentMeta, order.book_title, langDisplay)
        return new NextResponse(new Uint8Array(reviewBuffer), {
          headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'Content-Disposition': `attachment; filename="${safeTitle}_${langName}_Review.docx"`,
            'Cache-Control': 'no-store, must-revalidate',
          },
        })
      }

      // Fallback: old regex-based builder
      const doc = buildReviewDocx(file.content, order.book_title, langDisplay, translationNotes)
      const buffer = await Packer.toBuffer(doc)
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Disposition': `attachment; filename="${safeTitle}_${langName}_Review.docx"`,
          'Cache-Control': 'no-store, must-revalidate',
        },
      })
    }

    // ── Final version: clean, in effective format ──
    if (effectiveFormat === '.epub') {
      // Strip all pipeline markers for clean output, then run artifact gate
      const { detectArtifacts, stripAllMarkers } = await import('@/lib/artifact-gate')
      const cleanContent = stripAllMarkers(file.content)
      const artifactCheck = detectArtifacts(cleanContent)
      if (!artifactCheck.clean) {
        console.error('[Artifact Gate] Violations in translated text:', artifactCheck.violations)
        return NextResponse.json({
          error: 'Template artifacts found in translation',
          violations: artifactCheck.violations,
        }, { status: 500 })
      }

      try {
        const buffer = await buildFinalEpub(cleanContent, order.book_title, langDisplay, lang)
        return new NextResponse(new Uint8Array(buffer), {
          headers: {
            'Content-Type': 'application/epub+zip',
            'Content-Disposition': `attachment; filename="${safeTitle}_${langName}_Final.epub"`,
            'Cache-Control': 'no-store, must-revalidate',
          },
        })
      } catch (epubErr) {
        console.error('[BookLingua] Node EPUB builder failed:', epubErr)
        return NextResponse.json({ error: 'EPUB generation failed' }, { status: 500 })
      }
    }
    if (fileFormat === '.txt') {
      const clean = stripHighlightMarkers(file.content)
      return new NextResponse(clean, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Disposition': `attachment; filename="${safeTitle}_${langName}_Final.txt"`,
        },
      })
    }

    // DOCX → try XML in-place replacement first (preserves original formatting)
    // Fall back to rebuilt DOCX if binary is unavailable or replacement fails
    let buffer: Buffer | null = null

    // Fetch original file to get the binary
    const { data: originalFile } = await getSupabaseAdmin()
      .from('files')
      .select('content')
      .eq('order_id', orderId)
      .eq('type', 'original')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (originalFile?.content) {
      // DOCX files store content as JSON: { text: "...", binary: "base64..." }
      // Extract the binary for XML replacement (legacy TXT files use content as-is)
      let originalBinary = originalFile.content
      try {
        const parsed = JSON.parse(originalFile.content)
        if (parsed.binary) originalBinary = parsed.binary
      } catch {
        // Not JSON — use as-is
      }
      buffer = await buildFormattedDocxFromOriginal(originalBinary, file.content)
    }

    if (!buffer) {
      // Use segment-aware builder if metadata is available (better heading detection)
      if (segmentMeta) {
        const { buildFinalDocxFromSegments } = await import('@/lib/build-docx-segments')
        buffer = await buildFinalDocxFromSegments(file.content, segmentMeta, order.book_title, langDisplay)
      } else {
        buffer = await Packer.toBuffer(buildFinalDocx(file.content, order.book_title, langDisplay))
      }
    }

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${safeTitle}_${langName}_Final.docx"`,
        'Cache-Control': 'no-store, must-revalidate',
      },
    })

  } catch (err) {
    console.error('[BookLingua download] error:', err)
    return NextResponse.json({ error: 'Download failed' }, { status: 500 })
  }
}
// deploy bump 1781770036
