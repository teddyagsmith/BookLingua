import test from 'node:test'
import assert from 'node:assert/strict'
import AdmZip from 'adm-zip'
import { Document, HeadingLevel, Packer, Paragraph } from 'docx'
import { validateArtifact, validateExpectedChapterSequence } from '../lib/artifact-validation-v2'

function syntheticEpub(chapters: Array<{ heading: string; body: string }>): Buffer {
  const zip: any = new AdmZip()
  zip.addFile('mimetype', Buffer.from('application/epub+zip'))
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
    if (kind === 'epub') assert.deepEqual(result.metrics.navigationHeadings, ['Contents'])
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
