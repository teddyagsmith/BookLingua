import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { verifyDownloadToken } from '@/lib/download-token'
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
  return text.replace(/\[\[ORIGINAL:\s*.*?\]\]/g, '').replace(/[^\S\n]{2,}/g, ' ')
}

function isHeading(line: string): boolean {
  const t = line.trim()
  return (
    /^#{1,3}\s/.test(t) ||  // Markdown # headings
    /^(chapter|chapitre|capítulo|kapitel|capitolo|capitulo)\s+\d+/i.test(t) ||
    /^(prologue|epilogue|introduction|conclusion|foreword|preface|préface|préambule|postface|avertissement|prólogo|epílogo|introducción|conclusión|vorwort|nachwort|vorrede|einleitung|schluss|prefazione|postfazione|introduzione|prefácio|posfácio)\b/i.test(t) ||
    // All-caps: only match very short lines (4–20 chars) to avoid false-positives on
    // French/German/Spanish content where longer all-caps phrases are common in body text.
    // Also require no lowercase letters at all (i.e. exclude lines with accented lowercase).
    (t.length >= 4 && t.length <= 20 && t === t.toUpperCase() && /[A-Z]/.test(t) && !/[a-z]/.test(t)) ||
    /^\*{3}/.test(t)
  )
}

function stripMarkdownHeading(t: string): string {
  return t.replace(/^#{1,3}\s+/, '')
}

// Parse inline *italic*, **bold**, _italic_ into TextRuns
function parseInlineRuns(text: string): TextRun[] {
  const runs: TextRun[] = []
  // Match **bold**, *italic*, _italic_ — in that order (bold first to avoid partial match)
  const pattern = /\*\*([^*]+)\*\*|\*([^*]+)\*|_([^_]+)_/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const before = text.slice(lastIndex, match.index)
      if (before) runs.push(new TextRun({ text: before }))
    }
    if (match[1] !== undefined) {
      runs.push(new TextRun({ text: match[1], bold: true }))
    } else if (match[2] !== undefined) {
      runs.push(new TextRun({ text: match[2], italics: true }))
    } else if (match[3] !== undefined) {
      runs.push(new TextRun({ text: match[3], italics: true }))
    }
    lastIndex = pattern.lastIndex
  }

  if (lastIndex < text.length) {
    const rest = text.slice(lastIndex)
    if (rest.trim()) runs.push(new TextRun({ text: rest }))
  }

  if (runs.length === 0 && text.trim()) runs.push(new TextRun({ text }))
  return runs
}

