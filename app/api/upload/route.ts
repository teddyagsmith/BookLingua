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

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const sessionId = formData.get('sessionId') as string

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // File size limit: 50MB max
    const MAX_FILE_SIZE = 50 * 1024 * 1024
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File too large. Maximum size is 50MB.' }, { status: 400 })
    }

    // Validate session ID format (basic sanity check)
    if (!sessionId || typeof sessionId !== 'string' || sessionId.length > 200) {
      return NextResponse.json({ error: 'Invalid session ID' }, { status: 400 })
    }

    const fileExtension = file.name.split('.').pop()?.toLowerCase()

    // PDF is not supported — formatting is lost during extraction
    if (fileExtension === 'pdf') {
      return NextResponse.json({
        error: 'PDF files are not supported. Please upload your book as a DOCX, EPUB, or TXT file. PDF formatting cannot be preserved during translation.',
      }, { status: 400 })
    }

    // Whitelist allowed extensions
    const ALLOWED_EXTENSIONS = ['txt', 'docx', 'epub']
    if (!fileExtension || !ALLOWED_EXTENSIONS.includes(fileExtension)) {
      return NextResponse.json({ error: `File type not supported. Please upload a DOCX, EPUB, or TXT file.` }, { status: 400 })
    }

    let textContent = ''
    let storedContent = '' // what gets saved to DB (may include binary for DOCX)
    let wordCount = 0

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Extract text based on file type
    if (fileExtension === 'txt') {
      textContent = buffer.toString('utf-8')
    } else if (fileExtension === 'docx') {
      const result = await mammoth.extractRawText({ buffer })
      textContent = result.value
      if (!textContent || textContent.length < 100) {
        return NextResponse.json({
          error: 'Could not extract text from this DOCX file. Please check the file is not corrupted and try again.',
        }, { status: 400 })
      }
      // Store original binary alongside text so we can preserve formatting on download
      storedContent = JSON.stringify({ text: textContent, binary: buffer.toString('base64') })
    } else if (fileExtension === 'epub') {
      try {
        textContent = await extractEpubText(buffer)
        if (!textContent || textContent.length < 100) {
          return NextResponse.json({
            error: 'Could not extract text from this EPUB file. It may be DRM-protected or image-only. Please export your book as DOCX or TXT and re-upload.',
          }, { status: 400 })
        }
      } catch (err) {
        console.error('EPUB extraction failed:', err)
        return NextResponse.json({
          error: 'Could not read this EPUB file. Please export your book as DOCX or TXT and re-upload.',
        }, { status: 400 })
      }
    }

    // Calculate word count from plain text (not the JSON wrapper)
    wordCount = textContent.trim().split(/\s+/).filter(w => w.length > 0).length

    // For non-DOCX formats, storedContent is the same as textContent
    if (!storedContent) storedContent = textContent

    // Store in temp_uploads for retrieval after payment
    const { error: contentError } = await supabaseAdmin
      .from('temp_uploads')
      .upsert({
        session_id: sessionId,
        file_name: file.name,
        file_format: `.${fileExtension}`,
        content: storedContent,
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
