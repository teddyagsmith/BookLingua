import AdmZip from 'adm-zip'
import path from 'path'

export const ARTIFACT_VALIDATOR_VERSION = '1.3'
export type ArtifactKind = 'epub' | 'docx'
export interface ArtifactValidationIssue { code: string; message: string; location?: string }
export interface ArtifactValidationResult {
  validatorVersion: typeof ARTIFACT_VALIDATOR_VERSION
  kind: ArtifactKind
  passed: boolean
  errors: ArtifactValidationIssue[]
  warnings: ArtifactValidationIssue[]
  metrics: { contentFiles: number; headings: string[]; navigationHeadings: string[]; chapterNumbers: string[]; textCharacters: number }
}

const INTERNAL_MARKER = /===SEGMENT(?:_|:|===)|===TRANSLATION_NOTES===|###CHAPTER:|###H[1-6]:/i
const VISIBLE_MARKDOWN_HEADING = /(?:^|\n)\s*#{1,6}\s+\S/m
const CHAPTER_NUMBER = /\b(?:chapter|chapitre|cap[ií]tulo|kapitel|capitolo)\s+([0-9]+|[ivxlcdm]+)\b/gi

function decodeXml(value: string): string {
  return value.replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&apos;/gi, "'")
}

function textFromMarkup(xml: string): string {
  return decodeXml(xml.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?\s*>/gi, '\n').replace(/<\/p>|<\/div>|<\/li>|<\/h[1-6]>/gi, '\n').replace(/<[^>]+>/g, ' '))
    .replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{2,}/g, '\n').trim()
}

function compactTextFromMarkup(xml: string): string {
  return decodeXml(xml.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')).replace(/\r/g, '')
}

function attrs(tag: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const match of Array.from(tag.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/g))) result[match[1]] = decodeXml(match[3])
  return result
}

function safeZipPath(base: string, href: string): string | null {
  const decoded = decodeURIComponent(href.split('#')[0])
  const normalized = path.posix.normalize(path.posix.join(base, decoded))
  return normalized.startsWith('../') || path.posix.isAbsolute(normalized) ? null : normalized
}

function romanToNumber(value: string): number | null {
  if (/^\d+$/.test(value)) return Number(value)
  const map: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 }
  let total = 0
  const upper = value.toUpperCase()
  for (let i = 0; i < upper.length; i++) total += (map[upper[i]] || 0) < (map[upper[i + 1]] || 0) ? -(map[upper[i]] || 0) : (map[upper[i]] || 0)
  return total || null
}

function chapterNumbers(headings: string[]): string[] {
  return headings.flatMap(heading => Array.from(heading.matchAll(CHAPTER_NUMBER)).map(match => String(romanToNumber(match[1]) ?? match[1].toUpperCase())))
}

function duplicateSubstantialParagraphs(paragraphs: string[]): string[] {
  const normalized = paragraphs.map(p => p.toLowerCase().replace(/[^a-z0-9À-ž\s]/gi, '').replace(/\s+/g, ' ').trim()).filter(p => p.length >= 120)
  const duplicates: string[] = []
  for (let i = 0; i < normalized.length; i++) for (let j = i + 1; j < normalized.length; j++) {
    const a = new Set(normalized[i].split(' ')); const b = new Set(normalized[j].split(' '))
    const overlap = Array.from(a).filter(word => b.has(word)).length / Math.max(a.size, b.size)
    const lengthRatio = Math.min(normalized[i].length, normalized[j].length) / Math.max(normalized[i].length, normalized[j].length)
    if (overlap >= 0.94 && lengthRatio >= 0.9) duplicates.push(normalized[i].slice(0, 80))
  }
  return Array.from(new Set(duplicates))
}

function htmlBlocks(xml: string): { headings: string[]; paragraphs: string[]; text: string } {
  const headings = Array.from(xml.matchAll(/<(?:[\w.-]+:)?h[1-6]\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?h[1-6]>/gi)).map(m => textFromMarkup(m[1])).filter(Boolean)
  const paragraphs = Array.from(xml.matchAll(/<(?:[\w.-]+:)?(?:p|li)\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?(?:p|li)>/gi)).map(m => textFromMarkup(m[1])).filter(Boolean)
  return { headings, paragraphs, text: textFromMarkup(xml) }
}

function navigationLabels(xml: string): string[] {
  const anchors = Array.from(xml.matchAll(/<(?:[\w.-]+:)?a\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?a>/gi)).map(m => textFromMarkup(m[1])).filter(Boolean)
  const ncx = Array.from(xml.matchAll(/<(?:[\w.-]+:)?navLabel\b[^>]*>[\s\S]*?<(?:[\w.-]+:)?text\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?text>[\s\S]*?<\/(?:[\w.-]+:)?navLabel>/gi)).map(m => textFromMarkup(m[1])).filter(Boolean)
  return anchors.length ? anchors : ncx
}

