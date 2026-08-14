import AdmZip from 'adm-zip'
import { AlignmentType, Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx'
import { SemanticDocumentV2, SemanticNodeV2, validateSemanticDocument } from './semantic-document'
import { deterministicDocx } from './deterministic-docx'
import { BOOKLINGUA_CLEAN_BOOK_STYLE } from './formatting-policy'
import { TitleAuthority } from './authoritative-title'

function heading(level: number | null): typeof HeadingLevel[keyof typeof HeadingLevel] {
  return level === 1 ? HeadingLevel.HEADING_1 : level === 2 ? HeadingLevel.HEADING_2 : level === 3 ? HeadingLevel.HEADING_3 : HeadingLevel.HEADING_4
}

function assertTranslated(document: SemanticDocumentV2): void {
  const errors = validateSemanticDocument(document)
  if (errors.length) throw new Error(errors.join('; '))
  if (document.nodes.some(node => !node.translatedText?.trim())) throw new Error('Semantic artifact input has missing translated nodes')
}

function nodeParagraph(node: SemanticNodeV2, text: string, runs?: TextRun[], index = 0): Paragraph {
  if (node.type === 'heading') return new Paragraph({
    children: runs || [new TextRun(text)],
    heading: heading(node.headingLevel),
    pageBreakBefore: node.headingLevel === 1 && index > 0,
    alignment: node.headingLevel === 1 ? AlignmentType.CENTER : undefined,
    spacing: { before: node.headingLevel === 1 ? 360 : 180, after: 240 },
    keepNext: true,
  })
  return new Paragraph({
    children: runs || [new TextRun(text)],
    bullet: node.type === 'list_item' ? { level: 0 } : undefined,
    alignment: AlignmentType.JUSTIFIED,
    indent: node.type === 'paragraph' ? { firstLine: BOOKLINGUA_CLEAN_BOOK_STYLE.firstLineIndentTwips } : undefined,
    spacing: { line: BOOKLINGUA_CLEAN_BOOK_STYLE.bodyLineSpacingTwips, after: 80 },
    widowControl: true,
  })
}

function semanticStyles() {
  return {
    default: { document: { run: { font: BOOKLINGUA_CLEAN_BOOK_STYLE.bodyFont, size: BOOKLINGUA_CLEAN_BOOK_STYLE.bodySizeHalfPoints } } },
    paragraphStyles: [
      { id: 'Title', name: 'Title', basedOn: 'Normal', next: 'Normal', run: { font: BOOKLINGUA_CLEAN_BOOK_STYLE.bodyFont, size: BOOKLINGUA_CLEAN_BOOK_STYLE.titleSizeHalfPoints, bold: true }, paragraph: { alignment: AlignmentType.CENTER, spacing: { after: 480 } } },
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', run: { font: BOOKLINGUA_CLEAN_BOOK_STYLE.chapterHeadingFont, size: BOOKLINGUA_CLEAN_BOOK_STYLE.chapterHeadingSizeHalfPoints, bold: true }, paragraph: { alignment: AlignmentType.CENTER, spacing: { before: 360, after: 360 } } },
    ],
  }
}

function translatedTitleAlreadyPresent(document: SemanticDocumentV2, title: string): boolean {
  const normalized = (value: string) => value.normalize('NFKC').toLocaleLowerCase().replace(/[^\w\u00c0-\u024f]+/g, ' ').trim()
  return document.nodes.some(node => node.type === 'heading' && normalized(node.translatedText || '') === normalized(title))
}

export async function buildSemanticDocx(document: SemanticDocumentV2, title: string, mode: 'pass1' | 'final'): Promise<Buffer> {
  assertTranslated(document)
  const children: Paragraph[] = []
  if (!translatedTitleAlreadyPresent(document, title)) children.push(new Paragraph({ text: title, heading: HeadingLevel.TITLE }))
  document.nodes.forEach((node, index) => children.push(nodeParagraph(node, node.translatedText!, undefined, index)))
  return deterministicDocx(Buffer.from(await Packer.toBuffer(new Document({
    styles: semanticStyles(),
    sections: [{ properties: { page: { margin: BOOKLINGUA_CLEAN_BOOK_STYLE.pageMarginsTwips } }, children }],
  }))))
}

type DiffToken = { text: string; kind: 'same' | 'delete' | 'insert' }

export function wordLevelDiff(before: string, after: string): DiffToken[] {
  const a = before.match(/\s+|[^\s]+/g) || []
  const b = after.match(/\s+|[^\s]+/g) || []
  if (a.length * b.length > 250_000) {
    let prefix = 0; while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++
    let suffix = 0; while (suffix < a.length - prefix && suffix < b.length - prefix && a[a.length - 1 - suffix] === b[b.length - 1 - suffix]) suffix++
    return [
      ...a.slice(0,prefix).map(text=>({text,kind:'same' as const})),
      ...a.slice(prefix,a.length-suffix).map(text=>({text,kind:'delete' as const})),
      ...b.slice(prefix,b.length-suffix).map(text=>({text,kind:'insert' as const})),
      ...a.slice(a.length-suffix).map(text=>({text,kind:'same' as const})),
    ]
  }
  const matrix = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1))
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) matrix[i][j] = a[i] === b[j] ? matrix[i + 1][j + 1] + 1 : Math.max(matrix[i + 1][j], matrix[i][j + 1])
  const result: DiffToken[] = []; let i = 0; let j = 0
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { result.push({ text: a[i++], kind: 'same' }); j++ }
    else if (j < b.length && (i === a.length || matrix[i][j + 1] >= matrix[i + 1][j])) result.push({ text: b[j++], kind: 'insert' })
    else result.push({ text: a[i++], kind: 'delete' })
  }
  return result
}

