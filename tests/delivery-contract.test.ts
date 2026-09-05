import test from 'node:test'
import assert from 'node:assert/strict'
import AdmZip from 'adm-zip'
import {
  checkCrossLanguageParity, checkDeliveredDocx, checkUploadedObject,
  describeFailures, inspectDeliveredDocx,
} from '../lib/delivery-contract'

/** A minimal DOCX shaped like the ones this pipeline delivers. */
function docx(options: {
  paragraphs?: number; headings?: number; italic?: number; superscript?: number
  defaultStyle?: boolean; text?: string
} = {}): Buffer {
  const headings = options.headings ?? 2
  const paragraphs = options.paragraphs ?? 4
  const body = [
    ...Array.from({ length: headings }, (_, index) => `<w:p ><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Kapitel ${index + 1}</w:t></w:r></w:p>`),
    ...Array.from({ length: paragraphs - headings }, () => `<w:p ><w:pPr><w:pStyle w:val="ListParagraph"/></w:pPr><w:r><w:t>${options.text ?? 'Erobern Sie Ihre Langlebigkeit.'}</w:t></w:r></w:p>`),
    ...Array.from({ length: options.italic ?? 2 }, () => '<w:p ><w:r><w:rPr><w:i/></w:rPr><w:t>kursiv</w:t></w:r></w:p>'),
    ...Array.from({ length: options.superscript ?? 3 }, () => '<w:p ><w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:t>1</w:t></w:r></w:p>'),
  ].join('')
  const zip: any = new AdmZip()
  zip.addFile('word/document.xml', Buffer.from(`<?xml version="1.0"?><w:document><w:body>${body}</w:body></w:document>`))
  zip.addFile('word/styles.xml', Buffer.from(options.defaultStyle === false
    ? '<w:styles><w:style w:styleId="Heading1"><w:basedOn w:val="Normal"/></w:style></w:styles>'
    : '<w:styles><w:style w:default="1" w:styleId="Normal"/><w:style w:styleId="Heading1"><w:basedOn w:val="Normal"/></w:style></w:styles>'))
  return zip.toBuffer()
}

const expectation = {
  language: 'de',
  readerRegister: 'formal' as const,
  styles: { Heading1: 2 },
  paragraphs: 9,
  emphasis: { italic: 2, bold: 0, superscript: 3 },
}

test('a delivered file that matches the contract raises nothing', () => {
  assert.deepEqual(checkDeliveredDocx(inspectDeliveredDocx(docx()), expectation), [])
})

test('a document with no default style fails, because Pages renders it as one style', () => {
  const failures = checkDeliveredDocx(inspectDeliveredDocx(docx({ defaultStyle: false })), expectation)
  assert.deepEqual(failures.map(failure => failure.code), ['NO_DEFAULT_STYLE'])
})

test('lost headings and lost emphasis are separate failures, not warnings', () => {
  const lostHeadings = checkDeliveredDocx(inspectDeliveredDocx(docx({ headings: 0 })), expectation)
  assert.ok(lostHeadings.some(failure => failure.code === 'HEADING_COUNT'))
  const lostEmphasis = checkDeliveredDocx(inspectDeliveredDocx(docx({ italic: 0, superscript: 0 })), expectation)
  assert.equal(lostEmphasis.filter(failure => failure.code === 'EMPHASIS_MISSING').length, 2)
  assert.match(describeFailures(lostEmphasis), /delivered none/)
})

test('the whitespace and apostrophe corruptions that shipped are caught in the delivered text', () => {
  const spaced = checkDeliveredDocx(inspectDeliveredDocx(docx({ text: 'Sie haben es geglaubt .' })), expectation)
  assert.ok(spaced.some(failure => failure.code === 'SPACED_PUNCTUATION'))
  const straight = checkDeliveredDocx(inspectDeliveredDocx(docx({ text: "Vous n'avez rien fait" })), { ...expectation, language: 'fr' })
  assert.ok(straight.some(failure => failure.code === 'ASCII_APOSTROPHE'))
})

test('register drift fails the delivered German file', () => {
  const failures = checkDeliveredDocx(inspectDeliveredDocx(docx({ text: 'Beginne damit, deine Spaziergänge einzubauen.' })), expectation)
  const register = failures.find(failure => failure.code === 'READER_REGISTER')
  assert.ok(register, 'expected a register failure')
  assert.match(register!.detail, /wrong form of address for a formal book/)
})

test('languages of one order must be structurally the same book', () => {
  const base = inspectDeliveredDocx(docx())
  assert.deepEqual(checkCrossLanguageParity({ fr: base, de: inspectDeliveredDocx(docx()) }), [])
  const failures = checkCrossLanguageParity({ fr: base, de: inspectDeliveredDocx(docx({ headings: 1, paragraphs: 8 })) })
  assert.ok(failures.some(failure => failure.code === 'PARITY_PARAGRAPHS'))
  assert.ok(failures.some(failure => failure.code === 'PARITY_STYLES'))
})

test('an upload that never reached storage cannot report success', () => {
  const sent = Buffer.from('replacement bytes')
  const previous = { fileId: 'drive-1', sizeBytes: 137070, modifiedTime: '2026-09-05T13:19:21Z' }
  // Exactly the 14:20 case: the provider is still serving the object from 13:19.
  const stale = checkUploadedObject(sent, previous, previous)
  assert.ok(stale.some(failure => failure.code === 'UPLOAD_NOT_APPLIED'))
  assert.ok(stale.some(failure => failure.code === 'UPLOAD_SIZE'))
  const applied = checkUploadedObject(sent, { fileId: 'drive-1', sizeBytes: sent.length, modifiedTime: '2026-09-05T16:02:00Z' }, previous)
  assert.deepEqual(applied, [])
})
