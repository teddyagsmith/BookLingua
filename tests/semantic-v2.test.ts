import test from 'node:test'
import assert from 'node:assert/strict'
import AdmZip from 'adm-zip'
import sharp from 'sharp'
import { Document, HeadingLevel, Packer, Paragraph } from 'docx'
import { parseSemanticDocx, parseSemanticEpub, parseSemanticTxt } from '../lib/semantic-parser'
import { createNodeTranslationInput, validateAndMergeNodeOutput } from '../lib/node-translation-contract'
import { buildChapterMap, renderChapterMapCsv, renderChapterMapDocx } from '../lib/chapter-map'
import { evaluateSemanticEligibility } from '../lib/semantic-document'
import { buildSemanticDocx, buildSemanticEpub, buildSemanticEpubFromDocument, buildSemanticReviewDocx, consolidatedArtifactNodes, normalizeEpubImages, resolveBookAuthor } from '../lib/semantic-artifacts'
import { validateArtifact } from '../lib/artifact-validation-v2'
import { deterministicSemanticBuildId } from '../lib/semantic-pipeline'
import { semanticV2AllowedForOrder } from '../lib/semantic-canary'

function epubFixture(): Buffer {
  const zip: any = new (AdmZip as any)(undefined, { noSort: true })
  zip.addFile('mimetype', Buffer.from('application/epub+zip'))
  zip.getEntry('mimetype').header.method = 0
  zip.addFile('META-INF/container.xml', Buffer.from('<container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>'))
  zip.addFile('OEBPS/content.opf', Buffer.from('<package><manifest><item id="c10" href="10.xhtml" media-type="application/xhtml+xml"/><item id="c11" href="11.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c10"/><itemref idref="c11"/></spine></package>'))
  zip.addFile('OEBPS/10.xhtml', Buffer.from('<html><body><h1>Chapter 10</h1><h2>The Chapel</h2><p>Ten body.</p></body></html>'))
  zip.addFile('OEBPS/11.xhtml', Buffer.from('<html><body><h1>Chapter 11</h1><h2>The Root</h2><p>Eleven body.</p></body></html>'))
  return zip.toBuffer()
}

test('EPUB, DOCX and TXT parsers produce stable ordered IDs', async () => {
  const docx = await Packer.toBuffer(new Document({ sections: [{ children: [
    new Paragraph({ text: 'Chapter 10', heading: HeadingLevel.HEADING_1 }), new Paragraph('Ten body.'),
    new Paragraph({ text: 'Chapter 11', heading: HeadingLevel.HEADING_1 }), new Paragraph('Eleven body.'),
  ] }] }))
  const documents = [
    parseSemanticEpub(epubFixture(), 'hash-epub'),
    await parseSemanticDocx(docx, 'hash-docx'),
    parseSemanticTxt('# Chapter 10\nTen body.\n# Chapter 11\nEleven body.', 'hash-txt'),
  ]
  for (const document of documents) {
    assert.deepEqual(document.nodes.map(node => node.id), document.nodes.map((_, index) => `node-${String(index + 1).padStart(6, '0')}`))
    assert.deepEqual(document.nodes.filter(node => node.headingLevel === 1).map(node => node.sourceChapterNumber), ['10', '11'])
  }
})

test('node output rejects missing, duplicate, unexpected and reordered IDs', () => {
  const document = parseSemanticTxt('# Chapter 10\nBody ten.\n# Chapter 11\nBody eleven.', 'hash')
  const input = createNodeTranslationInput(document.nodes)
  const valid = { ...input, nodes: input.nodes.map(node => ({ ...node, text: `FR:${node.text}` })) }
  const merged = validateAndMergeNodeOutput(document.nodes, valid)
  assert.equal(merged[0].sourceChapterNumber, '10')
  assert.equal(merged[2].sourceChapterNumber, '11')
  assert.throws(() => validateAndMergeNodeOutput(document.nodes, { ...valid, nodes: valid.nodes.slice(1) }), /does not match/)
  assert.throws(() => validateAndMergeNodeOutput(document.nodes, { ...valid, nodes: [valid.nodes[0], ...valid.nodes] }), /Duplicate/)
  assert.throws(() => validateAndMergeNodeOutput(document.nodes, { ...valid, nodes: [...valid.nodes].reverse() }), /reordered/)
  assert.throws(() => validateAndMergeNodeOutput(document.nodes, { ...valid, sourceFingerprint: 'stale' }), /fingerprint/)
  assert.throws(() => validateAndMergeNodeOutput(document.nodes, { ...valid, nodes: valid.nodes.map((node, index) => index ? node : { ...node, text: '' }) }), /empty/)
})

