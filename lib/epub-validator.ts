import { execSync, ExecSyncOptions } from 'child_process'
import { writeFileSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

export interface EpubCheckResult {
  valid: boolean
  output: string
  errors: string[]
  warnings: string[]
}

export function validateEpub(epubBuffer: Buffer): EpubCheckResult {
  const tmpDir = mkdtempSync(join(tmpdir(), 'booklingua-epub-'))
  try {
    const epubPath = join(tmpDir, 'book.epub')
    writeFileSync(epubPath, epubBuffer)

    let output = ''
    try {
      output = execSync(
        `epubcheck "${epubPath}"`,
        { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 } as ExecSyncOptions
      )
    } catch (e: any) {
      // epubcheck exits with non-zero code when errors are found
      output = e.stdout || e.message || ''
    }

    const errors: string[] = []
    const warnings: string[] = []
    const lines = output.split('\n')

    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed.includes('ERROR') || trimmed.includes('FATAL')) {
        errors.push(trimmed)
      } else if (trimmed.includes('WARNING')) {
        warnings.push(trimmed)
      }
    }

    // epubcheck returns exit 0 if 0 fatals, 0 errors, 0 warnings
    // We consider it valid only if truly clean (no errors, no warnings)
    const valid = errors.length === 0 && warnings.length === 0

    return { valid, output, errors, warnings }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
}
