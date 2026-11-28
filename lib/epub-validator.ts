import { execSync, ExecSyncOptions } from 'child_process'
import { writeFileSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

export interface EpubCheckResult {
  valid: boolean
  /** The Vercel runtime does not include Java/EPUBCheck. This is not an EPUB failure. */
  unavailable: boolean
  output: string
  errors: string[]
  warnings: string[]
}

export function isEpubCheckRuntimeUnavailable(code: unknown, output: string): boolean {
  return code === 'ENOENT'
    || /(?:epubcheck|java).*(?:not found|not installed|not available)|could not be executed|no java runtime/i.test(output)
}

export function validateEpub(epubBuffer: Buffer): EpubCheckResult {
  const tmpDir = mkdtempSync(join(tmpdir(), 'booklingua-epub-'))
  try {
    const epubPath = join(tmpDir, 'book.epub')
    writeFileSync(epubPath, epubBuffer)

    let output = ''
    let commandFailed = false
    let unavailable = false
    try {
      output = execSync(
        `epubcheck "${epubPath}"`,
        { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 } as ExecSyncOptions
      ) as string
    } catch (e: any) {
      commandFailed = true
      // epubcheck exits with non-zero code when errors are found
      const stdout = e.stdout
      if (typeof stdout === 'string') {
        output = stdout
      } else if (Buffer.isBuffer(stdout)) {
        output = stdout.toString('utf-8')
      } else {
        output = e.message || ''
      }
      // Only infrastructure absence is deferrable.  A non-zero EPUBCheck
      // result remains a real validation failure and must fail closed.
      unavailable = isEpubCheckRuntimeUnavailable(e?.code, output)
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
    if(commandFailed&&!unavailable&&errors.length===0)errors.push(output.trim()||'EPUBCheck failed without a diagnostic')
    const valid = !commandFailed && errors.length === 0 && warnings.length === 0

    return { valid, unavailable, output, errors, warnings }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
}
