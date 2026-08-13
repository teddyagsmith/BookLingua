import AdmZip from 'adm-zip'
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx'
import { SemanticDocumentV2, SemanticNodeV2, validateSemanticDocument } from './semantic-document'

function heading(level: number | null): typeof HeadingLevel[keyof typeof HeadingLevel] {
  return level === 1 ? HeadingLevel.HEADING_1 : level === 2 ? HeadingLevel.HEADING_2 : level === 3 ? HeadingLevel.HEADING_3 : HeadingLevel.HEADING_4
}

function assertTranslated(document: SemanticDocumentV2): void {
  const errors = validateSemanticDocument(document)
  if (errors.length) throw new Error(errors.join('; '))
  if (document.nodes.some(node => !node.translatedText?.trim())) throw new Error('Semantic artifact input has missing translated nodes')
}

function nodeParagraph(node: SemanticNodeV2, text: string, runs?: TextRun[]): Paragraph {
  if (node.type === 'heading') return new Paragraph({ text, heading: heading(node.headingLevel) })
  return new Paragraph({ children: runs || [new TextRun(text)], bullet: node.type === 'list_item' ? { level: 0 } : undefined })
}

export async function buildSemanticDocx(document: SemanticDocumentV2, title: string, mode: 'pass1' | 'final'): Promise<Buffer> {
  assertTranslated(document)
  const children = [new Paragraph({ text: title, heading: HeadingLevel.TITLE })]
  for (const node of document.nodes) children.push(nodeParagraph(node, node.translatedText!))
  return Buffer.from(await Packer.toBuffer(new Document({ sections: [{ children }] })))
}

export async function buildSemanticReviewDocx(pass1: SemanticDocumentV2, pass2: SemanticDocumentV2, title: string): Promise<Buffer> {
  assertTranslated(pass1); assertTranslated(pass2)
  if (pass1.sourceHash !== pass2.sourceHash) throw new Error('Review documents have different source fingerprints')
  const children: Paragraph[] = [
    new Paragraph({ text: `${title} — Review`, heading: HeadingLevel.TITLE }),
    new Paragraph('Yellow strikethrough is Pass 1; following yellow text is the Pass 2 replacement.'),
  ]
  pass1.nodes.forEach((first, index) => {
    const second = pass2.nodes[index]
    if (!second || second.id !== first.id) throw new Error('Review semantic identity mismatch')
    if (first.translatedText === second.translatedText) children.push(nodeParagraph(second, second.translatedText!))
    else children.push(nodeParagraph(second, '', [
      new TextRun({ text: first.translatedText!, strike: true, highlight: 'yellow' }),
      new TextRun({ text: second.translatedText!, highlight: 'yellow' }),
    ]))
  })
  return Buffer.from(await Packer.toBuffer(new Document({ sections: [{ children }] })))
}

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function replaceTextPreservingInline(inner: string, translated: string): string {
  const tokens = inner.split(/(<[^>]+>)/g)
  const textIndexes = tokens.map((token,index) => !token.startsWith('<') && token.trim() ? index : -1).filter(index => index >= 0)
  if (!textIndexes.length) return inner
  const weights = textIndexes.map(index => tokens[index].trim().split(/\s+/).length)
  const words = translated.trim().split(/\s+/); let offset = 0; const total = weights.reduce((a,b)=>a+b,0)
  textIndexes.forEach((tokenIndex, i) => {
    const remaining = words.length-offset
    const count = i === textIndexes.length-1 ? remaining : Math.max(1, Math.min(remaining-(textIndexes.length-i-1), Math.round(words.length*weights[i]/total)))
    const leading = tokens[tokenIndex].match(/^\s*/)?.[0] || ''; const trailing = tokens[tokenIndex].match(/\s*$/)?.[0] || ''
    tokens[tokenIndex] = `${leading}${escapeXml(words.slice(offset,offset+count).join(' '))}${trailing}`; offset += count
  })
  return tokens.join('')
}

