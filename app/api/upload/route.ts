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
import { getSupabaseAdmin } from '@/lib/supabase'
import mammoth from 'mammoth'
import AdmZip from 'adm-zip'
import { buildSourceManifest, SourceFormat } from '@/lib/source-manifest'
import { HARDENED_SOURCE_BUCKET, SOURCE_UPLOAD_BUCKET, sourceStoragePath } from '@/lib/source-binary'
import { issueUploadIdentity } from '@/lib/upload-identity'
import { HARDENED_V1_ENABLED } from '@/lib/pipeline-capabilities'
import { assertSupportedSourcePackage } from '@/lib/source-upload-validation'

// ---------------------------------------------------------------------------
// EPUB text extraction
// EPUBs are ZIP files. We parse the OPF manifest+spine to get the correct
// reading order, then extract only spine items — no duplicates, correct order.
// ---------------------------------------------------------------------------
function extractEpubText(buffer: Buffer): string {
  try {
    const zip = new AdmZip(buffer)
    const entries = zip.getEntries()
    const entryMap: Record<string, any> = {}
    for (const e of entries) entryMap[e.entryName] = e

    // ── Step 1: find the OPF file via META-INF/container.xml ────────────────
    const containerEntry = entries.find(e => e.entryName === 'META-INF/container.xml')
    let opfPath: string | null = null
    if (containerEntry) {
      const containerXml = containerEntry.getData().toString('utf8')
      const m = containerXml.match(/full-path="([^"]+\.opf)"/)
      if (m) opfPath = m[1]
    }
    if (!opfPath) {
      // Fallback: find any .opf file
      const opfEntry = entries.find(e => e.entryName.endsWith('.opf'))
      if (opfEntry) opfPath = opfEntry.entryName
    }

    if (opfPath && entryMap[opfPath]) {
      // ── Step 2: parse OPF manifest and spine ──────────────────────────────
      const opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : ''
      const opfXml = entryMap[opfPath].getData().toString('utf8')

      // Build manifest: id → href
      const manifest: Record<string, string> = {}
      const manifestRe = /<item\s[^>]*id="([^"]+)"[^>]*href="([^"]+)"[^>]*>/g
      let mm: RegExpExecArray | null
      while ((mm = manifestRe.exec(opfXml)) !== null) {
        manifest[mm[1]] = mm[2]
      }

      // Get spine idref order
      const spineIdrefs: string[] = []
      const spineRe = /<itemref\s[^>]*idref="([^"]+)"/g
      let sm: RegExpExecArray | null
      while ((sm = spineRe.exec(opfXml)) !== null) {
        spineIdrefs.push(sm[1])
      }

      if (spineIdrefs.length > 0) {
        const texts: string[] = []
        for (const idref of spineIdrefs) {
          const href = manifest[idref]
          if (!href) continue
          // Resolve relative to OPF directory
          const fullPath = opfDir + href.split('#')[0] // strip fragment
          const entry = entryMap[fullPath] || entryMap[href.split('#')[0]]
          if (!entry) continue
          const n = fullPath.toLowerCase()
          // Skip nav/toc/cover even if in spine
          if (n.includes('toc') || n.includes('nav') || n.includes('cover')) continue
          texts.push(stripHTML(entry.getData().toString('utf8')))
        }
        if (texts.length > 0) return texts.join('\n')
      }
    }

    // ── Fallback: alphabetical sort (old behaviour) ─────────────────────────
    console.warn('[EPUB] Could not parse OPF spine — falling back to alphabetical sort')
    const contentFiles = entries
      .filter(e => {
        const n = e.entryName.toLowerCase()
        return (n.endsWith('.xhtml') || n.endsWith('.html')) &&
               !n.includes('toc') && !n.includes('nav') && !n.includes('cover')
      })
      .sort((a, b) => a.entryName.localeCompare(b.entryName))

    if (contentFiles.length === 0) {
      return entries
        .filter(e => e.entryName.toLowerCase().endsWith('.xhtml') || e.entryName.toLowerCase().endsWith('.html'))
        .map(e => stripHTML(e.getData().toString('utf8')))
        .join('\n')
    }
    return contentFiles.map(e => stripHTML(e.getData().toString('utf8'))).join('\n')
  } catch (err) {
    console.error('EPUB extraction error:', err)
    return ''
  }
}

