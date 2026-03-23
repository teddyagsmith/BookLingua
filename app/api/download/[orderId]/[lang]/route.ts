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

const LANG_NAMES: Record<string, string> = {
  'es-es':    'Spanish_Spain',
  'es-latam': 'Spanish_LatAm',
  'es':       'Spanish',
  'fr':       'French',
  'de':       'German',
  'pt-pt':    'Portuguese_Portugal',
  'pt-br':    'Portuguese_Brazil',
  'pt':       'Portuguese',
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
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function stripHighlightMarkers(text: string): string {
  // Remove [[ORIGINAL: ...]] — keep only the improved text that follows
  return text.replace(/\[\[ORIGINAL:\s*.*?\]\]/g, '').replace(/\s{2,}/g, ' ')
}

function isHeading(line: string): boolean {
  const t = line.trim()
  return (
    /^#{1,3}\s/.test(t) ||  // Markdown # headings
    /^(chapter|chapitre|capítulo|kapitel|capitolo)\s+\d+/i.test(t) ||
    /^(prologue|epilogue|introduction|conclusion|foreword|preface|prólogo|épilogue|einleitung|schluss)/i.test(t) ||
    (t.length < 60 && t.length > 3 && t === t.toUpperCase()) ||
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
  const pattern = /\[\[ORIGINAL:\s*(.*?)\]\]/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const before = text.slice(lastIndex, match.index)
      if (before) runs.push(new TextRun({ text: before }))
    }
    const original = match[1].trim()
    if (original) {
      runs.push(new TextRun({
        text: original + ' ',
        shading: { type: ShadingType.SOLID, fill: 'FFFF00', color: 'FFFF00' },
        color: '000000',
      }))
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

// ─── DOCX: Review version (yellow highlights) ───────────────────────────────

function buildReviewDocx(content: string, bookTitle: string, langDisplay: string): Document {
  const blocks = content.split(/\n{2,}/)
  const paragraphs: Paragraph[] = [
    new Paragraph({ text: bookTitle, heading: HeadingLevel.TITLE }),
    new Paragraph({
      children: [new TextRun({ text: `Translated into ${langDisplay} by BookLingua`, italics: true, color: '555555' })],
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({
      children: [new TextRun({ text: '🟡 Yellow = original first-pass text  |  Clean text = final editorial version', color: '92400E' })],
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({ text: '' }),
  ]

  for (const block of blocks) {
    const t = block.trim()
    if (!t) { paragraphs.push(new Paragraph({ text: '' })); continue }

    if (isHeading(t)) {
      paragraphs.push(new Paragraph({ text: t, heading: HeadingLevel.HEADING_1 }))
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
    if (order.status !== 'completed') return NextResponse.json({ error: 'Translation not yet complete' }, { status: 400 })

    const { data: file } = await supabaseAdmin
      .from('files')
      .select('content')
      .eq('order_id', orderId)
      .eq('language', lang)
      .eq('type', 'translated')
      .single()

    if (!file) return NextResponse.json({ error: 'Translation not found' }, { status: 404 })

    const langName    = LANG_NAMES[lang]    || lang
    const langDisplay = LANG_DISPLAY[lang]  || lang
    const safeTitle   = order.book_title.replace(/[^a-z0-9\s]/gi, '').trim()
    const fileFormat  = (order.file_format || '.docx').toLowerCase()

    // ── Review version: always DOCX with yellow highlights ──
    if (type === 'review') {
      const doc = buildReviewDocx(file.content, order.book_title, langDisplay)
      const buffer = await Packer.toBuffer(doc)
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Disposition': `attachment; filename="${safeTitle}_${langName}_Review.docx"`,
        },
      })
    }

    // ── Final version: clean, in original format ──
    if (fileFormat === '.epub') {
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

    // DOCX or PDF → clean DOCX
    const doc = buildFinalDocx(file.content, order.book_title, langDisplay)
    const buffer = await Packer.toBuffer(doc)
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${safeTitle}_${langName}_Final.docx"`,
      },
    })

  } catch (error) {
    console.error('Download error:', error)
    return NextResponse.json({ error: 'Download failed' }, { status: 500 })
  }
}
