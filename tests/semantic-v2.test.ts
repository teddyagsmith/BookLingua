import test from 'node:test'
import assert from 'node:assert/strict'
import AdmZip from 'adm-zip'
import { Document, HeadingLevel, Packer, Paragraph } from 'docx'
import { parseSemanticDocx, parseSemanticEpub, parseSemanticTxt } from '../lib/semantic-parser'
import { createNodeTranslationInput, validateAndMergeNodeOutput } from '../lib/node-translation-contract'
import { buildChapterMap, renderChapterMapCsv, renderChapterMapDocx } from '../lib/chapter-map'

function epubFixture(): Buffer {
  const zip: any = new AdmZip()
  zip.addFile('mimetype', Buffer.from('application/epub+zip'))
  zip.addFile('META-INF/container.xml', Buffer.from('<container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>'))
  zip.addFile('OEBPS/content.opf', Buffer.from('<package><manifest><item id="c10" href="10.xhtml"/><item id="c11" href="11.xhtml"/></manifest><spine><itemref idref="c10"/><itemref idref="c11"/></spine></package>'))
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
})

test('chapter map is one-to-one and emits CSV and DOCX', async () => {
  const document = parseSemanticTxt('# Chapter 10\nBody ten.\n# Chapter 11\nBody eleven.', 'hash')
  document.nodes.forEach(node => { node.translatedText = node.sourceText.replace('Chapter', 'Chapitre') })
  const rows = buildChapterMap(document)
  assert.deepEqual(rows.map(row => row.sourceChapterNumber), ['10', '11'])
  assert.match(renderChapterMapCsv(rows), /Chapitre 11/)
  assert.ok((await renderChapterMapDocx(rows)).length > 0)
})
