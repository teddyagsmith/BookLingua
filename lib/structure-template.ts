/**
 * BookLingua Structure Template Generator
 * 
 * Run this when a source file is uploaded. It parses the EPUB/DOCX and stores
 * a structural template in Supabase that drives all downstream builders.
 * 
 * Usage: Call from upload handler or as a background job after file upload.
 */

import { createClient } from '@supabase/supabase-js'
import { execSync } from 'child_process'
import { writeFileSync, mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export interface ParagraphTemplate {
  index: number
  type: 'body' | 'dialogue' | 'scene_break'
  text: string        // Source text (English) — used as reference
  word_count: number
}

export interface ChapterTemplate {
  index: number
  heading: string
  heading_level: number
  source_file?: string
  paragraphs: ParagraphTemplate[]
  word_count: number
  para_count: number
}

export interface BookStructureTemplate {
  version: string
  source_format: 'epub' | 'docx' | 'txt'
  total_chapters: number
  total_paragraphs: number
  front_matter: ChapterTemplate[]
  chapters: ChapterTemplate[]
  back_matter: ChapterTemplate[]
}

/**
 * Generate and store a structural template for an order.
 * Call this immediately after the source file is uploaded to Supabase.
 */
export async function generateStructureTemplate(orderId: string): Promise<BookStructureTemplate | null> {
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // Fetch the original file
  const { data: file } = await supabase
    .from('files')
    .select('*')
    .eq('order_id', orderId)
    .eq('type', 'original')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!file) {
    console.error(`[Template] No original file found for order ${orderId}`)
    return null
  }

  // Determine format
  const format = (file.file_format || '.txt').toLowerCase()
  
  // For DOCX, extract binary; for EPUB, extract binary; for TXT, use content
  let sourcePath: string
  const tmpDir = mkdtempSync(join(tmpdir(), 'booklingua-template-'))

  try {
    if (format === '.epub' || format === '.docx') {
      // Files stored as JSON with binary field
      let binary: string
      try {
        const parsed = JSON.parse(file.content)
        binary = parsed.binary
      } catch {
        console.error(`[Template] Could not parse file content as JSON for order ${orderId}`)
        return null
      }

      const ext = format === '.epub' ? '.epub' : '.docx'
      sourcePath = join(tmpDir, `source${ext}`)
      writeFileSync(sourcePath, Buffer.from(binary, 'base64'))
    } else {
      // TXT file — we can't generate a rich template from plain text
      console.log(`[Template] Plain text upload — skipping rich template for order ${orderId}`)
      return null
    }

    // Run Python template generator
    const templatePath = join(tmpDir, 'template.json')
    const scriptPath = join(process.cwd(), 'scripts', 'booklingua_template.py')
    
    execSync(
      `python3 "${scriptPath}" "${sourcePath}" "${templatePath}"`,
      { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
    )

    const template: BookStructureTemplate = JSON.parse(readFileSync(templatePath, 'utf-8'))

    // Store in Supabase
    const { data, error } = await supabase
      .from('files')
      .insert({
        order_id: orderId,
        type: 'structure',
        language: 'en',
        content: JSON.stringify(template),
      })
      .select()

    if (error) {
      console.error(`[Template] Failed to store template:`, error)
      return null
    }

    console.log(`[Template] Generated and stored for order ${orderId}: ${template.total_chapters} chapters, ${template.total_paragraphs} paragraphs`)
    return template

  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
}

/**
 * Fetch the structural template for an order (if it exists).
 */
export async function getStructureTemplate(orderId: string): Promise<BookStructureTemplate | null> {
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  const { data: file } = await supabase
    .from('files')
    .select('content')
    .eq('order_id', orderId)
    .eq('type', 'structure')
    .eq('language', 'en')
    .maybeSingle()

  if (!file?.content) return null

  try {
    return JSON.parse(file.content)
  } catch {
    return null
  }
}
