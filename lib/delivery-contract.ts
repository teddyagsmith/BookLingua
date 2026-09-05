import AdmZip from 'adm-zip'
import { createHash } from 'crypto'
import { ReaderRegister, readerRegisterViolations, languageHasReaderRegister } from './reader-register'

/**
 * The delivery contract.
 *
 * Every other check in this pipeline reads the pipeline's own records: the manifest it
 * wrote, the batches it cached, the upload call that returned success. Twice in one day
 * that produced a "delivered" report against files that said something else. This module
 * only ever reads the bytes a customer receives, and the object the storage provider is
 * actually serving afterwards.
 */

export interface DocxFacts {
  paragraphs: number
  /** Paragraph counts by named style, e.g. Title, Heading1, Heading2, Heading3. */
  styles: Record<string, number>
  italicRuns: number
  boldRuns: number
  superscriptRuns: number
  hasDefaultStyle: boolean
  text: string
}

const RUN = { italic: /<w:i\s*\/>/g, bold: /<w:b\s*\/>/g, superscript: /w:vertAlign w:val="superscript"/g }

/** Read a delivered DOCX the way a reader's word processor would: from its own bytes. */
export function inspectDeliveredDocx(buffer: Buffer): DocxFacts {
  const zip: any = new AdmZip(buffer)
  const documentEntry = zip.getEntry('word/document.xml')
  if (!documentEntry) throw new Error('Delivered DOCX has no word/document.xml')
  const document = documentEntry.getData().toString('utf8')
  const styles = zip.getEntry('word/styles.xml')?.getData().toString('utf8') || ''
  const byStyle: Record<string, number> = {}
  for (const match of Array.from(document.matchAll(/<w:pStyle w:val="([^"]+)"/g)) as RegExpMatchArray[]) {
    byStyle[match[1]] = (byStyle[match[1]] || 0) + 1
  }
  return {
    paragraphs: (document.match(/<w:p[ >]/g) || []).length,
    styles: byStyle,
    italicRuns: (document.match(RUN.italic) || []).length,
    boldRuns: (document.match(RUN.bold) || []).length,
    superscriptRuns: (document.match(RUN.superscript) || []).length,
    // Without a style flagged default, Pages renders every paragraph as the first style
    // it finds. LibreOffice guesses sanely, which is how this shipped unnoticed.
    hasDefaultStyle: /w:default="1"/.test(styles),
    text: (Array.from(document.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)) as RegExpMatchArray[]).map(match => match[1]).join(' '),
  }
}

export interface DeliveryExpectation {
  language: string
  readerRegister: ReaderRegister
  /** Required paragraph counts per style. Structure must survive translation unchanged. */
  styles: Record<string, number>
  /** Omitted when the writer adds layout paragraphs the node count cannot predict. */
  paragraphs?: number
  /** The delivered file can never hold fewer paragraphs than the document has nodes. */
  minimumParagraphs?: number
  emphasis: { italic: number; bold: number; superscript: number }
  /** Emphasis run counts vary slightly by language. Absence is the real failure. */
  emphasisTolerance?: number
}

