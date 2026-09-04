import test from 'node:test'
import assert from 'node:assert/strict'
import AdmZip from 'adm-zip'
import { Document, HeadingLevel, Packer, Paragraph } from 'docx'
import { validateArtifact, validateExpectedChapterSequence } from '../lib/artifact-validation-v2'

function syntheticEpub(chapters: Array<{ heading: string; body: string }>): Buffer {
  const zip: any = new (AdmZip as any)(undefined, { noSort: true })
  zip.addFile('mimetype', Buffer.from('application/epub+zip'))
  zip.getEntry('mimetype').header.method = 0
  zip.addFile('META-INF/container.xml', Buffer.from(`<container><rootfiles><rootfile media-type="application/oebps-package+xml" full-path="OEBPS/content.opf"/></rootfiles></container>`))
  const manifest = chapters.map((_, index) => `<item media-type="application/xhtml+xml" href="chapter-${index + 1}.xhtml" id="c${index + 1}"/>`).join('')
  const spine = chapters.map((_, index) => `<itemref linear="yes" idref="c${index + 1}"/>`).join('')
  zip.addFile('OEBPS/content.opf', Buffer.from(`<package><manifest>${manifest}<item id="nav" properties="nav" href="nav.xhtml" media-type="application/xhtml+xml"/><item href="toc.ncx" media-type="application/x-dtbncx+xml" id="ncx"/></manifest><spine toc="ncx">${spine}</spine></package>`))
  zip.addFile('OEBPS/nav.xhtml', Buffer.from(`<html><body><nav><h1>Contents</h1>${chapters.map(c => `<a>${c.heading}</a>`).join('')}</nav></body></html>`))
  zip.addFile('OEBPS/toc.ncx', Buffer.from('<ncx><navMap/></ncx>'))
  chapters.forEach((chapter, index) => {
    zip.addFile(`OEBPS/chapter-${index + 1}.xhtml`, Buffer.from(`<html><body><h1>${chapter.heading}</h1><p>${chapter.body}</p></body></html>`))
  })
  return zip.toBuffer()
}

async function syntheticDocx(chapters: Array<{ heading: string; body: string }>): Promise<Buffer> {
  const children = chapters.flatMap(chapter => [
    new Paragraph({ text: chapter.heading, heading: HeadingLevel.HEADING_1 }),
    new Paragraph(chapter.body),
  ])
  return Packer.toBuffer(new Document({ sections: [{ children }] }))
}

test('known-good EPUB and DOCX preserve Chapter 10/11 sequence', async () => {
  const fixture = [
    { heading: 'Chapter 10', body: 'A short synthetic body for chapter ten.' },
    { heading: 'Chapter 11', body: 'A short synthetic body for chapter eleven.' },
  ]
  for (const [kind, buffer] of [['epub', syntheticEpub(fixture)], ['docx', await syntheticDocx(fixture)]] as const) {
    const result = validateExpectedChapterSequence(validateArtifact(buffer, kind), ['10', '11'])
    assert.equal(result.passed, true, JSON.stringify(result.errors))
    if (kind === 'epub') assert.deepEqual(result.metrics.navigationHeadings, ['Chapter 10', 'Chapter 11'])
  }
})

test('EPUB navigation headings are not counted as content chapters', () => {
  const result = validateExpectedChapterSequence(validateArtifact(syntheticEpub([
    { heading: 'Chapter 1', body: 'Body one.' }, { heading: 'Chapter 2', body: 'Body two.' },
  ]), 'epub'), ['1', '2'])
  assert.equal(result.passed, true, JSON.stringify(result.errors))
})

test('empty chapter and Roman/Arabic duplicate identity fail', () => {
  const empty = validateArtifact(syntheticEpub([{ heading: 'Chapter I', body: '' }]), 'epub')
  assert.ok(empty.errors.some(issue => issue.code === 'EMPTY_CHAPTER'))
  const duplicate = validateArtifact(syntheticEpub([
    { heading: 'Chapter I', body: 'One.' }, { heading: 'Chapter 1', body: 'Duplicate one.' },
  ]), 'epub')
  assert.ok(duplicate.errors.some(issue => issue.code === 'DUPLICATE_CHAPTER_NUMBER'))
})

