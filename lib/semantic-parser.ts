import AdmZip from 'adm-zip'
import { extractDocxSegments, extractTxtSegments, Segment } from './extract-segments'
import { SemanticDocumentV2, SemanticNodeV2, extractSourceChapterNumber } from './semantic-document'
import { buildHeadingModel, headingLevelFor, HeadingModel, parseClassStyles, structuralConfidence } from './epub-structure'
import path from 'path'

function attributes(tag: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const match of Array.from(tag.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/g))) result[match[1]] = match[3]
  return result
}

function safeRelative(base: string, href: string): string {
  const decoded = decodeURIComponent(href.split('#')[0]).replace(/\\/g, '/')
  const resolved = path.posix.normalize(path.posix.join(base, decoded))
  if (resolved.startsWith('../') || path.posix.isAbsolute(resolved)) throw new Error('EPUB manifest path escapes package root')
  return resolved
}

function nodesFromSegments(input: {
  segments: Segment[]
  sourceHash: string
  sourceFormat: SemanticDocumentV2['sourceFormat']
  parserConfidence: number
  locations?: string[]
}): SemanticDocumentV2 {
  let chapterIndex = 0
  let currentChapterId: string | null = null
  const nodes: SemanticNodeV2[] = input.segments.map((segment, order) => {
    if (segment.type === 'heading' && segment.level === 1) {
      chapterIndex += 1
      currentChapterId = `chapter-${String(chapterIndex).padStart(4, '0')}`
    }
    return {
      id: `node-${String(order + 1).padStart(6, '0')}`,
      chapterId: currentChapterId,
      type: segment.type === 'listitem' ? 'list_item' : segment.type === 'blockquote' ? 'paragraph' : segment.type,
      headingLevel: segment.type === 'heading' ? segment.level : null,
      sourceChapterNumber: segment.type === 'heading' && segment.level === 1 ? extractSourceChapterNumber(segment.text) : null,
      sourceText: segment.text,
      translatedText: null,
      order,
      sourceLocation: input.locations?.[order] || `${input.sourceFormat}:block:${order}`,
    }
  })
  return {
    schemaVersion: '2.0',
    sourceHash: input.sourceHash,
    sourceFormat: input.sourceFormat,
    parserConfidence: input.parserConfidence,
    nodes,
  }
}

const BLOCK_PATTERN = /<(h[1-6]|p|li)\b([^>]*)>([\s\S]*?)<\/\1>/gi

/** Class names used by block elements, for building the heading model. */
export function collectBlockClasses(html: string): Map<string, number> {
  const counts = new Map<string, number>()
  for (const match of Array.from(html.matchAll(BLOCK_PATTERN))) {
    const className = attributes(`<x${match[2]}>`).class
    if (!className) continue
    for (const name of className.split(/\s+/)) {
      const key = name.toLowerCase()
      if (key) counts.set(key, (counts.get(key) || 0) + 1)
    }
  }
  return counts
}

/**
 * Flatten one block's inner HTML to text.
 *
 * Inline elements carry no whitespace in HTML, so stripping every tag to a space
 * inserts spurious gaps: "believed<span>1</span>." becomes "believed 1 ." and an
 * inline span inside a word splits it. Only block-level boundaries imply a space.
 */
