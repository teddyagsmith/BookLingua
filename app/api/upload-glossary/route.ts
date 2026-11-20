import { NextRequest, NextResponse } from 'next/server'
import mammoth from 'mammoth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { verifyUploadIdentity } from '@/lib/upload-identity'

const MAX_GLOSSARY_BYTES = 2 * 1024 * 1024
const MAX_GLOSSARY_CHARACTERS = 100_000
const ACCEPTED_EXTENSIONS = new Set(['txt', 'csv', 'docx'])

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData()
    const sessionId = form.get('sessionId')
    const uploadToken = form.get('uploadToken')
    const file = form.get('file')
    if (typeof sessionId !== 'string' || typeof uploadToken !== 'string' || !(file instanceof File)) {
      return NextResponse.json({ error: 'A glossary file and upload session are required.' }, { status: 400 })
    }
    if (!verifyUploadIdentity(sessionId, uploadToken)) {
      return NextResponse.json({ error: 'Your upload session has expired. Please upload your manuscript again.' }, { status: 403 })
    }
    const extension = file.name.split('.').pop()?.toLowerCase()
    if (!extension || !ACCEPTED_EXTENSIONS.has(extension)) {
      return NextResponse.json({ error: 'Glossaries must be a TXT, CSV, or DOCX file.' }, { status: 400 })
    }
    if (!file.size || file.size > MAX_GLOSSARY_BYTES) {
      return NextResponse.json({ error: 'Glossary files must be smaller than 2 MB.' }, { status: 400 })
    }
    const buffer = Buffer.from(await file.arrayBuffer())
    const extracted = extension === 'docx'
      ? (await mammoth.extractRawText({ buffer: buffer as any })).value
      : buffer.toString('utf8')
    const text = extracted.replace(/\u0000/g, '').trim()
    if (!text) return NextResponse.json({ error: 'We could not find any text in that glossary.' }, { status: 400 })
    if (text.length > MAX_GLOSSARY_CHARACTERS) {
      return NextResponse.json({ error: 'Please keep the glossary under 100,000 characters.' }, { status: 400 })
    }
    const { error } = await getSupabaseAdmin().from('temp_uploads').update({
      author_glossary_text: text,
      author_glossary_filename: file.name.slice(0, 255),
    }).eq('session_id', sessionId)
    if (error) throw error
    return NextResponse.json({ success: true, fileName: file.name, characters: text.length })
  } catch (error) {
    console.error('[upload-glossary] Failed:', error)
    return NextResponse.json({ error: 'We could not attach that glossary. Please try again.' }, { status: 500 })
  }
}
