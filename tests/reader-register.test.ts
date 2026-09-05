import test from 'node:test'
import assert from 'node:assert/strict'
import {
  defaultReaderRegister, languageHasReaderRegister, readerRegisterFromBrief,
  readerRegisterPromptLine, readerRegisterViolations, resolveReaderRegister,
} from '../lib/reader-register'

test('self-help defaults to formal and fiction to informal, per language', () => {
  assert.equal(defaultReaderRegister('Self-Help', 'de'), 'formal')
  assert.equal(defaultReaderRegister('Health & Wellness', 'de'), 'formal')
  assert.equal(defaultReaderRegister('Romance', 'de'), 'informal')
  assert.equal(defaultReaderRegister('Romantasy', 'fr'), 'informal')
  // Brazilian Portuguese addresses the reader as você whatever the genre.
  assert.equal(defaultReaderRegister('Romance', 'pt-br'), 'formal')
  // An order with no genre still resolves; there is no unset state.
  assert.equal(defaultReaderRegister(undefined, 'de'), 'formal')
})

test('the author decision on the brief beats the genre default, including legacy spellings', () => {
  const brief = { items: [{ id: 'reader-register', issueType: 'reader_register', authorDecision: 'formal_sie' }] }
  assert.equal(readerRegisterFromBrief(brief), 'formal')
  assert.equal(resolveReaderRegister({ brief, genre: 'Romance', language: 'de' }), 'formal')
  const informal = { items: [{ id: 'reader-register', issueType: 'reader_register', authorDecision: 'informal_address' }] }
  assert.equal(resolveReaderRegister({ brief: informal, genre: 'Self-Help', language: 'de' }), 'informal')
  // Tina's brief carried no register item at all, which is what let German drift.
  assert.equal(readerRegisterFromBrief({ items: [{ id: 'brief-1', issueType: 'country_specific', authorDecision: 'keep' }] }), undefined)
})

test('the register instruction names both the required and the forbidden forms', () => {
  const german = readerRegisterPromptLine('de', 'formal')
  assert.match(german, /Sie\/Ihnen\/Ihr/)
  assert.match(german, /Never use du\/dich\/dir\/dein/)
  assert.match(german, /headings/)
  assert.equal(readerRegisterPromptLine('ja', 'formal'), '')
})

test('German du-forms are reported in a formal book and Sie-forms in an informal one', () => {
  const drift = 'Erobern Sie Ihre Langlebigkeit zurück. Beginne damit, deine Spaziergänge einzubauen.'
  const violations = readerRegisterViolations(drift, 'de', 'formal')
  assert.deepEqual(violations.map(item => item.form.toLowerCase()), ['deine'])
  assert.match(violations[0].excerpt, /Spaziergänge/)
  // Clean formal text reports nothing.
  assert.equal(readerRegisterViolations('Erobern Sie Ihre Langlebigkeit zurück.', 'de', 'formal').length, 0)
  // "sie" as she/they must not be read as formal address in an informal book.
  assert.equal(readerRegisterViolations('Sie ging nach Hause, und sie blieben dort.', 'de', 'informal').length, 0)
  assert.ok(readerRegisterViolations('Bitte prüfen Sie Ihre Notizen.', 'de', 'informal').length > 0)
})

test('French, Spanish and Portuguese violations follow the same rule', () => {
  assert.equal(readerRegisterViolations('Vous pouvez commencer votre marche.', 'fr', 'formal').length, 0)
  assert.ok(readerRegisterViolations('Commence ta marche.', 'fr', 'formal').length > 0)
  assert.ok(readerRegisterViolations('Empieza tu caminata.', 'es-es', 'formal').length > 0)
  assert.ok(readerRegisterViolations('Comece a tua caminhada.', 'pt-br', 'formal').length > 0)
  assert.equal(readerRegisterViolations('Comece a sua caminhada.', 'pt-br', 'formal').length, 0)
  assert.equal(languageHasReaderRegister('en'), false)
  assert.equal(languageHasReaderRegister('pt-br'), true)
})
