/**
 * Template-aware EPUB builder integration
 * 
 * This module wraps the Python template-based EPUB builder for use in the
 * Next.js download route. When a structure template exists for an order,
 * it uses the template to drive paragraph counts and chapter boundaries.
 */

import { execSync } from 'child_process'
import { writeFileSync, mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { BookStructureTemplate } from './structure-template'
import { detectArtifacts } from './artifact-gate'

export interface BuildEpubResult {
  buffer: Buffer
  valid: boolean
  errors: string[]
  warnings: string[]
}

/**
 * Build EPUB using the structural template.
 * This is the preferred path when a template exists.
 */
export function buildEpubFromTemplate(
  template: BookStructureTemplate,
  translatedText: string,
  title: string,
  author: string,
  lang: string
): BuildEpubResult {
  const tmpDir = mkdtempSync(join(tmpdir(), 'booklingua-epub-'))

  try {
    // Gate check: scan for artifacts
    const artifactCheck = detectArtifacts(translatedText)
    if (!artifactCheck.clean) {
      throw new Error(
        `Artifact gate failed: ${artifactCheck.violations.join(', ')}`
      )
    }

    // Write files
    const templatePath = join(tmpDir, 'template.json')
    const contentPath = join(tmpDir, 'content.txt')
    const outputPath = join(tmpDir, 'output.epub')

    writeFileSync(templatePath, JSON.stringify(template))
    writeFileSync(contentPath, translatedText)

    // Run Python builder
    const scriptPath = join(process.cwd(), 'scripts', 'build_epub_from_template.py')
    execSync(
      `python3 "${scriptPath}" ` +
      `--template "${templatePath}" ` +
      `--translated "${contentPath}" ` +
      `--output "${outputPath}" ` +
      `--title "${title.replace(/"/g, '\\"')}" ` +
      `--author "${author.replace(/"/g, '\\"')}" ` +
      `--lang "${lang}"`,
      { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
    )

    const buffer = readFileSync(outputPath)

    // Validate
    let validation
    try {
      const { validateEpub } = require('./epub-validator')
      validation = validateEpub(buffer)
    } catch {
      // Fallback: run epubcheck directly
      const result = execSync(`epubcheck "${outputPath}"`, { encoding: 'utf-8' })
      const valid = result.includes('0 fatals') && result.includes('0 errors')
      validation = { valid, errors: [], warnings: [] }
    }

    return {
      buffer,
      valid: validation.valid,
      errors: validation.errors || [],
      warnings: validation.warnings || [],
    }

  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
}