const CORRUPTION = [
  { code: 'SPACED_PUNCTUATION', pattern: / [.,;:!?]/g, describe: 'space before punctuation' },
  { code: 'DOUBLE_SPACE', pattern: /\S {2,}\S/g, describe: 'collapsed whitespace missing' },
  { code: 'ASCII_APOSTROPHE', pattern: /[A-Za-zÀ-ÿ]'[A-Za-zÀ-ÿ]/g, describe: 'straight apostrophe between letters' },
]

export interface ContractFailure { code: string; detail: string }

/**
 * Assertions on the delivered file. A failure here fails the build; nothing in this list
 * is a warning, because every item on it has shipped to a customer at least once.
 */
export function checkDeliveredDocx(facts: DocxFacts, expectation: DeliveryExpectation): ContractFailure[] {
  const failures: ContractFailure[] = []
  if (!facts.hasDefaultStyle) {
    failures.push({ code: 'NO_DEFAULT_STYLE', detail: 'styles.xml declares no w:default="1" style, so Pages will render the whole document in one style' })
  }
  if (expectation.paragraphs !== undefined && facts.paragraphs !== expectation.paragraphs) {
    failures.push({ code: 'PARAGRAPH_COUNT', detail: `expected ${expectation.paragraphs} paragraphs, delivered ${facts.paragraphs}` })
  }
  if (expectation.minimumParagraphs !== undefined && facts.paragraphs < expectation.minimumParagraphs) {
    failures.push({ code: 'PARAGRAPH_LOSS', detail: `document has ${expectation.minimumParagraphs} nodes but only ${facts.paragraphs} paragraphs were delivered` })
  }
  for (const [style, expected] of Object.entries(expectation.styles)) {
    const actual = facts.styles[style] || 0
    if (actual !== expected) failures.push({ code: 'HEADING_COUNT', detail: `expected ${expected} ${style} paragraphs, delivered ${actual}` })
  }
  const tolerance = expectation.emphasisTolerance ?? 0.05
  for (const [kind, expected] of Object.entries(expectation.emphasis) as Array<[keyof DeliveryExpectation['emphasis'], number]>) {
    const actual = kind === 'italic' ? facts.italicRuns : kind === 'bold' ? facts.boldRuns : facts.superscriptRuns
    if (expected > 0 && actual === 0) {
      failures.push({ code: 'EMPHASIS_MISSING', detail: `expected about ${expected} ${kind} runs, delivered none` })
    } else if (expected > 0 && Math.abs(actual - expected) > Math.max(2, expected * tolerance)) {
      failures.push({ code: 'EMPHASIS_COUNT', detail: `expected about ${expected} ${kind} runs, delivered ${actual}` })
    }
  }
  for (const check of CORRUPTION) {
    const matches = facts.text.match(check.pattern)
    if (matches?.length) {
      failures.push({ code: check.code, detail: `${matches.length} instances of ${check.describe}, first at "${matches[0].trim()}"` })
    }
  }
  if (languageHasReaderRegister(expectation.language)) {
    const violations = readerRegisterViolations(facts.text, expectation.language, expectation.readerRegister)
    if (violations.length) {
      failures.push({
        code: 'READER_REGISTER',
        detail: `${violations.length} uses of the wrong form of address for a ${expectation.readerRegister} book, e.g. "${violations[0].excerpt}"`,
      })
    }
  }
  return failures
}

/**
 * Languages of one order must be the same book. A heading that exists in three languages
 * and not the fourth is a structural failure, not a translation choice.
 */
export function checkCrossLanguageParity(factsByLanguage: Record<string, DocxFacts>): ContractFailure[] {
  const languages = Object.keys(factsByLanguage)
  if (languages.length < 2) return []
  const failures: ContractFailure[] = []
  const [reference, ...rest] = languages
  const base = factsByLanguage[reference]
  for (const language of rest) {
    const other = factsByLanguage[language]
    if (other.paragraphs !== base.paragraphs) {
      failures.push({ code: 'PARITY_PARAGRAPHS', detail: `${language} has ${other.paragraphs} paragraphs against ${reference} with ${base.paragraphs}` })
    }
    for (const style of Array.from(new Set(Object.keys(base.styles).concat(Object.keys(other.styles))))) {
      if ((base.styles[style] || 0) !== (other.styles[style] || 0)) {
        failures.push({ code: 'PARITY_STYLES', detail: `${language} has ${other.styles[style] || 0} ${style} against ${reference} with ${base.styles[style] || 0}` })
      }
    }
  }
  return failures
}

export interface UploadedObject {
  fileId: string
  sizeBytes: number
  modifiedTime?: string
  checksum?: string
}

/**
 * Read-back after upload. The only evidence that counts is the object the provider hands
 * back when asked for it fresh by id: an upload call returning success proves nothing,
 * and a read-back that passes against a stale object is worse than no read-back at all.
 */
export function checkUploadedObject(sent: Buffer, served: UploadedObject, previous?: UploadedObject): ContractFailure[] {
  const failures: ContractFailure[] = []
  if (served.sizeBytes !== sent.length) {
    failures.push({ code: 'UPLOAD_SIZE', detail: `sent ${sent.length} bytes, provider is serving ${served.sizeBytes} for ${served.fileId}` })
  }
  const digest = createHash('sha256').update(sent).digest('hex')
  if (served.checksum && served.checksum !== digest) {
    failures.push({ code: 'UPLOAD_CHECKSUM', detail: `checksum mismatch for ${served.fileId}` })
  }
  if (previous && previous.fileId === served.fileId) {
    if (previous.sizeBytes === served.sizeBytes && previous.modifiedTime && previous.modifiedTime === served.modifiedTime) {
      failures.push({
        code: 'UPLOAD_NOT_APPLIED',
        detail: `${served.fileId} is unchanged since ${previous.modifiedTime}; the replacement did not reach storage`,
      })
    }
  }
  return failures
}

export function describeFailures(failures: ContractFailure[]): string {
  return failures.map(failure => `${failure.code}: ${failure.detail}`).join('; ')
}

/** Throwing form, for use at the delivery boundary. */
export function assertDeliveryContract(failures: ContractFailure[], context: string): void {
  if (failures.length) throw new Error(`Delivery contract failed for ${context} — ${describeFailures(failures)}`)
}