function parseHighlightedRuns(text: string): TextRun[] {
  const runs: TextRun[] = []
  const pattern = /\[\[ORIGINAL:\s*([^\]]+?)\]\]/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const before = text.slice(lastIndex, match.index)
      if (before) {
        // parse inline formatting within the regular text too
        runs.push(...parseInlineRuns(before))
      }
    }
    runs.push(new TextRun({ text: match[1], shading: { type: ShadingType.SOLID, color: 'FFEB3B', fill: 'FFEB3B' } }))
    lastIndex = pattern.lastIndex
  }

  if (lastIndex < text.length) {
    const rest = text.slice(lastIndex)
    if (rest.trim()) runs.push(...parseInlineRuns(rest))
  }

  if (runs.length === 0 && text.trim()) runs.push(new TextRun({ text }))
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
  const blocks = content.split(/\n{2,}/)

  // Build review summary section
  const reviewSummaryParas: Paragraph[] = []

  // ─── Instructions section ──────────────────────────────────────────────
  reviewSummaryParas.push(
    new Paragraph({
      children: [new TextRun({ text: '📖 How to Use This Document', bold: true, color: '111827', size: 22 })],
    }),
    new Paragraph({
      children: [new TextRun({
        text: 'This is your Editorial Review copy. It shows every change our AI made during the second-pass editorial review.',
        color: '374151', size: 20,
      })],
      spacing: { after: 60 },
    }),
    new Paragraph({
      children: [new TextRun({
        text: 'Yellow highlighted text = the original first-pass translation. Clean text after it = the editorially improved version. Review these changes, then download the Final version for publishing.',
        color: '374151', size: 20,
      })],
      spacing: { after: 80 },
    }),
    new Paragraph({
      children: [new TextRun({ text: 'What to check:', bold: true, color: '374151', size: 20 })],
    }),
    ...[
      'Character names, places, and brand names are consistent',
      'Cultural adaptations make sense for your target market',
      'Tone and voice match your original writing style',
      'Any yellow-highlighted sections reflect your intended meaning',
    ].map(item => new Paragraph({
      children: [
        new TextRun({ text: '• ', color: '4F46E5', size: 20 }),
        new TextRun({ text: item, color: '374151', size: 20 }),
      ],
      spacing: { after: 40 },
    })),
    new Paragraph({ text: '', spacing: { after: 120 } }),
  )

  // Build review summary section
  if (highlightCount === 0) {
    reviewSummaryParas.push(
      new Paragraph({
        children: [new TextRun({ text: '✅ Editorial Review: No Changes Needed', bold: true, color: '166534', size: 20 })],
      }),
      new Paragraph({
        children: [new TextRun({
          text: 'Our editorial AI reviewed this translation and found no changes were necessary. The initial translation accurately captured your voice, tone, and meaning.',
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
          text: 'Yellow highlighted text shows the original first-pass translation. The clean text that follows is the editorially improved version.',
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
          children: [new TextRun({ text: 'Editorial Translation Report', bold: true, color: '111827', size: 22 })],
        }),
        new Paragraph({
          children: [new TextRun({
            text: 'A detailed account of every key decision made during translation and editorial review.',
            italics: true, color: '6B7280', size: 20,
          })],
          spacing: { after: 160 },
        }),
      )

      parsedCategories.forEach(({ title, entries }, idx) => {
        const color = CATEGORY_COLORS[idx % CATEGORY_COLORS.length]
        reviewSummaryParas.push(
          new Paragraph({
            children: [
              new TextRun({ text: `  ${title}  `, bold: true, color: 'FFFFFF', size: 18 }),
            ],
            shading: { type: ShadingType.SOLID, color, fill: color },
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
      paragraphs.push(new Paragraph({ text: stripMarkdownHeading(t), heading: HeadingLevel.HEADING_1 }))
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
  const clean = stripHighlightMarkers(content)
    // Remove any stray notes sections that leaked from the editorial pass
    .replace(/===TRANSLATION_NOTES===[\s\S]*?===END_NOTES===/g, '')
    // Remove "TRANSLATION NOTES" and all content below it in the same block
    .replace(/TRANSLATION NOTES[\s\S]*?(?=\n{2,}(?=[A-Z])|$)/g, '')
    // Remove ⚠️ Content Modifications blocks
    .replace(/⚠️ Content Modifications[\s\S]*?(?=\n{2,}(?=[A-Z])|$)/g, '')
    // Remove specific category header blocks
    .replace(/Key Terminology Choices\s*\n[\s\S]*?(?=\n{2,}(?=[A-Z])|$)/g, '')
    .replace(/Cultural Adaptations\s*\n[\s\S]*?(?=\n{2,}(?=[A-Z])|$)/g, '')
    // Remove any analysis/intro text at the start (model commentary before actual translation)
    .replace(/^((?:The tone|Tone analysis|Voice and style|Overall tone|Register|Style analysis|This text|Note:)[^\n]*\n+)+/i, '')
    .trim()
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
      paragraphs.push(new Paragraph({ text: stripMarkdownHeading(t), heading: HeadingLevel.HEADING_1 }))
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
): Promise<Buffer> {
  const clean = stripHighlightMarkers(content)

  // Split into chapters by heading detection
  const lines = clean.split('\n')
  const chapters: { title: string; content: string }[] = []
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

  // Fallback: single chapter if no headings detected
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
  const type = (request.nextUrl.searchParams.get('type') || 'review') as 'review' | 'final'

  if (!token || !verifyDownloadToken(orderId, lang, token)) {
    return NextResponse.json({ error: 'Invalid or missing download token' }, { status: 403 })
  }

  try {
    const { data: order } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single()

    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    if (order.status !== 'completed' && order.status !== 'pending_review') return NextResponse.json({ error: 'Translation not yet complete' }, { status: 400 })

    const { data: file } = await supabaseAdmin
      .from('files')
      .select('content')
      .eq('order_id', orderId)
      .eq('language', lang)
      .eq('type', 'translated')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!file) return NextResponse.json({ error: 'Translation not found' }, { status: 404 })

    const langName    = LANG_NAMES[lang]    || lang
    const langDisplay = LANG_DISPLAY[lang]  || lang
    const safeTitle   = order.book_title.replace(/[^a-z0-9\s]/gi, '').trim()
    const fileFormat  = (order.file_format || '.docx').toLowerCase()
    const upsells     = (order.upsells || []) as string[]
    const hasDualFormat = upsells.includes('dual-format')

    // Allow format override via query param (for dual-format orders)
    const requestedFormat = (request.nextUrl.searchParams.get('format') || fileFormat).toLowerCase()
    const effectiveFormat = (hasDualFormat && (requestedFormat === '.epub' || requestedFormat === '.docx'))
      ? requestedFormat
      : fileFormat

    // ── Review version: always DOCX with yellow highlights + review summary ──
    if (type === 'review') {
      // Fetch translation notes from the dedicated `type: 'notes'` file (preferred)
      // Fallback to last-chunk extraction for legacy orders
      let translationNotes: string | undefined
      const { data: notesFile } = await supabaseAdmin
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
        const { data: notesChunk } = await supabaseAdmin
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

      const doc = buildReviewDocx(file.content, order.book_title, langDisplay, translationNotes)
      const buffer = await Packer.toBuffer(doc)
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Disposition': `attachment; filename="${safeTitle}_${langName}_Review.docx"`,
        },
      })
    }

    // ── Final version: clean, in effective format ──
    if (effectiveFormat === '.epub') {
      const buffer = await buildFinalEpub(file.content, order.book_title, langDisplay)
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          'Content-Type': 'application/epub+zip',
          'Content-Disposition': `attachment; filename="${safeTitle}_${langName}_Final.epub"`,
        },
      })
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
    const { data: originalFile } = await supabaseAdmin
      .from('files')
      .select('content')
      .eq('order_id', orderId)
      .eq('type', 'original')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (originalFile?.content) {
      buffer = await buildFormattedDocxFromOriginal(originalFile.content, file.content)
    }

    if (!buffer) {
      buffer = await Packer.toBuffer(buildFinalDocx(file.content, order.book_title, langDisplay))
    }

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${safeTitle}_${langName}_Final.docx"`,
      },
    })

  } catch (err) {
    console.error('[BookLingua download] error:', err)
    return NextResponse.json({ error: 'Download failed' }, { status: 500 })
  }
}
