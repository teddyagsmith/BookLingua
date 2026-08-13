import test from 'node:test'
import assert from 'node:assert/strict'
import { assertCompleteBatchCoverage, createDeterministicSemanticBatches, semanticBatchIdentity } from '../lib/semantic-batching'
import { SemanticNodeV2 } from '../lib/semantic-document'

function nodes(wordCounts: number[], chapters: Array<string|null> = []): SemanticNodeV2[] {
  return wordCounts.map((count, order) => ({
    id: `node-${order + 1}`,
    chapterId: chapters[order] ?? 'chapter-1',
    type: 'paragraph',
    headingLevel: null,
    sourceChapterNumber: null,
    sourceText: Array.from({ length: count }, () => `w${order}`).join(' '),
    translatedText: null,
    order,
    sourceLocation: `fixture:${order}`,
  }))
}

test('small input creates one complete deterministic batch', () => {
  const source = nodes([10, 20, 30])
  const first = createDeterministicSemanticBatches(source, 100)
  const second = createDeterministicSemanticBatches(source, 100)
  assert.equal(first.length, 1)
  assert.deepEqual(first.map(x => x.orderedNodeIds), second.map(x => x.orderedNodeIds))
  assert.doesNotThrow(() => assertCompleteBatchCoverage(source, first))
})
test('multiple batches preserve order and whole nodes', () => {
  const source = nodes([60, 60, 20, 80])
  const batches = createDeterministicSemanticBatches(source, 100)
  assert.deepEqual(batches.map(x => x.orderedNodeIds), [['node-1'], ['node-2','node-3'], ['node-4']])
  assert.doesNotThrow(() => assertCompleteBatchCoverage(source, batches))
})

test('chapter transition metadata remains stable', () => {
  const source = nodes([40,40,40,40], ['c1','c1','c2','c2'])
  const batches = createDeterministicSemanticBatches(source, 80)
  assert.equal(batches[0].endsChapter, true)
  assert.equal(batches[1].startsChapter, true)
})

test('large chapter spans batches only through complete nodes', () => {
  const source = nodes([80,80,80], ['c1','c1','c1'])
  const batches = createDeterministicSemanticBatches(source, 100)
  assert.equal(batches.length, 3)
  assert.deepEqual(batches.flatMap(x => x.orderedNodeIds), source.map(x => x.id))
})

test('coverage rejects missing, duplicate, overlap, gap, and reorder', () => {
  const source = nodes([1,1,1,1])
  const valid = createDeterministicSemanticBatches(source, 2)
  assert.throws(() => assertCompleteBatchCoverage(source, valid.slice(0,1)), /gap/)
  assert.throws(() => assertCompleteBatchCoverage(source, [...valid, valid[0]]), /overlapping|duplicate/)
  const reordered = structuredClone(valid); [reordered[0],reordered[1]]=[reordered[1],reordered[0]]
  assert.throws(() => assertCompleteBatchCoverage(source, reordered), /global node order/)
})

test('batch identity invalidates on pass, model, schema, or brief change', () => {
  const base = { orderId:'o',language:'fr',documentFingerprint:'doc',pass:1 as const,orderedNodeIds:['n1'],briefRevision:1,briefFingerprint:'brief',modelId:'model',schemaVersion:'2.0' }
  const identity = semanticBatchIdentity(base)
  assert.notEqual(identity, semanticBatchIdentity({...base,pass:2}))
  assert.notEqual(identity, semanticBatchIdentity({...base,modelId:'other'}))
  assert.notEqual(identity, semanticBatchIdentity({...base,schemaVersion:'3.0'}))
  assert.notEqual(identity, semanticBatchIdentity({...base,briefFingerprint:'other'}))
})

test('full 1,760-node aggregate has exact identity and order', () => {
  const source = nodes(Array.from({length:1760},(_,index)=>10+(index%17)))
  const batches = createDeterministicSemanticBatches(source, 700)
  assert.ok(batches.length > 1)
  assert.doesNotThrow(() => assertCompleteBatchCoverage(source,batches))
  assert.equal(batches.flatMap(x=>x.orderedNodeIds).length,1760)
})