export async function buildSemanticReviewDocx(pass1: SemanticDocumentV2, pass2: SemanticDocumentV2, title: string): Promise<Buffer> {
  assertTranslated(pass1); assertTranslated(pass2)
  if (pass1.sourceHash !== pass2.sourceHash) throw new Error('Review documents have different source fingerprints')
  const children: Paragraph[] = [
    new Paragraph({ text: `${title} — Review`, heading: HeadingLevel.TITLE }),
    new Paragraph({ text: 'How to use this file', heading: HeadingLevel.HEADING_1 }),
    new Paragraph('Read this as a polished translation with editorial changes marked in place. Yellow strikethrough shows wording removed during editorial review; adjacent yellow text shows its replacement. Unmarked text was unchanged. Accept or reject marked revisions in Word as appropriate.'),
  ]
  pass1.nodes.forEach((first, index) => {
    const second = pass2.nodes[index]
    if (!second || second.id !== first.id) throw new Error('Review semantic identity mismatch')
    if (first.translatedText === second.translatedText) children.push(nodeParagraph(second, second.translatedText!, undefined, index))
    else children.push(nodeParagraph(second, '', wordLevelDiff(first.translatedText!, second.translatedText!).map(token => new TextRun({
      text: token.text,
      strike: token.kind === 'delete',
      highlight: token.kind === 'same' ? undefined : 'yellow',
    })), index))
  })
  return deterministicDocx(Buffer.from(await Packer.toBuffer(new Document({ styles: semanticStyles(), sections: [{ properties: { page: { margin: BOOKLINGUA_CLEAN_BOOK_STYLE.pageMarginsTwips } }, children }] }))))
}

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function decodeXml(text: string): string {
  return text.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&')
}

function replaceDocxParagraphText(inner: string, translated: string): string {
  const textPattern=/<w:t\b([^>]*)>([\s\S]*?)<\/w:t>/g
  const matches=Array.from(inner.matchAll(textPattern))
  const sourceWeights=matches.map(match=>decodeXml(match[2]).trim().split(/\s+/).filter(Boolean).length)
  const words=translated.trim().split(/\s+/);let offset=0;const total=Math.max(1,sourceWeights.reduce((a,b)=>a+b,0));let index=0
  return inner.replace(textPattern,(_full:string,attrs:string)=>{
    const remaining=words.length-offset,count=index===matches.length-1?remaining:Math.max(0,Math.min(remaining,Math.round(words.length*(sourceWeights[index++]||0)/total)))
    const value=words.slice(offset,offset+count).join(' ');offset+=count
    return `<w:t${attrs}${/^\s|\s$/.test(value)&&!attrs.includes('xml:space')?' xml:space="preserve"':''}>${escapeXml(value)}</w:t>`
  })
}

