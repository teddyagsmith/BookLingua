import { SupabaseClient } from '@supabase/supabase-js'

export const SOURCE_UPLOAD_BUCKET = 'uploads'

export function sourceStoragePath(sessionId: string, extension: string): string {
  const safeExtension = extension.toLowerCase().replace(/^\./, '')
  return `${sessionId}/original.${safeExtension}`
}

export async function downloadOriginalBinary(
  supabase: SupabaseClient,
  storagePath: string,
): Promise<Buffer> {
  const { data, error } = await supabase.storage.from(SOURCE_UPLOAD_BUCKET).download(storagePath)
  if (error || !data) throw new Error(`Unable to retrieve original source binary: ${error?.message || 'missing data'}`)
  return Buffer.from(await data.arrayBuffer())
}
