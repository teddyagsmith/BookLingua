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

function processOutput(value: unknown): string {
  if (typeof value === 'string') return value
  if (Buffer.isBuffer(value)) return value.toString('utf-8')
  return ''
}

export function isEpubCheckRuntimeUnavailable(error: { code?: unknown; status?: unknown; stdout?: unknown; stderr?: unknown; message?: unknown }): boolean {
  // A shell reports a missing command as exit status 127 and writes the
  // diagnostic to stderr.  execSync does not expose this as ENOENT because it
  // successfully launched the shell first.
  const output = [processOutput(error.stdout), processOutput(error.stderr), processOutput(error.message)].filter(Boolean).join('\n')
  return error.code === 'ENOENT' || error.status === 127
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
      output = [processOutput(e.stdout), processOutput(e.stderr), processOutput(e.message)].filter(Boolean).join('\n')
      // Only infrastructure absence is deferrable.  A non-zero EPUBCheck
      // result remains a real validation failure and must fail closed.
      unavailable = isEpubCheckRuntimeUnavailable(e)
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
