import { createHash } from 'crypto'

export const SOURCE_MANIFEST_SCHEMA_VERSION = '1.0'

export type SourceFormat = 'epub' | 'docx' | 'txt'
export type ParserStatus = 'reliable' | 'needs_review' | 'limited'

export interface SourceManifestHeading {
  index: number
  level: number
  title: string
}

export interface SourceManifestV1 {
  schemaVersion: typeof SOURCE_MANIFEST_SCHEMA_VERSION
  sourceHash: string
  sourceFormat: SourceFormat
  sourceFilename: string
  wordCount: number
  blockCount: number
  headings: SourceManifestHeading[]
  chapterCount: number
  parserStatus: ParserStatus
  parserConfidence: number
  generatedAt: string
}

export function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}

export function buildSourceManifest(input: {
  binary: Buffer
  extractedText: string
  format: SourceFormat
  filename: string
  wordCount: number
  generatedAt?: string
}): SourceManifestV1 {
  const blocks = input.extractedText
    .split(/\n\s*\n/)
    .map(block => block.trim())
    .filter(Boolean)

  const headings = blocks.flatMap((block, index) => {
    const match = block.match(/^(#{1,6})\s+(.+)$/)
    return match ? [{ index, level: match[1].length, title: match[2].trim() }] : []
  })

  const chapterCount = headings.filter(heading => heading.level === 1).length
  const hasStructuredHeadings = headings.length > 0
  const parserStatus: ParserStatus = input.format === 'txt'
    ? 'limited'
    : hasStructuredHeadings ? 'reliable' : 'needs_review'
  const parserConfidence = input.format === 'txt'
    ? (hasStructuredHeadings ? 0.6 : 0.35)
    : (hasStructuredHeadings ? 0.85 : 0.5)

  return {
    schemaVersion: SOURCE_MANIFEST_SCHEMA_VERSION,
    sourceHash: sha256(input.binary),
    sourceFormat: input.format,
    sourceFilename: input.filename,
    wordCount: input.wordCount,
    blockCount: blocks.length,
    headings,
    chapterCount,
    parserStatus,
    parserConfidence,
    generatedAt: input.generatedAt || new Date().toISOString(),
  }
}
