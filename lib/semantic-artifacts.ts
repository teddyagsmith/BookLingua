import AdmZip from 'adm-zip'
import { createHash } from 'node:crypto'
import path from 'node:path'
import sharp from 'sharp'
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
  text = decodeVisibleEntities(text)
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
    // Override docx's built-in semantic styles in place. Adding Title/Heading1
    // again through paragraphStyles creates duplicate style IDs; Word and Drive
    // are then free to choose the oversized built-in definition.
    default: {
      document: { run: { font: BOOKLINGUA_CLEAN_BOOK_STYLE.bodyFont, size: BOOKLINGUA_CLEAN_BOOK_STYLE.bodySizeHalfPoints } },
      title: { run: { font: BOOKLINGUA_CLEAN_BOOK_STYLE.bodyFont, size: BOOKLINGUA_CLEAN_BOOK_STYLE.titleSizeHalfPoints, bold: true }, paragraph: { alignment: AlignmentType.CENTER, spacing: { after: 240 } } },
      heading1: { run: { font: BOOKLINGUA_CLEAN_BOOK_STYLE.chapterHeadingFont, size: BOOKLINGUA_CLEAN_BOOK_STYLE.chapterHeadingSizeHalfPoints, bold: true }, paragraph: { alignment: AlignmentType.CENTER, spacing: { before: 240, after: 200 } } },
      heading2: { run: { font: BOOKLINGUA_CLEAN_BOOK_STYLE.chapterHeadingFont, size: 30, bold: true }, paragraph: { spacing: { before: 200, after: 120 } } },
      heading3: { run: { font: BOOKLINGUA_CLEAN_BOOK_STYLE.chapterHeadingFont, size: 26, bold: true }, paragraph: { spacing: { before: 160, after: 100 } } },
      heading4: { run: { font: BOOKLINGUA_CLEAN_BOOK_STYLE.chapterHeadingFont, size: 24, bold: true }, paragraph: { spacing: { before: 140, after: 80 } } },
      heading5: { run: { font: BOOKLINGUA_CLEAN_BOOK_STYLE.chapterHeadingFont, size: 22, bold: true }, paragraph: { spacing: { before: 120, after: 60 } } },
      heading6: { run: { font: BOOKLINGUA_CLEAN_BOOK_STYLE.chapterHeadingFont, size: 22, bold: true }, paragraph: { spacing: { before: 120, after: 60 } } },
    },
  }
}

function translatedTitleAlreadyPresent(document: SemanticDocumentV2, title: string): boolean {
  const normalized = (value: string) => value.normalize('NFKC').toLocaleLowerCase().replace(/[^\w\u00c0-\u024f]+/g, ' ').trim()
  return document.nodes.some(node => node.type === 'heading' && normalized(node.translatedText || '') === normalized(title))
}

function joinHeadingFragments(values:string[]):string{
  return values.reduce((result,value)=>{
    const clean=decodeVisibleEntities(value).trim()
    if(!result)return clean
    if(/[-‐-―]\s*$/.test(result))return /^[a-zà-öø-ÿäöüß]/.test(clean)?`${result.replace(/[-‐-―]\s*$/,'')}${clean}`:`${result}${clean}`
    return `${result} ${clean}`
  },'')
}

/** Collapse a numbered chapter heading split across adjacent display blocks. */
export function consolidatedArtifactNodes(document:SemanticDocumentV2):SemanticNodeV2[]{
  const output:SemanticNodeV2[]=[]
  for(let index=0;index<document.nodes.length;index++){
    const node=document.nodes[index]
    if(node.type==='heading'&&/^chapter\s+(?:\d+|[ivxlcdm]+)\s*:?$/i.test(decodeVisibleEntities(node.sourceText).trim())){
      const group=[node]
      while((document.nodes[index+1]?.type==='heading'&&!/^chapter\s+(?:\d+|[ivxlcdm]+)\b/i.test(decodeVisibleEntities(document.nodes[index+1].sourceText).trim()))||(document.nodes[index+1]?.type==='paragraph'&&document.nodes[index+2]?.type==='heading'&&!/^chapter\s+(?:\d+|[ivxlcdm]+)\b/i.test(decodeVisibleEntities(document.nodes[index+2].sourceText).trim())&&decodeVisibleEntities(document.nodes[index+1].sourceText).trim().split(/\s+/).length<=8&&!/[.!?]$/.test(decodeVisibleEntities(document.nodes[index+1].sourceText).trim())))group.push(document.nodes[++index])
      output.push({...node,sourceText:joinHeadingFragments(group.map(item=>item.sourceText)),translatedText:joinHeadingFragments(group.map(item=>item.translatedText||''))})
    }else output.push(node)
  }
  return output
}