export function buildSemanticEpub(source: Buffer, document: SemanticDocumentV2): Buffer {
  assertTranslated(document)
  if (document.sourceFormat !== 'epub') throw new Error('EPUB output requires an EPUB semantic source')
  const zip: any = new AdmZip(source)
  const byPath = new Map<string, SemanticNodeV2[]>()
  for (const node of document.nodes) {
    const split = node.sourceLocation.match(/^(.*):block:(\d+)$/)
    if (!split) throw new Error('Invalid semantic EPUB source location')
    const rows = byPath.get(split[1]) || []; rows[Number(split[2])] = node; byPath.set(split[1], rows)
  }
  for (const [entryPath, nodes] of Array.from(byPath.entries())) {
    const entry = zip.getEntry(entryPath); if (!entry) throw new Error(`EPUB source entry missing: ${entryPath}`)
    let index = 0
    const xml = entry.getData().toString('utf8').replace(/<(h[1-6]|p|li)\b([^>]*)>([\s\S]*?)<\/\1>/gi, (_full: string, tag: string, attrs: string, inner: string) => {
      const node = nodes[index++]
      if (!node) throw new Error(`EPUB semantic block count changed: ${entryPath}`)
      return `<${tag}${attrs}>${replaceTextPreservingInline(inner,node.translatedText!)}</${tag}>`
    })
    if (index !== nodes.length) throw new Error(`EPUB semantic block count changed: ${entryPath}`)
    zip.updateFile(entryPath, Buffer.from(xml))
  }
  const headingMap = new Map(document.nodes.filter(n => n.type === 'heading').map(n => [n.sourceText.trim(), n.translatedText!]))
  for (const entry of zip.getEntries().filter((e: any) => /(?:nav|\.ncx$)/i.test(e.entryName))) {
    let xml = entry.getData().toString('utf8')
    for (const [sourceText, translatedText] of Array.from(headingMap.entries())) xml = xml.split(`>${sourceText}<`).join(`>${escapeXml(translatedText)}<`)
    zip.updateFile(entry.entryName, Buffer.from(xml))
  }
  return zip.toBuffer()
}

export function buildSemanticEpubFromDocument(document: SemanticDocumentV2, title: string): Buffer {
  assertTranslated(document)
  const zip: any = new AdmZip()
  zip.addFile('mimetype', Buffer.from('application/epub+zip'))
  zip.addFile('META-INF/container.xml', Buffer.from('<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OPS/book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'))
  const chapters: Array<{ id: string; title: string; nodes: SemanticNodeV2[] }> = []
  for (const node of document.nodes) {
    if (node.type === 'heading' && node.headingLevel === 1 || !chapters.length) chapters.push({ id: `c${chapters.length + 1}`, title: node.type === 'heading' ? node.translatedText! : title, nodes: [] })
    chapters[chapters.length - 1].nodes.push(node)
  }
  for (const chapter of chapters) {
    const body = chapter.nodes.map(n => n.type === 'heading' ? `<h${Math.min(6,n.headingLevel||1)}>${escapeXml(n.translatedText!)}</h${Math.min(6,n.headingLevel||1)}>` : `<p>${escapeXml(n.translatedText!)}</p>`).join('')
    zip.addFile(`OPS/${chapter.id}.xhtml`, Buffer.from(`<html xmlns="http://www.w3.org/1999/xhtml"><head><title>${escapeXml(chapter.title)}</title></head><body>${body}</body></html>`))
  }
  const manifest = chapters.map(c=>`<item id="${c.id}" href="${c.id}.xhtml" media-type="application/xhtml+xml"/>`).join('')
  const spine = chapters.map(c=>`<itemref idref="${c.id}"/>`).join('')
  zip.addFile('OPS/book.opf', Buffer.from(`<package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${escapeXml(title)}</dc:title></metadata><manifest>${manifest}</manifest><spine>${spine}</spine></package>`))
  return zip.toBuffer()
}