function docxParagraphs(xml: string): Array<{ text: string; style: string }> {
  return Array.from(xml.matchAll(/<(?:[\w.-]+:)?p\b[\s\S]*?<\/(?:[\w.-]+:)?p>/gi)).map(match => {
    const styleTag = match[0].match(/<(?:[\w.-]+:)?pStyle\b[^>]*\/?\s*>/i)?.[0] || ''
    const styleAttrs = attrs(styleTag)
    const text = Array.from(match[0].matchAll(/<(?:[\w.-]+:)?t\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?t>/gi)).map(item => decodeXml(item[1])).join('')
    return { text: text.trim(), style: styleAttrs['w:val'] || styleAttrs.val || '' }
  }).filter(p => p.text)
}

export function validateArtifact(buffer: Buffer, kind: ArtifactKind, options: { semanticDuplicateParityValidated?: boolean; semanticHeadingDuplicateParityValidated?: boolean } = {}): ArtifactValidationResult {
  const errors: ArtifactValidationIssue[] = []; const warnings: ArtifactValidationIssue[] = []
  const headings: string[] = []; const navigationHeadings: string[] = []; const paragraphs: string[] = []; const allText: string[] = []
  let contentFiles = 0
  if (!buffer.length) errors.push({ code: 'EMPTY_FILE', message: 'Artifact is empty' })
  try {
    if (!errors.length) {
      const zip = new AdmZip(buffer); const zipEntries = zip.getEntries(); const entries = new Map(zipEntries.map(entry => [entry.entryName, entry]))
      if (kind === 'epub') {
        if (entries.get('mimetype')?.getData().toString('utf8').trim() !== 'application/epub+zip') errors.push({ code: 'EPUB_MIMETYPE', message: 'EPUB mimetype is missing or invalid' })
        const container = entries.get('META-INF/container.xml')?.getData().toString('utf8')
        const rootTag = container?.match(/<(?:[\w.-]+:)?rootfile\b[^>]*\/?\s*>/i)?.[0]
        const opfPath = rootTag ? attrs(rootTag)['full-path'] : undefined
        if (!container || !opfPath || !entries.has(opfPath)) errors.push({ code: 'EPUB_CONTAINER', message: 'EPUB container/OPF is missing or invalid' })
        else {
          const opf = entries.get(opfPath)!.getData().toString('utf8'); const base = path.posix.dirname(opfPath) === '.' ? '' : path.posix.dirname(opfPath)
          const manifest = new Map<string, { href: string; properties: string; mediaType: string }>()
          for (const tag of opf.match(/<(?:[\w.-]+:)?item\b[^>]*\/?\s*>/gi) || []) { const a = attrs(tag); if (a.id && a.href) manifest.set(a.id, { href: a.href, properties: a.properties || '', mediaType: a['media-type'] || '' }) }
          const spine = (opf.match(/<(?:[\w.-]+:)?itemref\b[^>]*\/?\s*>/gi) || []).map(tag => attrs(tag).idref).filter(Boolean)
          if (!spine.length) errors.push({ code: 'EPUB_SPINE', message: 'EPUB spine is missing or empty' })
          for (const id of spine) {
            const item = manifest.get(id); const entryPath = item && safeZipPath(base, item.href)
            const entry = entryPath ? entries.get(entryPath) : undefined
            if (!item || !entry || !/xhtml|html/.test(item.mediaType)) { errors.push({ code: 'EPUB_SPINE_ITEM', message: `Unreadable spine item: ${id}` }); continue }
            const blocks = htmlBlocks(entry.getData().toString('utf8')); contentFiles++; headings.push(...blocks.headings); paragraphs.push(...blocks.paragraphs); allText.push(blocks.text)
            if (!blocks.text) errors.push({ code: 'EMPTY_CONTENT', message: 'Spine content document is empty', location: entryPath! })
            if (chapterNumbers(blocks.headings).length && blocks.paragraphs.join(' ').trim().length < 2) errors.push({ code: 'EMPTY_CHAPTER', message: 'Chapter has no body content', location: entryPath! })
            const compact = compactTextFromMarkup(entry.getData().toString('utf8'))
            if (INTERNAL_MARKER.test(compact)) errors.push({ code: 'LEAKED_MARKER', message: 'Internal pipeline marker is visible', location: entryPath! })
            if (VISIBLE_MARKDOWN_HEADING.test(compact)) errors.push({ code: 'VISIBLE_MARKDOWN', message: 'Markdown heading syntax is visible', location: entryPath! })
          }
          const navSequences: string[][] = []
          for (const item of Array.from(manifest.values())) if (/\bnav\b/.test(item.properties)) { const p = safeZipPath(base, item.href); const e = p && entries.get(p); if (!e) errors.push({ code: 'EPUB_NAV', message: 'Declared navigation document is missing' }); else { const xml = e.getData().toString('utf8'); navigationHeadings.push(...navigationLabels(xml)); navSequences.push(chapterNumbers(navigationLabels(xml))) } }
          const ncx = Array.from(manifest.values()).find(item => /ncx/i.test(item.mediaType)); if (ncx) { const p = safeZipPath(base, ncx.href); const e = p && entries.get(p); if (!e) errors.push({ code: 'EPUB_NCX', message: 'Declared NCX navigation document is missing' }); else { const labels = navigationLabels(e.getData().toString('utf8')); navigationHeadings.push(...labels); navSequences.push(chapterNumbers(labels)) } }
          const contentSequence = chapterNumbers(headings)
          for (const sequence of navSequences) if (sequence.length && sequence.join('|') !== contentSequence.join('|')) errors.push({ code: 'EPUB_NAV_MISMATCH', message: `Navigation chapter sequence [${sequence.join(', ')}] does not match content [${contentSequence.join(', ')}]` })
        }
      } else {
        const contentTypes = entries.get('[Content_Types].xml')?.getData().toString('utf8')
        if (!contentTypes || !/PartName=["']\/word\/document\.xml["']/i.test(contentTypes)) errors.push({ code: 'DOCX_CONTENT_TYPES', message: 'DOCX main document content type is missing' })
        const rootRels = entries.get('_rels/.rels')?.getData().toString('utf8')
        if (!rootRels || !/Type=["'][^"']*officeDocument["']/i.test(rootRels) || !/Target=["']\/?word\/document\.xml["']/i.test(rootRels) || !entries.has('word/_rels/document.xml.rels')) errors.push({ code: 'DOCX_RELATIONSHIPS', message: 'DOCX main document relationships are missing or invalid' })
        const document = entries.get('word/document.xml')
        if (!document) errors.push({ code: 'DOCX_DOCUMENT_MISSING', message: 'DOCX word/document.xml is missing' })
        else {
          const ps = docxParagraphs(document.getData().toString('utf8')); contentFiles = 1; paragraphs.push(...ps.map(p => p.text)); allText.push(ps.map(p => p.text).join('\n'))
          for (const p of ps) if (/^heading[1-6]$/i.test(p.style)) headings.push(p.text)
          const chapterIndexes = ps.map((p, i) => /^heading1$/i.test(p.style) && chapterNumbers([p.text]).length ? i : -1).filter(i => i >= 0)
          for (let i = 0; i < chapterIndexes.length; i++) { const start = chapterIndexes[i] + 1; const end = chapterIndexes[i + 1] ?? ps.length; if (!ps.slice(start, end).some(p => !/^heading[1-6]$/i.test(p.style) && p.text.trim())) errors.push({ code: 'EMPTY_CHAPTER', message: `Chapter has no body content: ${ps[chapterIndexes[i]].text}` }) }
        }
      }
    }
  } catch { errors.push({ code: 'CORRUPT_PACKAGE', message: `${kind.toUpperCase()} is not a readable package` }) }

  const joined = allText.join('\n')
  if (INTERNAL_MARKER.test(joined)) errors.push({ code: 'LEAKED_MARKER', message: 'Internal pipeline marker is visible' })
  if (VISIBLE_MARKDOWN_HEADING.test(joined)) errors.push({ code: 'VISIBLE_MARKDOWN', message: 'Markdown heading syntax is visible' })
  const normalizedHeadings = headings.map(h => h.toLowerCase().replace(/\s+/g, ' ').trim())
  const duplicateHeading = normalizedHeadings.find((h, i) => normalizedHeadings.indexOf(h) !== i)
  if (duplicateHeading && !options.semanticHeadingDuplicateParityValidated) errors.push({ code: 'DUPLICATE_HEADING', message: `Duplicate major heading: ${duplicateHeading}` })
  const numbers = chapterNumbers(headings); const duplicateNumber = numbers.find((n, i) => numbers.indexOf(n) !== i)
  if (duplicateNumber) errors.push({ code: 'DUPLICATE_CHAPTER_NUMBER', message: `Duplicate chapter number: ${duplicateNumber}` })
  if (!options.semanticDuplicateParityValidated) {
    const duplicateContent = duplicateSubstantialParagraphs(paragraphs)[0]
    if (duplicateContent) errors.push({ code: 'DUPLICATE_CONTENT', message: `Substantial duplicate content detected: ${duplicateContent}…` })
  }
  return { validatorVersion: ARTIFACT_VALIDATOR_VERSION, kind, passed: !errors.length, errors, warnings, metrics: { contentFiles, headings, navigationHeadings, chapterNumbers: numbers, textCharacters: joined.length } }
}

export function validateExpectedChapterSequence(result: ArtifactValidationResult, expectedNumbers: string[]): ArtifactValidationResult {
  const expected = expectedNumbers.map(value => String(romanToNumber(value) ?? value.toUpperCase()))
  if (result.metrics.chapterNumbers.join('|') === expected.join('|')) return result
  return { ...result, passed: false, errors: [...result.errors, { code: 'CHAPTER_SEQUENCE_MISMATCH', message: `Expected chapters [${expectedNumbers.join(', ')}], found [${result.metrics.chapterNumbers.join(', ')}]` }] }
}
