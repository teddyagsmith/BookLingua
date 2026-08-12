export interface HardenedUploadRecord {
  session_id?: string | null
  file_format?: string | null
  word_count?: number | string | null
  source_storage_path?: string | null
  source_storage_bucket?: string | null
  source_sha256?: string | null
  source_size_bytes?: number | string | null
  source_manifest?: { sourceHash?: string } | null
  glossary_saved_at?: string | null
}

export function assertHardenedUploadReady(upload: HardenedUploadRecord | null, expectedSessionId: string): asserts upload is HardenedUploadRecord {
  if (!upload || upload.session_id !== expectedSessionId) throw new Error('Hardened source upload is missing')
  if (!['.epub', '.docx', '.txt'].includes(String(upload.file_format))) throw new Error('Hardened source format is unsupported')
  if (!upload.source_storage_path || upload.source_storage_bucket !== 'booklingua-private-sources') throw new Error('Hardened source storage identity is invalid')
  if (!/^[0-9a-f]{64}$/.test(String(upload.source_sha256)) || Number(upload.source_size_bytes) <= 0) throw new Error('Hardened source integrity metadata is invalid')
  if (!upload.source_manifest || upload.source_manifest.sourceHash !== upload.source_sha256) throw new Error('Hardened source manifest is not bound to the stored source')
  if (!upload.glossary_saved_at || Number.isNaN(Date.parse(upload.glossary_saved_at))) throw new Error('Hardened translation brief is not approved')
  if (!Number.isFinite(Number(upload.word_count)) || Number(upload.word_count) <= 0) throw new Error('Hardened source word count is invalid')
}
