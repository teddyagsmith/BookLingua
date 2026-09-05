import test from 'node:test'
import assert from 'node:assert/strict'
import { blockEmphasisRuns, distributeEmphasis, parseInlineStyles } from '../lib/inline-emphasis'

const STYLES = parseInlineStyles('.Italic{font-style:italic}.CharOverride-22{font-weight:bold}.CharOverride-14{vertical-align:super}.Body{font-size:1em}')

test('inline character styles are read from the book stylesheet', () => {
  assert.deepEqual(STYLES.get('italic'), { italic: true, bold: undefined, superscript: undefined })
  assert.deepEqual(STYLES.get('charoverride-22'), { italic: undefined, bold: true, superscript: undefined })
  assert.deepEqual(STYLES.get('charoverride-14'), { italic: undefined, bold: undefined, superscript: true })
  assert.equal(STYLES.get('body'), undefined)
})

test('styled spans and emphasis tags both produce runs', () => {
  // The shape this book actually uses: emphasis by class, no <em> anywhere.
  const runs = blockEmphasisRuns('Try <span class="Italic _idGenCharOverride-1">Cold exposure:</span> daily<span class="CharOverride-14">1</span>.', STYLES)
  assert.deepEqual(runs.map(r => [r.text, !!r.italic, !!r.superscript]), [
    ['Try ', false, false],
    ['Cold exposure:', true, false],
    [' daily', false, false],
    ['1', false, true],
    ['.', false, false],
  ])
  assert.equal(blockEmphasisRuns('An <em>emphasised</em> word.', STYLES)[1].italic, true)
  assert.equal(blockEmphasisRuns('A <strong>strong</strong> word.', STYLES)[1].bold, true)
})

test('emphasis is mapped onto the translated words and merged where formatting matches', () => {
  const runs = blockEmphasisRuns('The <span class="Italic">quick brown</span> fox runs', STYLES)
  const mapped = distributeEmphasis(runs, 'Le renard brun rapide court vite')!
  assert.equal(mapped.map(r => r.text).join(' '), 'Le renard brun rapide court vite')
  assert.ok(mapped.some(r => r.italic), 'some run carries the emphasis')
  assert.equal(mapped.filter(r => r.italic).length, 1, 'adjacent italic runs are merged')
})

test('blocks without emphasis stay on the plain path', () => {
  assert.equal(distributeEmphasis(blockEmphasisRuns('Just ordinary text here.', STYLES), 'Solo texto corriente.'), undefined)
})

test('every translated word survives the mapping', () => {
  const runs = blockEmphasisRuns('a <span class="Italic">b</span> c <span class="CharOverride-22">d</span> e', STYLES)
  for (const translated of ['uno dos tres', 'uno dos tres cuatro cinco seis siete ocho', 'palabra']) {
    const mapped = distributeEmphasis(runs, translated)!
    assert.equal(mapped.map(r => r.text).join(' ').split(/\s+/).length, translated.split(/\s+/).length)
  }
})
