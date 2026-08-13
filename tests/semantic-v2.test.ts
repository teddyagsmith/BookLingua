import test from 'node:test'
import assert from 'node:assert/strict'
import AdmZip from 'adm-zip'
import { Document, HeadingLevel, Packer, Paragraph } from 'docx'
import { parseSemanticDocx, parseSemanticEpub, parseSemanticTxt } from '../lib/semantic-parser'
import { createNodeTranslationInput, validateAndMergeNodeOutput } from '../lib/node-translation-contract'
import { buildChapterMap, renderChapterMapCsv, renderChapterMapDocx } from '../lib/chapter-map'
import { evaluateSemanticEligibility } from '../lib/semantic-document'
import { buildSemanticDocx, buildSemanticEpub, buildSemanticEpubFromDocument, buildSemanticReviewDocx } from '../lib/semantic-artifacts'
import { validateArtifact } from '../lib/artifact-validation-v2'
import { deterministicSemanticBuildId } from '../lib/semantic-pipeline'
import { semanticV2AllowedForOrder } from '../lib/semantic-canary'

function epubFixture(): Buffer {
  const zip: any = new AdmZip()
  zip.addFile('mimetype', Buffer.from('application/epub+zip'))
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
  const output: any = new AdmZip(buildSemanticEpub(zip.toBuffer(),doc)); const xml=output.getEntry('OEBPS/10.xhtml').getData().toString()
  for (const expected of ['<em>','<strong>','<i>','<a href="#note" data-x="1">','<sub>','<sup>','<br/>','id="ref"','href="#fn"','class="lead"']) assert.match(xml,new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')))
  assert.equal(validateArtifact(output.toBuffer(),'epub').passed,true)
})

test('chapter map is one-to-one and emits CSV and DOCX', async () => {
  const document = parseSemanticTxt('# Chapter 10\nBody ten.\n# Chapter 11\nBody eleven.', 'hash')
  document.nodes.forEach(node => { node.translatedText = node.sourceText.replace('Chapter', 'Chapitre') })
  const rows = buildChapterMap(document)
  assert.deepEqual(rows.map(row => row.sourceChapterNumber), ['10', '11'])
  assert.match(renderChapterMapCsv(rows), /Chapitre 11/)
  assert.ok((await renderChapterMapDocx(rows)).length > 0)
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
