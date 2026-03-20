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

const LANG_NAMES: Record<string, string> = {
  'es-es':   'Spanish (Spain)',
  'es-latam':'Spanish (LatAm)',
  'es':      'Spanish',
  'fr':      'French',
  'de':      'German',
  'pt-pt':   'Portuguese (Portugal)',
  'pt-br':   'Portuguese (Brazil)',
  'pt':      'Portuguese',
}

/**
 * Parse a paragraph string containing [[ORIGINAL: ...]] highlight markers.
 * Returns an array of TextRun objects:
 *   - [[ORIGINAL: old text]] → "old text" in yellow highlight (the first-pass translation)
 *   - Text after the closing ]] → clean improved text (no highlight)
 *   - Regular text → no highlight
 */
function parseHighlightedParagraph(text: string): TextRun[] {
  const runs: TextRun[] = []
  // Match [[ORIGINAL: ...]] blocks
  const pattern = /\[\[ORIGINAL:\s*(.*?)\]\]/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    // Text before this marker
    if (match.index > lastIndex) {
      const before = text.slice(lastIndex, match.index)
      if (before) {
        runs.push(new TextRun({ text: before }))
      }
    }

    // The original (first-pass) phrase — yellow highlight so author can review
    const originalPhrase = match[1].trim()
    if (originalPhrase) {
      runs.push(
        new TextRun({
          text: originalPhrase + ' ',
          shading: { type: ShadingType.SOLID, fill: 'FFFF00', color: 'FFFF00' },
          color: '000000',
        })
      )
    }

    lastIndex = pattern.lastIndex
  }

  // Remaining text after last marker
  if (lastIndex < text.length) {
    const remaining = text.slice(lastIndex)
    if (remaining.trim()) {
      runs.push(new TextRun({ text: remaining }))
    }
  }

  // Fallback: return the whole text if no runs were produced
  if (runs.length === 0 && text.trim()) {
    runs.push(new TextRun({ text }))
  }

  return runs
}

/**
 * Detect whether a line looks like a chapter heading.
 */
function isHeading(line: string): boolean {
  const trimmed = line.trim()
  return (
    /^(chapter|chapitre|capítulo|kapitel|capitolo|capítulo)\s+\d+/i.test(trimmed) ||
    /^(prologue|epilogue|introduction|conclusion|foreword|preface)/i.test(trimmed) ||
    (trimmed.length < 60 && trimmed === trimmed.toUpperCase() && trimmed.length > 3) ||
    /^\*{3}/.test(trimmed)  // scene break ***
  )
}

/**
 * Build a DOCX Document from the translated + highlighted text.
 */
function buildDocx(
  content: string,
  bookTitle: string,
  langName: string,
): Document {
  const paragraphBlocks = content.split(/\n{2,}/)
  const docParagraphs: Paragraph[] = []

  // Title block
  docParagraphs.push(
    new Paragraph({
      text: bookTitle,
      heading: HeadingLevel.TITLE,
    })
  )
  docParagraphs.push(
    new Paragraph({
      text: `Translated into ${langName} by BookLingua`,
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: `Translated into ${langName} by BookLingua`, italics: true, color: '555555' })],
    })
  )
  docParagraphs.push(new Paragraph({ text: '' }))

  for (const block of paragraphBlocks) {
    const trimmed = block.trim()
    if (!trimmed) {
      docParagraphs.push(new Paragraph({ text: '' }))
      continue
    }

    if (isHeading(trimmed)) {
      docParagraphs.push(
        new Paragraph({
          text: trimmed,
          heading: HeadingLevel.HEADING_1,
        })
      )
    } else {
      const lines = trimmed.split('\n')
      for (const line of lines) {
        if (!line.trim()) continue
        const runs = parseHighlightedParagraph(line)
        docParagraphs.push(
          new Paragraph({
            children: runs,
            spacing: { after: 120 },
          })
        )
      }
    }
  }

  return new Document({
    sections: [
      {
        properties: {},
        children: docParagraphs,
      },
    ],
  })
}

export async function GET(
  request: NextRequest,
  { params }: { params: { orderId: string; lang: string } }
) {
  const { orderId, lang } = params
  const token = request.nextUrl.searchParams.get('token')

  if (!token || !verifyDownloadToken(orderId, lang, token)) {
    return NextResponse.json({ error: 'Invalid or missing download token' }, { status: 403 })
  }

  try {
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    if (order.status !== 'completed') {
      return NextResponse.json({ error: 'Translation not yet complete' }, { status: 400 })
    }

    const { data: file, error: fileError } = await supabaseAdmin
      .from('files')
      .select('content')
      .eq('order_id', orderId)
      .eq('language', lang)
      .eq('type', 'translated')
      .single()

    if (fileError || !file) {
      return NextResponse.json({ error: 'Translation not found' }, { status: 404 })
    }

    const langName = LANG_NAMES[lang] || lang
    const safeTitle = order.book_title.replace(/[^a-z0-9\s]/gi, '').trim()
    const fileName = `${safeTitle}_${langName.replace(/[^a-z]/gi, '')}.docx`

    const doc = buildDocx(file.content, order.book_title, langName)
    const buffer = await Packer.toBuffer(doc)

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    })
  } catch (error) {
    console.error('Download error:', error)
    return NextResponse.json({ error: 'Download failed' }, { status: 500 })
  }
}