export function blockText(inner: string): string {
  return inner
    .replace(/<\/?(?:br|div|p|li|tr|td|th|h[1-6]|blockquote|section|article|figure)\b[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function htmlToSegments(html: string, startId: number, model?: HeadingModel): Segment[] {
  const blocks: Segment[] = []
  let match: RegExpExecArray | null
  let id = startId
  BLOCK_PATTERN.lastIndex = 0
  while ((match = BLOCK_PATTERN.exec(html)) !== null) {
    const tag = match[1].toLowerCase()
    const className = attributes(`<x${match[2]}>`).class
    const text = blockText(match[3])
    if (!text) continue
    const level = model
      ? headingLevelFor(tag, className, text, model)
      : tag.startsWith('h') ? Math.min(3, Number(tag.slice(1))) : 0
    blocks.push({
      id: id++,
      type: level ? 'heading' : tag === 'li' ? 'listitem' : 'paragraph',
      level,
      text,
      styleName: className,
    })
  }
  return blocks
}

/** Chapter-level entries the book itself advertises, used to sanity-check detection. */
function countNavEntries(entries: Array<{ entryName: string; getData(): Buffer }>): number {
  const nav = entries.find(entry => /toc\.ncx$/i.test(entry.entryName) || /nav\.xhtml$/i.test(entry.entryName) || /toc\.xhtml$/i.test(entry.entryName))
  if (!nav) return 0
  const text = nav.getData().toString('utf8')
  const navPoints = (text.match(/<navPoint\b/gi) || []).length
  if (navPoints) return navPoints
  return (text.match(/<a\b[^>]*href=/gi) || []).length
}

export function parseSemanticEpub(buffer: Buffer, sourceHash: string): SemanticDocumentV2 {
  const zip = new AdmZip(buffer)
  const entries = zip.getEntries()
  const container = entries.find(entry => entry.entryName === 'META-INF/container.xml')
  const rootfile = container?.getData().toString('utf8').match(/<rootfile\b[^>]*>/i)?.[0]
  const opfPath = rootfile ? attributes(rootfile)['full-path'] : undefined
  if (!opfPath) throw new Error('EPUB OPF path missing')
  const opf = entries.find(entry => entry.entryName === opfPath)?.getData().toString('utf8')
  if (!opf) throw new Error('EPUB OPF missing')
  const opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : ''
  const manifest = new Map<string, string>()
  for (const match of Array.from(opf.matchAll(/<item\b[^>]*>/gi))) {
    const item = attributes(match[0]); if (item.id && item.href) manifest.set(item.id, item.href)
  }
  const spine = Array.from(opf.matchAll(/<itemref\b[^>]*>/gi)).map(match => attributes(match[0]).idref).filter(Boolean)
  if (!spine.length) throw new Error('EPUB spine missing')

  // Most books mark headings with styled paragraphs rather than <h> tags, so the
  // heading model is derived from the book's own classes and stylesheets first.
  const documents: Array<{ contentPath: string; html: string }> = []
  for (const idref of spine) {
    const href = manifest.get(idref)
    if (!href) continue
    const contentPath = safeRelative(opfDir, href)
    const html = entries.find(entry => entry.entryName === contentPath)?.getData().toString('utf8')
    if (html) documents.push({ contentPath, html })
  }
  const css = entries
    .filter(entry => entry.entryName.toLowerCase().endsWith('.css'))
    .map(entry => entry.getData().toString('utf8'))
    .join('\n')
  const classCounts = new Map<string, number>()
  for (const item of documents) {
    for (const [name, count] of Array.from(collectBlockClasses(item.html))) {
      classCounts.set(name, (classCounts.get(name) || 0) + count)
    }
  }
  const model = buildHeadingModel(classCounts, parseClassStyles(css))

  const segments: Segment[] = []
  const locations: string[] = []
  for (const item of documents) {
    const parsed = htmlToSegments(item.html, segments.length, model)
    segments.push(...parsed)
    locations.push(...parsed.map((_, index) => `${item.contentPath}:block:${index}`))
  }
  if (!segments.length) throw new Error('EPUB spine contains no readable textual nodes')
  const navEntries = countNavEntries(entries)
  const headings = segments.filter(segment => segment.type === 'heading').length
  const parserConfidence = structuralConfidence({ blocks: segments.length, headings, candidateBlocks: model.candidateBlocks, navEntries })
  return nodesFromSegments({ segments, locations, sourceHash, sourceFormat: 'epub', parserConfidence })
}

export async function parseSemanticDocx(buffer: Buffer, sourceHash: string): Promise<SemanticDocumentV2> {
  const { segments, quality } = await extractDocxSegments(buffer)
  return nodesFromSegments({
    segments,
    sourceHash,
    sourceFormat: 'docx',
    parserConfidence: quality.status === 'clean' ? 0.9 : quality.status === 'needs_review' ? 0.65 : 0.3,
  })
}

export function parseSemanticTxt(text: string, sourceHash: string): SemanticDocumentV2 {
  const segments = extractTxtSegments(text)
  const headings = segments.filter(segment => segment.type === 'heading').length
  return nodesFromSegments({ segments, sourceHash, sourceFormat: 'txt', parserConfidence: headings ? 0.6 : 0.35 })
}
