import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import mammoth from 'mammoth'
import { writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'

// Lazy imports to avoid edge runtime issues
async function extractEpubText(buffer: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Epub = require('epub2').default ?? require('epub2')
  const tmpPath = join(tmpdir(), `${randomUUID()}.epub`)

  try {
    writeFileSync(tmpPath, buffer)

    return await new Promise((resolve, reject) => {
      const epub = new Epub(tmpPath)

      epub.on('end', async () => {
        try {
          const chapters: string[] = []
          const flowItems = epub.flow || []

          for (const item of flowItems) {
            if (!item.id) continue
            const chapterId = item.id as string
            await new Promise<void>((res) => {
              epub.getChapter(chapterId, (err: Error, text?: string) => {
                if (!err && text) {
                  // Strip HTML tags
                  const stripped = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
                  if (stripped.length > 0) chapters.push(stripped)
                }
                res()
              })
            })
          }

          resolve(chapters.join('\n\n'))
        } catch (e) {
          reject(e)
        }
      })

      epub.on('error', reject)
      epub.parse()
    })
  } finally {
    try { unlinkSync(tmpPath) } catch {}
  }
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pdfParse = require('pdf-parse')
  const data = await pdfParse(buffer)
  return data.text
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const sessionId = formData.get('sessionId') as string

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const fileExtension = file.name.split('.').pop()?.toLowerCase()
    let textContent = ''
    let wordCount = 0

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Extract text based on file type
    if (fileExtension === 'txt') {
      textContent = buffer.toString('utf-8')
    } else if (fileExtension === 'docx') {
      const result = await mammoth.extractRawText({ buffer })
      textContent = result.value
    } else if (fileExtension === 'epub') {
      try {
        textContent = await extractEpubText(buffer)
        if (!textContent || textContent.length < 100) {
          // Fallback if extraction yields too little
          textContent = `[EPUB: ${file.name} — text extraction produced minimal content. Please re-upload as DOCX or TXT.]`
        }
      } catch (err) {
        console.error('EPUB extraction failed:', err)
        textContent = `[EPUB: ${file.name} — extraction failed. Please re-upload as DOCX or TXT for best results.]`
      }
    } else if (fileExtension === 'pdf') {
      try {
        textContent = await extractPdfText(buffer)
        if (!textContent || textContent.length < 100) {
          textContent = `[PDF: ${file.name} — text extraction produced minimal content. Please re-upload as DOCX or TXT.]`
        }
      } catch (err) {
        console.error('PDF extraction failed:', err)
        textContent = `[PDF: ${file.name} — extraction failed. Please re-upload as DOCX or TXT for best results.]`
      }
    } else {
      return NextResponse.json({ error: `Unsupported file type: .${fileExtension}` }, { status: 400 })
    }

    // Calculate word count
    wordCount = textContent.trim().split(/\s+/).filter(w => w.length > 0).length

    // Store in temp_uploads for retrieval after payment
    const { error: contentError } = await supabaseAdmin
      .from('temp_uploads')
      .upsert({
        session_id: sessionId,
        file_name: file.name,
        file_format: `.${fileExtension}`,
        content: textContent,
        word_count: wordCount,
        created_at: new Date().toISOString(),
      })

    if (contentError) {
      console.error('Content storage error:', contentError)
      return NextResponse.json({ error: 'Failed to store upload' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      wordCount,
      fileName: file.name,
      fileFormat: `.${fileExtension}`,
    })

  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
