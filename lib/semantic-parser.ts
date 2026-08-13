import AdmZip from 'adm-zip'
import { extractDocxSegments, extractTxtSegments, Segment } from './extract-segments'
import { SemanticDocumentV2, SemanticNodeV2, extractSourceChapterNumber } from './semantic-document'
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

function htmlToSegments(html: string, startId: number): Segment[] {
  const blocks: Segment[] = []
  const blockPattern = /<(h[1-6]|p|li)\b[^>]*>([\s\S]*?)<\/\1>/gi
  let match: RegExpExecArray | null
  let id = startId
  while ((match = blockPattern.exec(html)) !== null) {
    const tag = match[1].toLowerCase()
    const text = match[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    if (!text) continue
    blocks.push({
      id: id++,
      type: tag.startsWith('h') ? 'heading' : tag === 'li' ? 'listitem' : 'paragraph',
      level: tag.startsWith('h') ? Number(tag.slice(1)) : 0,
      text,
    })
  }
  return blocks
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

  const segments: Segment[] = []
  const locations: string[] = []
  for (const idref of spine) {
    const href = manifest.get(idref)
    if (!href) continue
    const contentPath = safeRelative(opfDir, href)
    const html = entries.find(entry => entry.entryName === contentPath)?.getData().toString('utf8')
    if (!html) continue
    const parsed = htmlToSegments(html, segments.length)
    segments.push(...parsed)
    locations.push(...parsed.map((_, index) => `${contentPath}:block:${index}`))
  }
  if (!segments.length) throw new Error('EPUB spine contains no readable textual nodes')
  return nodesFromSegments({ segments, locations, sourceHash, sourceFormat: 'epub', parserConfidence: 0.95 })
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
