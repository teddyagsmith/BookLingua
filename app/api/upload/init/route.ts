import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { HARDENED_SOURCE_BUCKET, sourceStoragePath } from '@/lib/source-binary'
import { issueUploadIdentity } from '@/lib/upload-identity'

const MAX_SOURCE_BYTES = 50 * 1024 * 1024
const SUPPORTED = new Set(['txt', 'docx', 'epub'])

export async function POST(request: NextRequest) {
  try {
    const { fileName, fileSize } = await request.json()
    const extension = typeof fileName === 'string' ? fileName.split('.').pop()?.toLowerCase() : undefined
    if (!extension || !SUPPORTED.has(extension)) return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 })
    if (!Number.isSafeInteger(fileSize) || fileSize < 1 || fileSize > MAX_SOURCE_BYTES) {
      return NextResponse.json({ error: 'File must be between 1 byte and 50 MB' }, { status: 400 })
    }
    const { uploadId, uploadToken } = issueUploadIdentity()
    const storagePath = sourceStoragePath(uploadId, extension)
    const { data, error } = await getSupabaseAdmin().storage.from(HARDENED_SOURCE_BUCKET).createSignedUploadUrl(storagePath)
    if (error || !data?.token) throw new Error(`Signed source upload could not be created: ${error?.message || 'missing token'}`)
    return NextResponse.json({ uploadId, uploadToken, storageBucket: HARDENED_SOURCE_BUCKET, storagePath, signedUploadToken: data.token })
  } catch (error) {
    console.error('Upload init error:', error)
    return NextResponse.json({ error: 'Secure upload could not be started' }, { status: 500 })
  }
}