export async function buildSemanticDocxPreservingSource(source:Buffer,document:SemanticDocumentV2):Promise<Buffer>{
  assertTranslated(document)
  if(document.sourceFormat!=='docx')throw new Error('Source-preserving DOCX output requires a DOCX semantic source')
  const zip:any=new AdmZip(source),entry=zip.getEntry('word/document.xml');if(!entry)throw new Error('DOCX document.xml missing')
  let nodeIndex=0
  const normalize=(value:string)=>value.normalize('NFKC').replace(/\s+/g,' ').trim()
  const xml=entry.getData().toString('utf8').replace(/<w:p\b([^>]*)>([\s\S]*?)<\/w:p>/g,(full:string,attrs:string,inner:string)=>{
    const sourceText=normalize(Array.from(inner.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)).map(match=>decodeXml(match[1])).join(''))
    if(!sourceText)return full
    const node=document.nodes[nodeIndex]
    if(!node||normalize(node.sourceText)!==sourceText)throw new Error(`DOCX source presentation does not align at semantic node ${nodeIndex+1}`)
    nodeIndex++
    return `<w:p${attrs}>${replaceDocxParagraphText(inner,node.translatedText!)}</w:p>`
  })
  if(nodeIndex!==document.nodes.length)throw new Error('DOCX source presentation has incomplete semantic coverage')
  zip.updateFile('word/document.xml',Buffer.from(xml))
  return deterministicDocx(zip.toBuffer())
}

export async function buildFinalSemanticDocx(source:Buffer,document:SemanticDocumentV2,title:string):Promise<Buffer>{
  if(document.sourceFormat==='docx'&&document.parserConfidence>=0.6){
    try{return await buildSemanticDocxPreservingSource(source,document)}catch(error){
      if(document.parserConfidence>=0.85)throw error
    }
  }
  return buildSemanticDocx(document,title,'final')
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

export function buildSemanticEpub(source: Buffer, document: SemanticDocumentV2, titleAuthority?: TitleAuthority): Buffer {
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
      // The canonical parser deliberately omits empty/markup-only blocks. The
      // rebuilder must apply the identical selection rule or its source-location
      // indexes diverge on real EPUBs containing empty layout paragraphs.
      if (!inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()) return _full
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
  if (titleAuthority?.translatedValue) for (const entry of zip.getEntries().filter((e: any) => /\.opf$/i.test(e.entryName))) {
    const xml = entry.getData().toString('utf8').replace(/<dc:title(?:\s[^>]*)?>[\s\S]*?<\/dc:title>/i, (match: string) => match.replace(/>[^<]*</, `>${escapeXml(titleAuthority.translatedValue!)}<`))
    zip.updateFile(entry.entryName, Buffer.from(xml))
  }
  // Repack instead of serializing the mutated source archive directly. Some
  // Google Docs EPUBs use ZIP data descriptors; adm-zip otherwise preserves
  // that flag without writing a new descriptor and produces unreadable output.
  // Repacking also restores the required first, uncompressed mimetype entry.
  const output: any = new (AdmZip as any)(undefined, { noSort: true })
  const entries = zip.getEntries()
  const mimetype = entries.find((entry: any) => entry.entryName === 'mimetype')
  if (mimetype) {
    output.addFile('mimetype', mimetype.getData())
    output.getEntry('mimetype').header.method = 0
  }
  for (const entry of entries) {
    if (entry.entryName === 'mimetype') continue
    output.addFile(entry.entryName, entry.getData())
  }
  return output.toBuffer()
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
