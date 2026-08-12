import { SupabaseClient } from '@supabase/supabase-js'

interface TempUploadSource {
  content: string
  file_name?: string | null
  file_format?: string | null
  source_storage_path?: string | null
  source_sha256?: string | null
  source_size_bytes?: number | null
  source_manifest?: unknown
}

export async function linkSourceUploadToOrder(
  supabase: SupabaseClient,
  orderId: string,
  tempUpload: TempUploadSource,
): Promise<void> {
  const metadata = {
    filename: tempUpload.file_name || null,
    format: tempUpload.file_format || null,
    sha256: tempUpload.source_sha256 || null,
    sizeBytes: tempUpload.source_size_bytes || null,
  }

  const { error: originalError } = await supabase.from('files').insert({
    order_id: orderId,
    type: 'original',
    language: 'en',
    content: tempUpload.content,
    file_url: tempUpload.source_storage_path || null,
    original_content: JSON.stringify(metadata),
  })
  if (originalError) throw new Error(`Failed to link original source: ${originalError.message}`)

  if (tempUpload.source_manifest) {
    const { error: manifestError } = await supabase.from('files').insert({
      order_id: orderId,
      type: 'source_manifest',
      language: 'en',
      content: JSON.stringify(tempUpload.source_manifest),
    })
    if (manifestError) throw new Error(`Failed to link source manifest: ${manifestError.message}`)
  }
}