function documentNodesWithGeneratedToc(document:SemanticDocumentV2):SemanticNodeV2[]{
  const nodes=consolidatedArtifactNodes(document)
  const tocIndex=nodes.findIndex(node=>/^(?:table of contents|contents)$/i.test(decodeVisibleEntities(node.sourceText).trim()))
  const firstBodyHeading=nodes.findIndex((node,index)=>index>tocIndex&&node.type==='heading')
  if(tocIndex<0||firstBodyHeading<0)return nodes
  const chapterHeadings=nodes.slice(firstBodyHeading).filter(node=>node.type==='heading'&&(/^(?:introduction|chapter\s+(?:\d+|[ivxlcdm]+)\b)/i.test(decodeVisibleEntities(node.sourceText).trim())))
  if(!chapterHeadings.length)return nodes
  const tocRows=chapterHeadings.map((node,index)=>({...node,id:`${node.id}-toc`,order:nodes[tocIndex].order+index+1,type:'paragraph' as const,headingLevel:null,chapterId:null}))
  return [...nodes.slice(0,tocIndex+1),...tocRows,...nodes.slice(firstBodyHeading)]
}

/** Prefer author attribution embedded in the book over a checkout/customer label. */
export function resolveBookAuthor(document:SemanticDocumentV2,fallback?:string):string|undefined{
  const about=document.nodes.findIndex(node=>/^about the author$/i.test(decodeVisibleEntities(node.sourceText).trim()))
  const candidate=about>=0?decodeVisibleEntities(document.nodes[about+1]?.sourceText||'').trim():''
  if(candidate&&candidate.length<=120&&!/[.!?]$/.test(candidate))return candidate
  const clean=decodeVisibleEntities(fallback||'').replace(/^prepared for\s+/i,'').trim()
  return clean||undefined
}

