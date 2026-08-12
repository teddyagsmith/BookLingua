import { SupabaseClient } from '@supabase/supabase-js'
import { prepareTranslationBriefRows } from './translation-brief'

interface TempUploadSource {
  session_id?: string | null
  content: string
  file_name?: string | null
  file_format?: string | null
  source_storage_path?: string | null
  source_storage_bucket?: string | null
  source_sha256?: string | null
  source_size_bytes?: number | null
  source_manifest?: unknown
  glossary_decisions?: unknown
  glossary_saved_at?: string | null
}

export async function linkSourceUploadToOrder(
  supabase: SupabaseClient,
  orderId: string,
  tempUpload: TempUploadSource,
  languages: string[],
): Promise<void> {
  if (tempUpload.source_manifest && tempUpload.source_storage_path && tempUpload.source_sha256) {
    if (!tempUpload.glossary_saved_at) throw new Error('Author translation choices were not approved')
    const manifest = tempUpload.source_manifest as { sourceHash?: string }
    if (!manifest.sourceHash || manifest.sourceHash !== tempUpload.source_sha256) throw new Error('Source manifest hash mismatch')
    const decisions = Array.isArray(tempUpload.glossary_decisions)
      ? tempUpload.glossary_decisions
      : typeof tempUpload.glossary_decisions === 'string'
        ? JSON.parse(tempUpload.glossary_decisions)
        : []
    const briefs = prepareTranslationBriefRows({
      languages,
      sourceManifestFingerprint: manifest.sourceHash,
      approvedAt: tempUpload.glossary_saved_at,
      decisions,
    })
    const { error } = await supabase.rpc('link_hardened_source_to_order', {
      p_order_id: orderId,
      p_session_id: tempUpload.session_id,
      p_briefs: briefs,
    })
    if (error) throw new Error(`Failed to atomically link source: ${error.message}`)
    return
  }

  // Compatibility path for uploads created before the hardening schema.
  const { error } = await supabase.from('files').insert({ order_id: orderId, type: 'original', language: 'en', content: tempUpload.content })
  if (error) throw new Error(`Failed to link legacy source: ${error.message}`)
}