test('nested namespaced EPUB resolves attribute-independent manifest and validates nav parity', () => {
  const zip: any = new (AdmZip as any)(undefined, { noSort: true })
  zip.addFile('mimetype', Buffer.from('application/epub+zip'))
  zip.getEntry('mimetype').header.method = 0
  zip.addFile('META-INF/container.xml', Buffer.from(`<c:container xmlns:c="urn:oasis:names:tc:opendocument:xmlns:container"><c:rootfiles><c:rootfile full-path="OPS/package/book.opf" media-type="application/oebps-package+xml"/></c:rootfiles></c:container>`))
  zip.addFile('OPS/package/book.opf', Buffer.from(`<opf:package xmlns:opf="http://www.idpf.org/2007/opf"><opf:manifest><opf:item href="../Text/chapter.xhtml" id="chapter" media-type="application/xhtml+xml"/><opf:item properties="nav" media-type="application/xhtml+xml" id="nav" href="../Nav/nav.xhtml"/></opf:manifest><opf:spine><opf:itemref idref="chapter"/></opf:spine></opf:package>`))
  zip.addFile('OPS/Text/chapter.xhtml', Buffer.from(`<x:html xmlns:x="http://www.w3.org/1999/xhtml"><x:body><x:h1>Chapter XI</x:h1><x:p>Body.</x:p></x:body></x:html>`))
  zip.addFile('OPS/Nav/nav.xhtml', Buffer.from(`<html><body><nav><a href="../Text/chapter.xhtml">Chapter 11</a></nav></body></html>`))
  const result = validateExpectedChapterSequence(validateArtifact(zip.toBuffer(), 'epub'), ['11'])
  assert.equal(result.passed, true, JSON.stringify(result.errors))
})

test('EPUB navigation mismatch and malformed spine fail', () => {
  const zip: any = new AdmZip()
  zip.addFile('mimetype', Buffer.from('application/epub+zip'))
  zip.addFile('META-INF/container.xml', Buffer.from(`<container><rootfile full-path="OEBPS/content.opf"/></container>`))
  zip.addFile('OEBPS/content.opf', Buffer.from(`<package><manifest><item id="c" href="c.xhtml" media-type="application/xhtml+xml"/><item id="n" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/></manifest><spine><itemref idref="c"/><itemref idref="missing"/></spine></package>`))
  zip.addFile('OEBPS/c.xhtml', Buffer.from(`<html><body><h1>Chapter 1</h1><p>Body.</p></body></html>`))
  zip.addFile('OEBPS/nav.xhtml', Buffer.from(`<html><body><a>Chapter 2</a></body></html>`))
  const codes = validateArtifact(zip.toBuffer(), 'epub').errors.map(e => e.code)
  assert.ok(codes.includes('EPUB_SPINE_ITEM'))
  assert.ok(codes.includes('EPUB_NAV_MISMATCH'))
})

test('styled-paragraph EPUB navigation fails closed when semantic headings cannot be verified', () => {
  const zip: any = new AdmZip()
  zip.addFile('mimetype', Buffer.from('application/epub+zip'))
  zip.addFile('META-INF/container.xml', Buffer.from(`<container><rootfile full-path="OEBPS/content.opf"/></container>`))
  zip.addFile('OEBPS/content.opf', Buffer.from(`<package><manifest><item id="c" href="c.xhtml" media-type="application/xhtml+xml"/><item id="n" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/></manifest><spine><itemref idref="c"/></spine></package>`))
  zip.addFile('OEBPS/c.xhtml', Buffer.from(`<html><body><p class="chapter-title">Capítulo 1</p><p>Body.</p></body></html>`))
  zip.addFile('OEBPS/nav.xhtml', Buffer.from(`<html><body><nav><a href="c.xhtml">Chapter 1</a></nav></body></html>`))
  const result = validateArtifact(zip.toBuffer(), 'epub')
  assert.equal(result.passed, false)
  assert.ok(result.errors.some(issue => issue.code === 'EPUB_NAV_CONTENT_UNVERIFIABLE'))
})