export function decodeVisibleEntities(value:string):string{
  let previous=''
  let output=value
  for(let i=0;i<3&&output!==previous;i++){
    previous=output
    output=output
      .replace(/&#x([0-9a-f]+);/gi,(_m,hex)=>String.fromCodePoint(parseInt(hex,16)))
      .replace(/&#(\d+);/g,(_m,decimal)=>String.fromCodePoint(parseInt(decimal,10)))
      .replace(/&(?:amp|apos|quot|lt|gt|nbsp);/g,entity=>({ '&amp;':'&','&apos;':"'",'&quot;':'"','&lt;':'<','&gt;':'>','&nbsp;':'\u00a0' }[entity]!))
  }
  return output
}

export async function buildSemanticDocx(document: SemanticDocumentV2, title: string, mode: 'pass1' | 'final'): Promise<Buffer> {
  assertTranslated(document)
  const children: Paragraph[] = []
  if (!translatedTitleAlreadyPresent(document, title)) children.push(new Paragraph({ text: title, heading: HeadingLevel.TITLE }))
  documentNodesWithGeneratedToc(document).forEach((node, index) => children.push(nodeParagraph(node, node.translatedText!, undefined, index)))
  return deterministicDocx(Buffer.from(await Packer.toBuffer(new Document({
    styles: semanticStyles(),
    sections: [{ properties: { page: { margin: BOOKLINGUA_CLEAN_BOOK_STYLE.pageMarginsTwips } }, children }],
  }))))
}

type DiffToken = { text: string; kind: 'same' | 'delete' | 'insert' }

export function wordLevelDiff(before: string, after: string): DiffToken[] {
  const typography=(value:string)=>value.normalize('NFC').replace(/[’‘]/g,"'").replace(/[“”]/g,'"').replace(/\u00a0/g,' ')
  if(typography(before)===typography(after))return [{text:after,kind:'same'}]
  const a = before.match(/\s+|[^\s]+/g) || []
  const b = after.match(/\s+|[^\s]+/g) || []
  const meaningfulA=new Set(a.filter(token=>/[A-Za-zÀ-ÿ0-9]/.test(token)).map(token=>token.toLocaleLowerCase()))
  if(!b.some(token=>meaningfulA.has(token.toLocaleLowerCase())))return [{text:before,kind:'delete'},{text:after,kind:'insert'}]
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
    else if (i < a.length && j < b.length && matrix[i][j + 1] === matrix[i + 1][j]) result.push({ text: a[i++], kind: 'delete' })
    else if (j < b.length && (i === a.length || matrix[i][j + 1] > matrix[i + 1][j])) result.push({ text: b[j++], kind: 'insert' })
    else result.push({ text: a[i++], kind: 'delete' })
  }
  return result
}

export async function buildSemanticReviewDocx(pass1: SemanticDocumentV2, pass2: SemanticDocumentV2, title: string): Promise<Buffer> {
  assertTranslated(pass1); assertTranslated(pass2)
  if (pass1.sourceHash !== pass2.sourceHash) throw new Error('Review documents have different source fingerprints')
  const changeCount = pass1.nodes.filter((first, index) => first.translatedText !== pass2.nodes[index]?.translatedText).length
  const children: Paragraph[] = [
    new Paragraph({ text: `${title} — Review`, heading: HeadingLevel.TITLE }),
    new Paragraph({ text: 'How to use this file', heading: HeadingLevel.HEADING_1 }),
    new Paragraph('Read this as a polished translation with editorial changes marked in place. Yellow strikethrough shows wording removed during editorial review; adjacent yellow text shows its replacement. Unmarked text was unchanged. Accept or reject marked revisions in Word as appropriate.'),
    ...(changeCount === 0 ? [new Paragraph('Editorial review completed: no wording changes were required, so this document intentionally contains no highlighted revisions.')] : []),
  ]
  const firstNodes=documentNodesWithGeneratedToc(pass1),secondNodes=documentNodesWithGeneratedToc(pass2)
  firstNodes.forEach((first, index) => {
    const second = secondNodes[index]
    if (!second || second.id !== first.id) throw new Error('Review semantic identity mismatch')
    if (first.translatedText === second.translatedText) children.push(nodeParagraph(second, second.translatedText!, undefined, index))
    else children.push(nodeParagraph(second, '', wordLevelDiff(decodeVisibleEntities(first.translatedText!), decodeVisibleEntities(second.translatedText!)).map(token => new TextRun({
      text: decodeVisibleEntities(token.text),
      strike: token.kind === 'delete',
      highlight: token.kind === 'same' ? undefined : 'yellow',
    })), index))
  })
  return deterministicDocx(Buffer.from(await Packer.toBuffer(new Document({ styles: semanticStyles(), sections: [{ properties: { page: { margin: BOOKLINGUA_CLEAN_BOOK_STYLE.pageMarginsTwips } }, children }] }))))
}

const CORE_EPUB_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/svg+xml'])

/** Convert non-core raster images and rewrite every EPUB reference before validation. */
export async function normalizeEpubImages(buffer: Buffer): Promise<Buffer> {
  const zip: any = new AdmZip(buffer)
  const opfEntry = zip.getEntries().find((entry: any) => /\.opf$/i.test(entry.entryName))
  if (!opfEntry) throw new Error('EPUB OPF missing while normalizing images')
  let opf = opfEntry.getData().toString('utf8')
  const opfDir = path.posix.dirname(opfEntry.entryName) === '.' ? '' : path.posix.dirname(opfEntry.entryName)
  const replacements = new Map<string, string>()
  const itemPattern = /<item\b[^>]*\bhref=(['"])(.*?)\1[^>]*\bmedia-type=(['"])(.*?)\3[^>]*\/?\s*>/gi
  for (const match of Array.from(opf.matchAll(itemPattern)) as RegExpMatchArray[]) {
    const href = match[2], mediaType = match[4].toLowerCase()
    if (!mediaType.startsWith('image/') || CORE_EPUB_IMAGE_TYPES.has(mediaType)) continue
    const oldPath = path.posix.normalize(path.posix.join(opfDir, decodeURIComponent(href)))
    const entry = zip.getEntry(oldPath)
    if (!entry) throw new Error(`EPUB image declared in OPF is missing: ${oldPath}`)
    const newPath = oldPath.replace(/\.[^./]+$/, '') + '.png'
    const png = await sharp(entry.getData(), { pages: 1 }).png().toBuffer()
    zip.addFile(newPath, png)
    zip.deleteFile(oldPath)
    replacements.set(oldPath, newPath)
  }
  if (!replacements.size) return buffer
  for (const entry of zip.getEntries()) {
    if (!/\.(?:opf|xhtml?|html|css|ncx)$/i.test(entry.entryName)) continue
    let text = entry.getData().toString('utf8')
    for (const [oldPath, newPath] of Array.from(replacements.entries())) {
      const relativeOld = path.posix.relative(path.posix.dirname(entry.entryName), oldPath)
      const relativeNew = path.posix.relative(path.posix.dirname(entry.entryName), newPath)
      text = text.split(relativeOld).join(relativeNew).split(encodeURI(relativeOld)).join(encodeURI(relativeNew))
      if (entry.entryName === opfEntry.entryName) text = text.replace(new RegExp(`(href=["'])${relativeNew.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(["'][^>]*media-type=["'])image/[^"']+`, 'g'), (_match: string, prefix: string, suffix: string) => `${prefix}${relativeNew}${suffix}image/png`)
    }
    zip.updateFile(entry.entryName, Buffer.from(text))
  }
  const output: any = new (AdmZip as any)(undefined, { noSort: true })
  const mimetype = zip.getEntry('mimetype')
  if (!mimetype) throw new Error('EPUB mimetype missing while normalizing images')
  output.addFile('mimetype', mimetype.getData()); output.getEntry('mimetype').header.method = 0
  for (const entry of zip.getEntries()) if (entry.entryName !== 'mimetype') output.addFile(entry.entryName, entry.getData())
  return output.toBuffer()
}

function escapeXml(text: string): string {
  return decodeVisibleEntities(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
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
    const current=index++
    const remaining=words.length-offset,count=current===matches.length-1?remaining:Math.max(0,Math.min(remaining,Math.round(words.length*(sourceWeights[current]||0)/total)))
    let value=words.slice(offset,offset+count).join(' ');offset+=count
    // Word normally stores boundary whitespace inside one of the adjacent
    // text runs. Repartitioning translated words must restore that boundary.
    if(value && offset < words.length)value += ' '
    return `<w:t${attrs}${/^\s|\s$/.test(value)&&!attrs.includes('xml:space')?' xml:space="preserve"':''}>${escapeXml(value)}</w:t>`
  })
}

function applySemanticParagraphStyle(inner:string,node:SemanticNodeV2):string{
  if(node.type!=='heading')return inner
  const style=`Heading${Math.max(1,Math.min(3,node.headingLevel||1))}`
  if(/<w:pPr\b[^>]*>/.test(inner)){
    if(/<w:pStyle\b[^>]*\/?\s*>/.test(inner))return inner.replace(/<w:pStyle\b[^>]*\/?\s*>/,`<w:pStyle w:val="${style}"/>`)
    return inner.replace(/<w:pPr\b([^>]*)>/,`<w:pPr$1><w:pStyle w:val="${style}"/>`)
  }
  return `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>${inner}`
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
    return `<w:p${attrs}>${applySemanticParagraphStyle(replaceDocxParagraphText(inner,node.translatedText!),node)}</w:p>`
  })
  if(nodeIndex!==document.nodes.length)throw new Error('DOCX source presentation has incomplete semantic coverage')
  zip.updateFile('word/document.xml',Buffer.from(xml))
  const stylesEntry=zip.getEntry('word/styles.xml')
  if(stylesEntry){
    let styles=stylesEntry.getData().toString('utf8')
    const missing=[1,2,3].filter(level=>!new RegExp(`w:styleId=["']Heading${level}["']`).test(styles))
    if(missing.length)styles=styles.replace(/<\/w:styles>\s*$/,`${missing.map(level=>`<w:style w:type="paragraph" w:styleId="Heading${level}"><w:name w:val="heading ${level}"/><w:basedOn w:val="Default"/><w:next w:val="Default"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:outlineLvl w:val="${level-1}"/></w:pPr><w:rPr><w:b/><w:sz w:val="${level===1?32:28}"/></w:rPr></w:style>`).join('')}</w:styles>`)
    zip.updateFile('word/styles.xml',Buffer.from(styles))
  }
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
  return tokens.join('').replace(/<\/(?:b|strong|i|em)>(?=[A-Za-zÀ-ÖØ-öø-ÿ0-9])/g,match=>`${match} `)
}