test('EPUB parser ignores XML attribute ordering and rejects package traversal', () => {
  const reordered: any = new AdmZip(epubFixture())
  reordered.updateFile('META-INF/container.xml', Buffer.from("<container><rootfiles><rootfile media-type='application/oebps-package+xml' full-path='OEBPS/content.opf'/></rootfiles></container>"))
  reordered.updateFile('OEBPS/content.opf', Buffer.from("<package><manifest><item media-type='application/xhtml+xml' href='10.xhtml' id='c10'/><item href='11.xhtml' media-type='application/xhtml+xml' id='c11'/></manifest><spine><itemref linear='yes' idref='c10'/><itemref idref='c11'/></spine></package>"))
  assert.equal(parseSemanticEpub(reordered.toBuffer(), 'hash').nodes.length, 6)
  reordered.updateFile('OEBPS/content.opf', Buffer.from("<package><manifest><item id='c10' href='../../escape.xhtml'/></manifest><spine><itemref idref='c10'/></spine></package>"))
  assert.throws(() => parseSemanticEpub(reordered.toBuffer(), 'hash'), /escapes package root/)
})

test('eligibility is explicit and never presents uncertain TXT as hardened eligible', () => {
  assert.equal(evaluateSemanticEligibility(parseSemanticEpub(epubFixture(), 'hash')).status, 'eligible')
  assert.equal(evaluateSemanticEligibility(parseSemanticTxt('# Chapter 1\nBody', 'hash')).status, 'review_required')
})

test('semantic build retry identity is deterministic and language/source-bound', () => {
  const first = deterministicSemanticBuildId('order', 'fr', 'source', 1)
  assert.equal(first, deterministicSemanticBuildId('order', 'fr', 'source', 1))
  assert.notEqual(first, deterministicSemanticBuildId('order', 'de', 'source', 1))
  assert.notEqual(first, deterministicSemanticBuildId('order', 'fr', 'source-2', 1))
})

test('semantic builders retain node order and produce structurally valid DOCX and EPUB', async () => {
  const pass1 = parseSemanticEpub(epubFixture(), 'hash')
  pass1.nodes.forEach(node => { node.translatedText = `P1 ${node.sourceText}` })
  const pass2 = structuredClone(pass1)
  pass2.nodes.forEach(node => { node.translatedText = `P2 ${node.sourceText}` })
  const pass1Docx = await buildSemanticDocx(pass1, 'Synthetic', 'pass1')
  const finalDocx = await buildSemanticDocx(pass2, 'Synthetic', 'final')
  const reviewDocx = await buildSemanticReviewDocx(pass1, pass2, 'Synthetic')
  assert.equal(validateArtifact(pass1Docx, 'docx').passed, true)
  assert.equal(validateArtifact(finalDocx, 'docx').passed, true)
  assert.equal(validateArtifact(reviewDocx, 'docx').passed, true)
  const epub = buildSemanticEpub(epubFixture(), pass2)
  const result = validateArtifact(epub, 'epub')
  assert.equal(result.passed, true, result.errors.map(error => error.message).join('; '))
  const outputZip: any = new AdmZip(epub)
  assert.match(outputZip.getEntry('OEBPS/11.xhtml')!.getData().toString(), /P2 Chapter 11/)
})

