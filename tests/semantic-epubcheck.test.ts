import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildSemanticEpubFromDocument } from '../lib/semantic-artifacts'

const epubcheckJar = process.env.EPUBCHECK_JAR

test('from-scratch semantic EPUB passes the pinned EPUBCheck 5.1.0 runtime', { skip: !epubcheckJar }, () => {
  const document: any = {
    schemaVersion: '2.0', sourceHash: 'semantic-epubcheck-fixture', sourceFormat: 'docx', parserConfidence: 1,
    nodes: [
      { id: 'h1', chapterId: '1', type: 'heading', headingLevel: 1, sourceChapterNumber: '1', sourceText: 'Chapter 1', translatedText: 'Kapitel 1', order: 0, sourceLocation: 'fixture:1' },
      { id: 'p1', chapterId: '1', type: 'paragraph', headingLevel: null, sourceChapterNumber: null, sourceText: 'Body', translatedText: 'Ein Absatz.', order: 1, sourceLocation: 'fixture:2' },
      { id: 'h2', chapterId: '2', type: 'heading', headingLevel: 1, sourceChapterNumber: '2', sourceText: 'Chapter 2', translatedText: 'Kapitel 2', order: 2, sourceLocation: 'fixture:3' },
      { id: 'p2', chapterId: '2', type: 'paragraph', headingLevel: null, sourceChapterNumber: null, sourceText: 'More body', translatedText: 'Noch ein Absatz.', order: 3, sourceLocation: 'fixture:4' },
    ],
  }
  const directory = mkdtempSync(join(tmpdir(), 'booklingua-semantic-epubcheck-'))
  const epubPath = join(directory, 'semantic.epub')
  try {
    writeFileSync(epubPath, buildSemanticEpubFromDocument(document, 'Synthetisches Buch', 'de', 'Autor'))
    assert.doesNotThrow(() => execFileSync('java', ['-jar', epubcheckJar!, epubPath], { encoding: 'utf8', stdio: 'pipe' }))
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
