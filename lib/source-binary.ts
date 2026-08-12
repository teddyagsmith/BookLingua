import { SupabaseClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'

export const SOURCE_UPLOAD_BUCKET = 'uploads'
export const HARDENED_SOURCE_BUCKET = 'booklingua-private-sources'

export function sourceStoragePath(sessionId: string, extension: string): string {
  const safeExtension = extension.toLowerCase().replace(/^\./, '')
  return `${sessionId}/original.${safeExtension}`
}

export async function downloadOriginalBinary(
  supabase: SupabaseClient,
  storagePath: string,
  expectedSha256?: string | null,
  bucket = SOURCE_UPLOAD_BUCKET,
): Promise<Buffer> {
  const { data, error } = await supabase.storage.from(bucket).download(storagePath)
  if (error || !data) throw new Error(`Unable to retrieve original source binary: ${error?.message || 'missing data'}`)
  const buffer = Buffer.from(await data.arrayBuffer())
  if (expectedSha256 && createHash('sha256').update(buffer).digest('hex') !== expectedSha256) {
    throw new Error('Stored source binary hash mismatch')
  }
  return buffer
}