test('EPUB rebuild preserves inline semantics, links, attributes and anchors', () => {
  const zip: any = new AdmZip(epubFixture())
  zip.updateFile('OEBPS/10.xhtml', Buffer.from('<html><body><h1 id="chapter">Chapter <em>10</em></h1><p class="lead">A <strong>bold <i>nested</i></strong> sentence with <a href="#note" data-x="1">linked words</a> and H<sub>2</sub>O.<br/>Footnote<sup><a id="ref" href="#fn">1</a></sup></p></body></html>'))
  const doc = parseSemanticEpub(zip.toBuffer(),'inline-hash'); doc.nodes.forEach(node => { node.translatedText=`Traduit ${node.sourceText}` })
  const outputBytes = buildSemanticEpub(zip.toBuffer(),doc)
  const output: any = new AdmZip(outputBytes); const xml=output.getEntry('OEBPS/10.xhtml').getData().toString()
  for (const expected of ['<em>','<strong>','<i>','<a href="#note" data-x="1">','<sub>','<sup>','<br/>','id="ref"','href="#fn"','class="lead"']) assert.match(xml,new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')))
  const validation = validateArtifact(outputBytes,'epub')
  assert.equal(validation.passed,true,JSON.stringify(validation.errors))
})

test('EPUB rebuild ignores parser-omitted empty layout blocks', () => {
  const source:any=new AdmZip(epubFixture())
  source.updateFile('OEBPS/10.xhtml',Buffer.from('<html><body><h1>Chapter 10</h1><p>Ten body.</p><p><span> </span></p></body></html>'))
  const buffer=source.toBuffer(),document=parseSemanticEpub(buffer,'hash')
  document.nodes.forEach(node=>{node.translatedText=`T ${node.sourceText}`})
  assert.doesNotThrow(()=>buildSemanticEpub(buffer,document))
})

test('EPUB rebuild repacks output with readable entries and mimetype first', () => {
  const source: any = new AdmZip(epubFixture())
  const input = source.toBuffer()
  const document = parseSemanticEpub(input, 'descriptor-hash')
  document.nodes.forEach(node => { node.translatedText = `T ${node.sourceText}` })
  const output = buildSemanticEpub(input, document)
  assert.equal(validateArtifact(output, 'epub').passed, true)
  assert.equal(new AdmZip(output).getEntries()[0].entryName, 'mimetype')
})

test('EPUB image normalization converts TIFF assets and rewrites the manifest', async () => {
  const zip: any = new (AdmZip as any)(undefined, { noSort: true })
  zip.addFile('mimetype', Buffer.from('application/epub+zip')); zip.getEntry('mimetype').header.method = 0
  zip.addFile('META-INF/container.xml', Buffer.from('<container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>'))
  zip.addFile('OPS/book.opf', Buffer.from('<package><manifest><item id="c" href="c.xhtml" media-type="application/xhtml+xml"/><item id="img" href="media/picture.tiff" media-type="image/tiff"/></manifest><spine><itemref idref="c"/></spine></package>'))
  zip.addFile('OPS/c.xhtml', Buffer.from('<html><body><h1>Chapter 1</h1><p>Body.</p><img src="media/picture.tiff"/></body></html>'))
  zip.addFile('OPS/media/picture.tiff', await sharp({ create: { width: 2, height: 2, channels: 3, background: 'red' } }).tiff().toBuffer())
  assert.ok(validateArtifact(zip.toBuffer(), 'epub').errors.some(error => error.code === 'EPUB_NON_CORE_IMAGE'))
  const output = await normalizeEpubImages(zip.toBuffer()), normalized: any = new AdmZip(output)
  assert.equal(normalized.getEntry('OPS/media/picture.tiff'), null)
  assert.ok(normalized.getEntry('OPS/media/picture.png'))
  assert.match(normalized.getEntry('OPS/book.opf')!.getData().toString(), /picture\.png[^>]+image\/png/)
  assert.equal(validateArtifact(output, 'epub').passed, true)
})

test('DOCX semantic artifacts are byte-stable across immutable retries', async () => {
  const document = parseSemanticEpub(epubFixture(), 'stable-hash')
  document.nodes = document.nodes.map((node, index) => ({ ...node, translatedText: `Translated ${index}` }))
  const first = await buildSemanticDocx(document, 'Stable', 'final')
  await new Promise(resolve => setTimeout(resolve, 10))
  const second = await buildSemanticDocx(document, 'Stable', 'final')
  assert.deepEqual(first, second)
})

test('chapter map is one-to-one and emits CSV and DOCX', async () => {
  const document = parseSemanticTxt('# Chapter 10\nBody ten.\n# Chapter 11\nBody eleven.', 'hash')
  document.nodes.forEach(node => { node.translatedText = node.sourceText.replace('Chapter', 'Chapitre') })
  const rows = buildChapterMap(document)
  assert.deepEqual(rows.map(row => row.sourceChapterNumber), ['10', '11'])
  assert.match(renderChapterMapCsv(rows), /Chapitre 11/)
  assert.ok((await renderChapterMapDocx(rows)).length > 0)
})

test('split chapter headings become one EPUB nav, DOCX TOC, and Chapter Map entry',async()=>{
  const zip:any=new (AdmZip as any)(undefined,{noSort:true})
  zip.addFile('mimetype',Buffer.from('application/epub+zip'));zip.getEntry('mimetype').header.method=0
  zip.addFile('META-INF/container.xml',Buffer.from('<container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>'))
  zip.addFile('OPS/book.opf',Buffer.from('<package><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Book</dc:title><dc:language>en</dc:language><dc:creator>Wrong Customer</dc:creator><dc:identifier>old</dc:identifier></metadata><manifest><item id="b" href="b.xhtml" media-type="application/xhtml+xml"/><item id="n" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/></manifest><spine><itemref idref="b"/></spine></package>'))
  zip.addFile('OPS/b.xhtml',Buffer.from('<html><body><p>About the Author</p><p>Cari Rhys-Owen</p><p>Table of Contents</p><p>Chapter 1:</p><p>Understanding</p><h1>Chapter 1:</h1><p>Understanding</p><h1>Your Body\'s Natural Aging Systems</h1><p>Body.</p></body></html>'))
  zip.addFile('OPS/nav.xhtml',Buffer.from('<html><body><nav><ol><li><a href="b.xhtml#c1">Chapter 1:</a></li><li><a href="b.xhtml#c2">Understanding</a></li><li><a href="b.xhtml#c3">Your Body\'s Natural Aging Systems</a></li></ol></nav></body></html>'))
  const source=zip.toBuffer(),doc=parseSemanticEpub(source,'split');doc.nodes.forEach(node=>{node.translatedText=({
    'About the Author':'Über die Autorin','Table of Contents':'Inhaltsverzeichnis','Chapter 1:':'Kapitel 1:','Understanding':'Verständnis der',"Your Body's Natural Aging Systems":'natürlichen Alterungssysteme Ihres Körpers'
  } as Record<string,string>)[node.sourceText]||node.sourceText})
  const rows=buildChapterMap(doc);assert.equal(rows.length,1);assert.equal(rows[0].translatedTitle,'Kapitel 1: Verständnis der natürlichen Alterungssysteme Ihres Körpers')
  assert.equal(consolidatedArtifactNodes(doc).filter(node=>node.type==='heading').length,1)
  assert.equal(resolveBookAuthor(doc,'Tina Vaughan / Cari Rhys-Owen'),'Cari Rhys-Owen')
  const epub=buildSemanticEpub(source,doc,{sourceKind:'epub_metadata',sourceValue:'Book',translatedValue:'Buch',effectiveValue:'Buch',confidence:'verified',fallbackUsed:false},'de','Tina Vaughan / Cari Rhys-Owen','edition')
  const output:any=new AdmZip(epub),nav=output.getEntry('OPS/nav.xhtml').getData().toString(),opf=output.getEntry('OPS/book.opf').getData().toString(),body=output.getEntry('OPS/b.xhtml').getData().toString()
  assert.equal((nav.match(/<li\b/g)||[]).length,1);assert.match(nav,/Kapitel 1: Verständnis der natürlichen Alterungssysteme Ihres Körpers/)
  assert.equal((body.match(/<h1\b/g)||[]).length,1);assert.match(opf,/<dc:creator>Cari Rhys-Owen<\/dc:creator>/)
  const docx:any=new AdmZip(await buildSemanticDocx(doc,'Buch','final')),xml=docx.getEntry('word/document.xml').getData().toString()
  assert.equal((xml.match(/Kapitel 1:/g)||[]).length,2);assert.match(xml,/Kapitel 1: Verständnis der natürlichen Alterungssysteme Ihres Körpers/)
})

test('EPUB customer gate blocks wrong metadata, untranslated nav, and missing content headings',()=>{
  const zip:any=new AdmZip();zip.addFile('mimetype',Buffer.from('application/epub+zip'));zip.getEntry('mimetype').header.method=0
  zip.addFile('META-INF/container.xml',Buffer.from('<container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>'))
  zip.addFile('OPS/book.opf',Buffer.from('<package><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Title</dc:title><dc:language>en-GB</dc:language><dc:identifier>same</dc:identifier></metadata><manifest><item id="b" href="b.xhtml" media-type="application/xhtml+xml"/><item id="n" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/></manifest><spine><itemref idref="b"/></spine></package>'))
  zip.addFile('OPS/b.xhtml',Buffer.from('<html><body><p>Body only</p></body></html>'));zip.addFile('OPS/nav.xhtml',Buffer.from('<html><body><a href="b.xhtml">Chapter 1</a></body></html>'))
  const result=validateArtifact(zip.toBuffer(),'epub',{expectedLanguage:'de'})
  for(const code of ['EPUB_LANGUAGE','EPUB_CREATOR','EPUB_NAV_CONTENT_UNVERIFIABLE','EPUB_NAV_WRONG_LANGUAGE'])assert.ok(result.errors.some(error=>error.code===code),code)
})

test('customer gate blocks double-escaped visible entities',()=>{
  const doc:any=new AdmZip();
  return Packer.toBuffer(new Document({sections:[{children:[new Paragraph('A &quot;broken&quot; line')]}]})).then(bytes=>{
    const result=validateArtifact(Buffer.from(bytes),'docx')
    assert.ok(result.errors.some(error=>['VISIBLE_ESCAPED_ENTITY','DOUBLE_ESCAPED_ENTITY'].includes(error.code)))
  })
})

test('dual-format EPUB is generated directly from authoritative semantic nodes', () => {
  const doc: any={schemaVersion:'2.0',sourceHash:'hash',sourceFormat:'docx',parserConfidence:1,nodes:[{id:'h',chapterId:'c',type:'heading',headingLevel:1,sourceChapterNumber:'1',sourceText:'Chapter 1',translatedText:'Chapitre 1',order:0,sourceLocation:'x'},{id:'p',chapterId:'c',type:'paragraph',headingLevel:null,sourceChapterNumber:null,sourceText:'Hello',translatedText:'Bonjour',order:1,sourceLocation:'y'}]}
  assert.equal(validateArtifact(buildSemanticEpubFromDocument(doc,'Synthetic'),'epub').passed,true)
})

test('semantic canary activation is explicit and never selects legacy orders', () => {
  const g=process.env.PIPELINE_VERSION,c=process.env.SEMANTIC_V2_CANARY_ORDER_IDS
  process.env.PIPELINE_VERSION='legacy-v1'; process.env.SEMANTIC_V2_CANARY_ORDER_IDS='canary-1'
  assert.equal(semanticV2AllowedForOrder('canary-1','semantic-v2'),true); assert.equal(semanticV2AllowedForOrder('other','semantic-v2'),false); assert.equal(semanticV2AllowedForOrder('canary-1','legacy-v1'),false)
  g===undefined?delete process.env.PIPELINE_VERSION:process.env.PIPELINE_VERSION=g; c===undefined?delete process.env.SEMANTIC_V2_CANARY_ORDER_IDS:process.env.SEMANTIC_V2_CANARY_ORDER_IDS=c
})

/** InDesign, Vellum, Atticus and Word exports mark headings with styled paragraphs, not <h> tags. */
function styledParagraphEpub(): Buffer {
  const zip: any = new (AdmZip as any)(undefined, { noSort: true })
  zip.addFile('mimetype', Buffer.from('application/epub+zip'))
  zip.getEntry('mimetype').header.method = 0
  zip.addFile('META-INF/container.xml', Buffer.from('<container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>'))
  zip.addFile('OEBPS/content.opf', Buffer.from('<package><manifest><item id="c1" href="1.xhtml" media-type="application/xhtml+xml"/><item id="css" href="s.css" media-type="text/css"/></manifest><spine><itemref idref="c1"/></spine></package>'))
  zip.addFile('OEBPS/s.css', Buffer.from('.Chap-heading{font-size:2.667em}.Heading{font-size:1.5em}.Sub-haeding{font-size:1em}.Pull-quote{font-size:0.792em}.Body-text{font-size:0.792em}'))
  const body = Array.from({ length: 60 }, (_, index) => `<p class="Body-text">Body sentence number ${index + 1}.</p>`).join('')
  zip.addFile('OEBPS/1.xhtml', Buffer.from(`<html><body><p class="Chap-heading">Chapter One</p><p class="Heading">A Section</p><p class="Sub-haeding">A Subsection</p><p class="Pull-quote">quoted fragment carried over</p>${body}</body></html>`))
  return zip.toBuffer()
}

test('styled-paragraph headings are recovered with levels and pull quotes are not promoted', () => {
  const parsed = parseSemanticEpub(styledParagraphEpub(), 'hash')
  const headings = parsed.nodes.filter(node => node.type === 'heading')
  assert.deepEqual(headings.map(node => [node.sourceText, node.headingLevel]), [
    ['Chapter One', 1],
    ['A Section', 2],
    ['A Subsection', 3],
  ])
  // Body-sized text stays body text however it is styled or named.
  assert.equal(parsed.nodes.find(node => node.sourceText.startsWith('quoted'))?.type, 'paragraph')
})

test('parser confidence reflects structure that was actually found, not an assumption', () => {
  assert.ok(parseSemanticEpub(styledParagraphEpub(), 'hash').parserConfidence >= 0.9)
  const flat: any = new AdmZip(styledParagraphEpub())
  const stripped = flat.getEntry('OEBPS/1.xhtml').getData().toString('utf8').replace(/class="(Chap-heading|Heading|Sub-haeding)"/g, 'class="Body-text"')
  flat.updateFile('OEBPS/1.xhtml', Buffer.from(stripped))
  // A book whose structure could not be recovered must not claim high confidence.
  assert.equal(parseSemanticEpub(flat.toBuffer(), 'hash').parserConfidence, 0.3)
})