function editionIdentifier(seed:string,language:string):string{
  const hex=createHash('sha256').update(`${seed}:${language}`).digest('hex').slice(0,32).split('')
  hex[12]='5';hex[16]=((parseInt(hex[16],16)&3)|8).toString(16)
  return `urn:uuid:${hex.slice(0,8).join('')}-${hex.slice(8,12).join('')}-${hex.slice(12,16).join('')}-${hex.slice(16,20).join('')}-${hex.slice(20).join('')}`
}

export function buildSemanticEpub(source: Buffer, document: SemanticDocumentV2, titleAuthority?: TitleAuthority, language?:string,authorName?:string,editionSeed?:string): Buffer {
  assertTranslated(document)
  if (document.sourceFormat !== 'epub') throw new Error('EPUB output requires an EPUB semantic source')
  const zip: any = new AdmZip(source)
  const consolidated=consolidatedArtifactNodes(document)
  const consolidatedByFirstId=new Map(consolidated.map(node=>[node.id,node]))
  const retainedIds=new Set(consolidated.map(node=>node.id))
  const removedHeadingKeys=new Set(document.nodes.filter(node=>!retainedIds.has(node.id)).map(node=>decodeVisibleEntities(node.sourceText).normalize('NFKC').toLocaleLowerCase().replace(/\s+/g,' ').trim()))
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
      if(!retainedIds.has(node.id))return ''
      const artifactNode=consolidatedByFirstId.get(node.id)||node
      const outputTag=node.type==='heading'?`h${Math.max(1,Math.min(6,node.headingLevel||1))}`:tag
      return `<${outputTag}${attrs}>${replaceTextPreservingInline(inner,artifactNode.translatedText!)}</${outputTag}>`
    })
    if (index !== nodes.length) throw new Error(`EPUB semantic block count changed: ${entryPath}`)
    zip.updateFile(entryPath, Buffer.from(xml))
  }
  const headingMap = new Map(consolidated.filter(n => n.type === 'heading').map(n => [n.sourceText.trim(), n.translatedText!]))
  for (const entry of zip.getEntries().filter((e: any) => /(?:nav|toc|\.ncx$)/i.test(e.entryName))) {
    let xml = entry.getData().toString('utf8')
    const entryContainsRemovedHeading=(block:string)=>Array.from(block.matchAll(/<(?:a|text)\b[^>]*>([\s\S]*?)<\/(?:a|text)>/gi)).some(match=>removedHeadingKeys.has(decodeVisibleEntities(match[1].replace(/<[^>]+>/g,' ')).normalize('NFKC').toLocaleLowerCase().replace(/\s+/g,' ').trim()))
    xml=xml.replace(/<navPoint\b[^>]*>[\s\S]*?<\/navPoint>/gi,(block:string)=>entryContainsRemovedHeading(block)?'':block)
    xml=xml.replace(/<li\b[^>]*>[\s\S]*?<\/li>/gi,(block:string)=>entryContainsRemovedHeading(block)?'':block)
    for (const [sourceText, translatedText] of Array.from(headingMap.entries())) xml = xml.split(`>${sourceText}<`).join(`>${escapeXml(translatedText)}<`)
    const normalizedHeadings=new Map(consolidated.map(node=>[decodeVisibleEntities(node.sourceText.replace(/<[^>]+>/g,' ')).normalize('NFKC').toLocaleLowerCase().replace(/\s+/g,' ').trim(),node.translatedText!]))
    for(const node of document.nodes.filter(item=>item.type==='heading'&&retainedIds.has(item.id))){
      const artifactNode=consolidatedByFirstId.get(node.id)
      if(artifactNode&&artifactNode.sourceText!==node.sourceText)normalizedHeadings.set(decodeVisibleEntities(node.sourceText).normalize('NFKC').toLocaleLowerCase().replace(/\s+/g,' ').trim(),artifactNode.translatedText!)
    }
    const systemLabels:Record<string,{cover:string;toc:string}>={'pt-br':{cover:'Capa',toc:'Sumário'},de:{cover:'Umschlag',toc:'Inhaltsverzeichnis'},fr:{cover:'Couverture',toc:'Table des matières'},'es-es':{cover:'Portada',toc:'Índice'}}
    if(language&&systemLabels[language]){normalizedHeadings.set('cover',systemLabels[language].cover);normalizedHeadings.set('table of contents',systemLabels[language].toc)}
    xml=xml.replace(/<(a|text)\b([^>]*)>([\s\S]*?)<\/\1>/gi,(full:string,tag:string,attrs:string,inner:string)=>{
      const key=decodeVisibleEntities(inner.replace(/<[^>]+>/g,' ')).normalize('NFKC').toLocaleLowerCase().replace(/\s+/g,' ').trim()
      const translated=normalizedHeadings.get(key)
      return translated?`<${tag}${attrs}>${escapeXml(translated)}</${tag}>`:full
    })
    if(titleAuthority?.translatedValue)xml=xml.replace(/<docTitle\b([^>]*)>[\s\S]*?<\/docTitle>/i,`<docTitle$1><text>${escapeXml(titleAuthority.translatedValue)}</text></docTitle>`)
    if(titleAuthority?.translatedValue)xml=xml.replace(/<title\b([^>]*)>[\s\S]*?<\/title>/gi,`<title$1>${escapeXml(titleAuthority.translatedValue)}</title>`)
    if(language&&systemLabels[language])xml=xml.replace(/<h([1-6])\b([^>]*)>\s*(?:Contents|Table of Contents)\s*<\/h\1>/gi,`<h$1$2>${escapeXml(systemLabels[language].toc)}</h$1>`)
    zip.updateFile(entry.entryName, Buffer.from(xml))
  }
  if (titleAuthority?.translatedValue || language) for (const entry of zip.getEntries().filter((e: any) => /\.opf$/i.test(e.entryName))) {
    let xml = entry.getData().toString('utf8')
    if(titleAuthority?.translatedValue)xml=xml.replace(/<dc:title(?:\s[^>]*)?>[\s\S]*?<\/dc:title>/i, (match: string) => match.replace(/>[^<]*</, `>${escapeXml(titleAuthority.translatedValue!)}<`))
    if(language){
      xml=/<dc:language(?:\s[^>]*)?>/i.test(xml)?xml.replace(/<dc:language(?:\s[^>]*)?>[\s\S]*?<\/dc:language>/gi,`<dc:language>${escapeXml(language)}</dc:language>`):xml.replace(/<metadata\b([^>]*)>/i,`<metadata$1><dc:language>${escapeXml(language)}</dc:language>`)
      xml=xml.replace(/<meta\b([^>]*property=["']dcterms:language["'][^>]*)>[\s\S]*?<\/meta>/gi,`<meta$1>${escapeXml(language)}</meta>`)
      const creator=resolveBookAuthor(document,authorName)
      if(creator)xml=/<dc:creator(?:\s[^>]*)?>/i.test(xml)?xml.replace(/<dc:creator(?:\s[^>]*)?>[\s\S]*?<\/dc:creator>/gi,`<dc:creator>${escapeXml(creator)}</dc:creator>`):xml.replace(/<metadata\b([^>]*)>/i,`<metadata$1><dc:creator>${escapeXml(creator)}</dc:creator>`)
      const identifier=editionIdentifier(editionSeed||document.sourceHash,language)
      xml=/<dc:identifier(?:\s[^>]*)?>/i.test(xml)?xml.replace(/<dc:identifier(?:\s[^>]*)?>[\s\S]*?<\/dc:identifier>/i,(match:string)=>match.replace(/>[^<]*</,`>${identifier}<`)):xml.replace(/<metadata\b([^>]*)>/i,`<metadata$1><dc:identifier id="bookid">${identifier}</dc:identifier>`)
    }
    const copyright=document.nodes.find(node=>/^Copyright\b/i.test(decodeVisibleEntities(node.sourceText)))?.translatedText
    if(copyright){
      xml=xml.replace(/<dc:rights(?:\s[^>]*)?>[\s\S]*?<\/dc:rights>/gi,`<dc:rights>${escapeXml(copyright)}</dc:rights>`)
      xml=xml.replace(/<meta\b([^>]*property=["']dcterms:rights["'][^>]*)>[\s\S]*?<\/meta>/gi,`<meta$1>${escapeXml(copyright)}</meta>`)
    }
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

export function buildSemanticEpubFromDocument(document: SemanticDocumentV2, title: string,language='en',authorName='Unknown',editionSeed=document.sourceHash): Buffer {
  assertTranslated(document)
  const zip: any = new (AdmZip as any)(undefined, { noSort: true })
  zip.addFile('mimetype', Buffer.from('application/epub+zip'))
  zip.getEntry('mimetype').header.method = 0
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
  zip.addFile('OPS/book.opf', Buffer.from(`<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="bookid">${editionIdentifier(editionSeed,language)}</dc:identifier><dc:title>${escapeXml(title)}</dc:title><dc:creator>${escapeXml(authorName)}</dc:creator><dc:language>${escapeXml(language)}</dc:language></metadata><manifest>${manifest}</manifest><spine>${spine}</spine></package>`))
  return zip.toBuffer()
}
