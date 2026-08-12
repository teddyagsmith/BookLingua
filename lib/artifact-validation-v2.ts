import AdmZip from 'adm-zip'

export const ARTIFACT_VALIDATOR_VERSION = '1.0'

export type ArtifactKind = 'epub' | 'docx'

export interface ArtifactValidationIssue {
  code: string
  message: string
  location?: string
}

export interface ArtifactValidationResult {
  validatorVersion: typeof ARTIFACT_VALIDATOR_VERSION
  kind: ArtifactKind
  passed: boolean
  errors: ArtifactValidationIssue[]
  warnings: ArtifactValidationIssue[]
  metrics: {
    contentFiles: number
    headings: string[]
    chapterNumbers: string[]
    textCharacters: number
  }
}

const INTERNAL_MARKER = /===SEGMENT(?:_|:|===)|===TRANSLATION_NOTES===|###CHAPTER:|###H[1-6]:/i
const VISIBLE_MARKDOWN_HEADING = /(?:^|\n)\s*#{1,6}\s+\S/m
const CHAPTER_NUMBER = /\b(?:chapter|chapitre|cap[ií]tulo|kapitel|capitolo)\s+([0-9]+|[ivxlcdm]+)\b/gi

function visibleText(xml: string): string {
  return xml
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

function extractHeadings(xml: string, kind: ArtifactKind): string[] {
  if (kind === 'epub') {
    return Array.from(xml.matchAll(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/gi))
      .map(match => visibleText(match[1]).trim())
      .filter(Boolean)
  }
  return Array.from(xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/gi))
    .filter(match => /<w:pStyle\b[^>]*w:val="(?:Heading|heading)[1-6]"/i.test(match[0]))
    .map(match => Array.from(match[0].matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/gi)).map(item => item[1]).join(''))
    .filter(Boolean)
}

function duplicateSubstantialParagraphs(text: string): string[] {
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  for (const paragraph of text.split(/\n+/)) {
    const normalized = paragraph.toLowerCase().replace(/\s+/g, ' ').trim()
    if (normalized.length < 120) continue
    if (seen.has(normalized)) duplicates.add(normalized.slice(0, 80))
    seen.add(normalized)
  }
  return Array.from(duplicates)
}

export function validateArtifact(buffer: Buffer, kind: ArtifactKind): ArtifactValidationResult {
  const errors: ArtifactValidationIssue[] = []
  const warnings: ArtifactValidationIssue[] = []
  let contentFiles: Array<{ path: string; xml: string }> = []

  if (buffer.length === 0) errors.push({ code: 'EMPTY_FILE', message: 'Artifact is empty' })

  if (errors.length === 0) {
    try {
      const zip = new AdmZip(buffer)
      const entries = zip.getEntries()
      if (kind === 'epub') {
        const mimetype = entries.find(entry => entry.entryName === 'mimetype')?.getData().toString('utf8').trim()
        if (mimetype !== 'application/epub+zip') errors.push({ code: 'EPUB_MIMETYPE', message: 'EPUB mimetype is missing or invalid' })
        if (!entries.some(entry => entry.entryName === 'META-INF/container.xml')) errors.push({ code: 'EPUB_CONTAINER', message: 'EPUB container.xml is missing' })
        contentFiles = entries
          .filter(entry => /\.(xhtml|html)$/i.test(entry.entryName))
          .map(entry => ({ path: entry.entryName, xml: entry.getData().toString('utf8') }))
        if (!contentFiles.length) errors.push({ code: 'EPUB_NO_CONTENT', message: 'EPUB contains no XHTML/HTML content documents' })
      } else {
        const document = entries.find(entry => entry.entryName === 'word/document.xml')
        if (!document) errors.push({ code: 'DOCX_DOCUMENT_MISSING', message: 'DOCX word/document.xml is missing' })
        else contentFiles = [{ path: document.entryName, xml: document.getData().toString('utf8') }]
      }
    } catch {
      errors.push({ code: 'CORRUPT_PACKAGE', message: `${kind.toUpperCase()} is not a readable ZIP package` })
    }
  }

  const headings: string[] = []
  const allText: string[] = []
  for (const file of contentFiles) {
    const text = visibleText(file.xml)
    allText.push(text)
    headings.push(...extractHeadings(file.xml, kind))
    if (!text.trim()) errors.push({ code: 'EMPTY_CONTENT', message: 'Content document is empty', location: file.path })
    if (INTERNAL_MARKER.test(text)) errors.push({ code: 'LEAKED_MARKER', message: 'Internal pipeline marker is visible', location: file.path })
    if (VISIBLE_MARKDOWN_HEADING.test(text)) errors.push({ code: 'VISIBLE_MARKDOWN', message: 'Markdown heading syntax is visible', location: file.path })
  }

  const normalizedHeadings = headings.map(heading => heading.toLowerCase().replace(/\s+/g, ' ').trim())
  const duplicateHeadings = normalizedHeadings.filter((heading, index) => normalizedHeadings.indexOf(heading) !== index)
  if (duplicateHeadings.length) errors.push({ code: 'DUPLICATE_HEADING', message: `Duplicate major heading: ${duplicateHeadings[0]}` })

  const chapterNumbers = headings.flatMap(heading => Array.from(heading.matchAll(CHAPTER_NUMBER)).map(match => match[1].toUpperCase()))
  const duplicateNumbers = chapterNumbers.filter((number, index) => chapterNumbers.indexOf(number) !== index)
  if (duplicateNumbers.length) errors.push({ code: 'DUPLICATE_CHAPTER_NUMBER', message: `Duplicate chapter number: ${duplicateNumbers[0]}` })

  const joinedText = allText.join('\n')
  const duplicateParagraphs = duplicateSubstantialParagraphs(joinedText)
  if (duplicateParagraphs.length) errors.push({ code: 'DUPLICATE_CONTENT', message: `Substantial duplicate content detected: ${duplicateParagraphs[0]}…` })

  return {
    validatorVersion: ARTIFACT_VALIDATOR_VERSION,
    kind,
    passed: errors.length === 0,
    errors,
    warnings,
    metrics: { contentFiles: contentFiles.length, headings, chapterNumbers, textCharacters: joinedText.length },
  }
}

export function validateExpectedChapterSequence(
  result: ArtifactValidationResult,
  expectedNumbers: string[],
): ArtifactValidationResult {
  const actual = result.metrics.chapterNumbers
  if (actual.join('|') === expectedNumbers.map(value => value.toUpperCase()).join('|')) return result
  return {
    ...result,
    passed: false,
    errors: [...result.errors, {
      code: 'CHAPTER_SEQUENCE_MISMATCH',
      message: `Expected chapters [${expectedNumbers.join(', ')}], found [${actual.join(', ')}]`,
    }],
  }
}
