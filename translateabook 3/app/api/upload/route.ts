import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import mammoth from 'mammoth'

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

    // Extract text based on file type
    if (fileExtension === 'txt') {
      textContent = await file.text()
    } else if (fileExtension === 'docx') {
      const arrayBuffer = await file.arrayBuffer()
      const result = await mammoth.extractRawText({ Buffer: Buffer.from(arrayBuffer) })
      textContent = result.value
    } else if (fileExtension === 'epub') {
      // For EPUB, we'll store the raw file and process server-side
      // For now, estimate word count from file size
      const arrayBuffer = await file.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      
      // Store raw file in Supabase Storage
      const { error: uploadError } = await supabaseAdmin.storage
        .from('uploads')
        .upload(`${sessionId}/original.${fileExtension}`, buffer, {
          contentType: file.type,
          upsert: true,
        })

      if (uploadError) {
        console.error('Upload error:', uploadError)
      }

      // Rough estimate: 6 characters per word
      wordCount = Math.round(file.size / 6)
      textContent = `[EPUB file uploaded - ${file.name}]`
    } else if (fileExtension === 'pdf') {
      // Similar handling for PDF
      const arrayBuffer = await file.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      
      const { error: uploadError } = await supabaseAdmin.storage
        .from('uploads')
        .upload(`${sessionId}/original.${fileExtension}`, buffer, {
          contentType: file.type,
          upsert: true,
        })

      if (uploadError) {
        console.error('Upload error:', uploadError)
      }

      wordCount = Math.round(file.size / 6)
      textContent = `[PDF file uploaded - ${file.name}]`
    }

    // Calculate word count for text-based files
    if (fileExtension === 'txt' || fileExtension === 'docx') {
      wordCount = textContent.trim().split(/\s+/).filter(word => word.length > 0).length
    }

    // Store text content in temporary storage for checkout
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
