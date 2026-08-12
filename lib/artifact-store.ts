import { createHash } from 'crypto'
import { SupabaseClient } from '@supabase/supabase-js'
import { ArtifactType, PackageArtifact } from './package-manifest'

export const ARTIFACT_BUCKET = 'book-files'

export async function storeImmutableArtifact(input: {
  supabase: SupabaseClient
  orderId: string
  language: string
  type: ArtifactType
  filename: string
  buffer: Buffer
  schemaVersion?: string
  validationStatus: PackageArtifact['validationStatus']
  validationReportId?: string
}): Promise<PackageArtifact> {
  const sha256 = createHash('sha256').update(input.buffer).digest('hex')
  const storagePath = `${input.orderId}/${input.language}/${input.type}/${sha256}/${input.filename}`
  const { error: storageError } = await input.supabase.storage.from(ARTIFACT_BUCKET).upload(storagePath, input.buffer, {
    upsert: false,
    contentType: input.filename.endsWith('.epub') ? 'application/epub+zip'
      : input.filename.endsWith('.docx') ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        : input.filename.endsWith('.csv') ? 'text/csv' : 'application/octet-stream',
  })
  if (storageError && !/already exists/i.test(storageError.message)) throw new Error(`Artifact upload failed: ${storageError.message}`)

  const { error: recordError } = await input.supabase.from('artifacts').upsert({
    order_id: input.orderId,
    language: input.language,
    artifact_type: input.type,
    storage_bucket: ARTIFACT_BUCKET,
    storage_path: storagePath,
    filename: input.filename,
    sha256,
    size_bytes: input.buffer.length,
    schema_version: input.schemaVersion || null,
    validation_report_id: input.validationReportId || null,
  }, { onConflict: 'order_id,language,artifact_type,sha256' })
  if (recordError) throw new Error(`Artifact metadata insert failed: ${recordError.message}`)

  return {
    type: input.type,
    required: true,
    filename: input.filename,
    storageBucket: ARTIFACT_BUCKET,
    storagePath,
    sha256,
    sizeBytes: input.buffer.length,
    schemaVersion: input.schemaVersion,
    validationStatus: input.validationStatus,
    validationReportId: input.validationReportId,
  }
}
