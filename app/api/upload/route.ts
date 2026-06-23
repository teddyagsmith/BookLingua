// app/api/upload/route.ts
// Replaces the existing upload route.
// EPUB extraction uses Node's built-in JSZip-free approach via the 'adm-zip'
// package (already safe, widely used, no broken zipfile imports).
// No epub2 dependency needed — remove it from package.json if present.
//
// Run after dropping this file in:
//   npm install adm-zip
//   npm uninstall epub2   (if present)

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import mammoth from 'mammoth'
import AdmZip from 'adm-zip'

// ---------------------------------------------------------------------------
// EPUB text extraction
// EPUBs are ZIP files. We unzip, find all .xhtml / .html content files,
// strip the HTML tags, and join the text. No epub2 package needed.
// ---------------------------------------------------------------------------
function extractEpubText(buffer: Buffer): string {
  try {
    const zip = new AdmZip(buffer)
    const entries = zip.getEntries()

    // Find the content files — they live in OEBPS/ or similar and are .xhtml/.html
    const contentFiles = entries
      .filter(e => {
        const n = e.entryName.toLowerCase()
        return (n.endsWith('.xhtml') || n.endsWith('.html')) &&
               !n.includes('toc') &&
               !n.includes('nav') &&
               !n.includes('cover')
      })
      .sort((a, b) => a.entryName.localeCompare(b.entryName))

    if (contentFiles.length === 0) {
      // Fallback: grab any text-like entry
      return entries
        .filter(e => e.entryName.toLowerCase().endsWith('.xhtml') || e.entryName.toLowerCase().endsWith('.html'))
        .map(e => stripHTML(e.getData().toString('utf8')))
        .join('\n')
    }

    return contentFiles
      .map(e => stripHTML(e.getData().toString('utf8')))
      .join('\n')
  } catch (err) {
    console.error('EPUB extraction error:', err)
    return ''
  }
}

function stripHTML(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(w => w.length > 0).length
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------
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

    if (fileExtension === 'txt') {
      textContent = await file.text()
      wordCount = countWords(textContent)

    } else if (fileExtension === 'docx') {
      const arrayBuffer = await file.arrayBuffer()
      const result = await mammoth.extractRawText({ buffer: Buffer.from(arrayBuffer) as any })
      textContent = result.value
      wordCount = countWords(textContent)

    } else if (fileExtension === 'epub') {
      const arrayBuffer = await file.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)

      // Store raw file in Supabase Storage for the translation pipeline
      const { error: uploadError } = await supabaseAdmin.storage
        .from('uploads')
        .upload(`${sessionId}/original.epub`, buffer, {
          contentType: 'application/epub+zip',
          upsert: true,
        })
      if (uploadError) {
        console.error('EPUB storage error:', uploadError)
      }

      // Extract real text and count words
      textContent = extractEpubText(buffer)
      wordCount = textContent ? countWords(textContent) : Math.round(file.size / 6)

      // If extraction produced nothing useful, fall back to size estimate
      if (wordCount < 100) {
        wordCount = Math.round(file.size / 6)
        textContent = `[EPUB file uploaded - ${file.name}]`
      }

    } else if (fileExtension === 'pdf') {
      const arrayBuffer = await file.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)

      const { error: uploadError } = await supabaseAdmin.storage
        .from('uploads')
        .upload(`${sessionId}/original.pdf`, buffer, {
          contentType: 'application/pdf',
          upsert: true,
        })
      if (uploadError) {
        console.error('PDF storage error:', uploadError)
      }

      wordCount = Math.round(file.size / 6)
      textContent = `[PDF file uploaded - ${file.name}]`

    } else {
      return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 })
    }

    // Store in temp_uploads for the checkout flow
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
