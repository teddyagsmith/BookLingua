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
    const xml = entry.getData().toString('utf8').replace(/<(h[1-6]|p|li)\b([^>]*)>[\s\S]*?<\/\1>/gi, (_full: string, tag: string, attrs: string) => {
      const node = nodes[index++]
      if (!node) throw new Error(`EPUB semantic block count changed: ${entryPath}`)
      return `<${tag}${attrs}>${escapeXml(node.translatedText!)}</${tag}>`
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
