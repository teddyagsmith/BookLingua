/**
 * BookLingua File Storage Helper
 * 
 * All generated files must be stored in Supabase, not just locally.
 * This module provides utilities for uploading files to the Supabase files table.
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

/**
 * Upload a file buffer to Supabase storage and record in the files table.
 * 
 * @param orderId - The order ID
 * @param type - File type: 'original', 'translated', 'review', 'final_epub', 'launch_pack', etc.
 * @param language - Language code or 'en' for language-agnostic files
 * @param buffer - The file buffer
 * @param fileName - Original filename
 */
export async function uploadFileToSupabase(
  orderId: string,
  type: string,
  language: string,
  buffer: Buffer,
  fileName: string
): Promise<string | null> {
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  try {
    // Upload to Supabase Storage
    const storagePath = `${orderId}/${type}/${language}/${fileName}`
    const { data: storageData, error: storageError } = await supabase
      .storage
      .from('book-files')
      .upload(storagePath, buffer, {
        contentType: getContentType(fileName),
        upsert: true,
      })

    if (storageError) {
      console.error(`[Storage] Upload failed for ${type}/${language}:`, storageError)
      return null
    }

    // Get public URL
    const { data: { publicUrl } } = supabase
      .storage
      .from('book-files')
      .getPublicUrl(storagePath)

    // Record in files table
    const { data, error } = await supabase
      .from('files')
      .insert({
        order_id: orderId,
        type,
        language,
        content: JSON.stringify({
          file_name: fileName,
          storage_path: storagePath,
          public_url: publicUrl,
          size: buffer.length,
        }),
      })
      .select()

    if (error) {
      console.error(`[Storage] DB record failed for ${type}/${language}:`, error)
      return null
    }

    console.log(`[Storage] Uploaded ${type}/${language}: ${fileName} (${buffer.length} bytes)`)
    return storagePath
  } catch (e) {
    console.error(`[Storage] Unexpected error uploading ${type}/${language}:`, e)
    return null
  }
}

function getContentType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'epub': return 'application/epub+zip'
    case 'docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    case 'txt': return 'text/plain'
    case 'json': return 'application/json'
    default: return 'application/octet-stream'
  }
}