test('DOCX reconstructs markers and markdown split across runs and validates relationships', () => {
  const zip: any = new AdmZip()
  zip.addFile('[Content_Types].xml', Buffer.from(`<Types><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`))
  zip.addFile('_rels/.rels', Buffer.from(`<Relationships><Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`))
  zip.addFile('word/_rels/document.xml.rels', Buffer.from('<Relationships/>'))
  zip.addFile('word/document.xml', Buffer.from(`<w:document xmlns:w="urn:w"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Chapter 1</w:t></w:r></w:p><w:p><w:r><w:t>===SEG</w:t></w:r><w:r><w:t>MENT===</w:t></w:r></w:p><w:p><w:r><w:t>#</w:t></w:r><w:r><w:t> Visible markdown</w:t></w:r></w:p></w:body></w:document>`))
  const codes = validateArtifact(zip.toBuffer(), 'docx').errors.map(e => e.code)
  assert.ok(codes.includes('LEAKED_MARKER'))
  assert.ok(codes.includes('VISIBLE_MARKDOWN'))
})

test('DOCX missing declared document relationship fails', () => {
  const zip: any = new AdmZip()
  zip.addFile('[Content_Types].xml', Buffer.from(`<Types><Override PartName="/word/document.xml"/></Types>`))
  zip.addFile('_rels/.rels', Buffer.from('<Relationships/>'))
  zip.addFile('word/_rels/document.xml.rels', Buffer.from('<Relationships/>'))
  zip.addFile('word/document.xml', Buffer.from('<w:document><w:body/></w:document>'))
  assert.ok(validateArtifact(zip.toBuffer(), 'docx').errors.some(e => e.code === 'DOCX_RELATIONSHIPS'))
})

test('missing and duplicate chapter numbers hard-fail', () => {
  const missing = validateExpectedChapterSequence(validateArtifact(syntheticEpub([
    { heading: 'Chapter 10', body: 'Ten.' },
    { heading: 'Chapter 12', body: 'Twelve.' },
  ]), 'epub'), ['10', '11', '12'])
  assert.ok(missing.errors.some(issue => issue.code === 'CHAPTER_SEQUENCE_MISMATCH'))

  const duplicate = validateArtifact(syntheticEpub([
    { heading: 'Chapter 10', body: 'Ten.' },
    { heading: 'Chapter 10', body: 'Eleven with the wrong number.' },
  ]), 'epub')
  assert.ok(duplicate.errors.some(issue => issue.code === 'DUPLICATE_CHAPTER_NUMBER'))
})

test('leaked markers, markdown and substantial duplicate content hard-fail', () => {
  const repeated = 'This is deliberately long synthetic prose used to verify substantial duplicate detection without using any customer manuscript content. '.repeat(2)
  const result = validateArtifact(syntheticEpub([
    { heading: 'Chapter 1', body: `===SEGMENT===\n# Visible markdown</p><p>${repeated}` },
    { heading: 'Chapter 2', body: repeated },
  ]), 'epub')
  const codes = result.errors.map(issue => issue.code)
  assert.ok(codes.includes('LEAKED_MARKER'))
  assert.ok(codes.includes('VISIBLE_MARKDOWN'))
  assert.ok(codes.includes('DUPLICATE_CONTENT'))
})

test('corrupt and empty EPUB/DOCX hard-fail', () => {
  for (const kind of ['epub', 'docx'] as const) {
    assert.equal(validateArtifact(Buffer.alloc(0), kind).passed, false)
    assert.ok(validateArtifact(Buffer.from('not a zip'), kind).errors.some(issue => issue.code === 'CORRUPT_PACKAGE'))
  }
})