function stripHTML(html: string): string {
  // 1. Remove <script> and <style> blocks entirely
  let text = html
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')

  // 2. Convert structural headings to markdown headings (preserved after tag stripping)
  text = text
    .replace(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi, '\n\n# $1\n\n')
    .replace(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi, '\n\n## $1\n\n')
    .replace(/<h3\b[^>]*>([\s\S]*?)<\/h3>/gi, '\n\n### $1\n\n')
    .replace(/<h4\b[^>]*>([\s\S]*?)<\/h4>/gi, '\n\n#### $1\n\n')
    .replace(/<h5\b[^>]*>([\s\S]*?)<\/h5>/gi, '\n\n##### $1\n\n')
    .replace(/<h6\b[^>]*>([\s\S]*?)<\/h6>/gi, '\n\n###### $1\n\n')

  // 3. Convert paragraphs
  text = text.replace(/<p\b[^>]*>([\s\S]*?)<\/p>/gi, '$1\n\n')

  // 4. Strip all remaining HTML tags
  text = text.replace(/<[^>]+>/g, ' ')

  // 5. Decode common HTML entities
  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&mdash;/g, '--')
    .replace(/&ndash;/g, '-')
    .replace(/&hellip;/g, '...')
    .replace(/&[a-z]+;/gi, '')   // catch-all for any remaining entities

  // 6. Clean whitespace
  text = text
    .replace(/[^\S\n]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return text
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
    const { uploadId: sessionId, uploadToken } = issueUploadIdentity()

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const fileExtension = file.name.split('.').pop()?.toLowerCase()
    if (!fileExtension || !['txt', 'docx', 'epub'].includes(fileExtension)) {
      return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 })
    }
    const sourceFormat = fileExtension as SourceFormat
    const binary = Buffer.from(await file.arrayBuffer())
    if (!binary.length || binary.length > 50 * 1024 * 1024) {
      return NextResponse.json({ error: 'File must be between 1 byte and 50 MB' }, { status: 400 })
    }
    if (HARDENED_V1_ENABLED) {
      try {
        assertSupportedSourcePackage(sourceFormat, binary)
      } catch {
        return NextResponse.json({ error: 'Uploaded document package is malformed' }, { status: 400 })
      }
    }
    const storagePath = sourceStoragePath(sessionId, fileExtension)
    let textContent = ''
    let wordCount = 0

    if (fileExtension === 'txt') {
      textContent = binary.toString('utf8')
      wordCount = countWords(textContent)

    } else if (fileExtension === 'docx') {
      const result = await mammoth.extractRawText({ buffer: binary as any })
      textContent = result.value
      wordCount = countWords(textContent)

    } else if (fileExtension === 'epub') {
      // Extract real text and count words
      textContent = extractEpubText(binary)
      wordCount = textContent ? countWords(textContent) : Math.round(file.size / 6)

      // If extraction produced nothing useful, fall back to size estimate
      if (wordCount < 100) {
        wordCount = Math.round(file.size / 6)
        textContent = `[EPUB file uploaded - ${file.name}]`
      }

    }

    const contentType = fileExtension === 'epub'
      ? 'application/epub+zip'
      : fileExtension === 'docx'
        ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        : 'text/plain'
    const sourceBucket = HARDENED_V1_ENABLED ? HARDENED_SOURCE_BUCKET : SOURCE_UPLOAD_BUCKET
    const { error: uploadError } = await getSupabaseAdmin().storage
      .from(sourceBucket)
      .upload(storagePath, binary, { contentType, upsert: false })
    if (uploadError) throw new Error(`Original binary storage failed: ${uploadError.message}`)

    const sourceManifest = buildSourceManifest({
      binary,
      extractedText: textContent,
      format: sourceFormat,
      filename: file.name,
      wordCount,
    })

    // Store in temp_uploads for the checkout flow
    const tempRow: any = HARDENED_V1_ENABLED ? {
      session_id: sessionId,
      file_name: file.name,
      file_format: `.${fileExtension}`,
      content: textContent,
      word_count: wordCount,
      source_storage_path: storagePath,
      source_storage_bucket: sourceBucket,
      source_sha256: sourceManifest.sourceHash,
      source_size_bytes: binary.length,
      source_manifest: sourceManifest,
      created_at: new Date().toISOString(),
    } : {
      session_id: sessionId,
      file_name: file.name,
      file_format: `.${fileExtension}`,
      content: textContent,
      word_count: wordCount,
      created_at: new Date().toISOString(),
    }
    const { error: contentError } = await getSupabaseAdmin()
      .from('temp_uploads')
      .upsert(tempRow)

    if (contentError) {
      console.error('Content storage error:', contentError)
      await getSupabaseAdmin().storage.from(sourceBucket).remove([storagePath])
      return NextResponse.json({ error: 'Upload metadata could not be saved' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      wordCount,
      fileName: file.name,
      fileFormat: `.${fileExtension}`,
      sourceHash: sourceManifest.sourceHash,
      sourceManifest,
      sessionId,
      uploadToken,
      pipelineVersion: HARDENED_V1_ENABLED ? 'hardened-v1' : 'legacy-v1',
    })

  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
