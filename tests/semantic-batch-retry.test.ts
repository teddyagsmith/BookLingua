import test from 'node:test'
import assert from 'node:assert/strict'
import { createDeterministicSemanticBatches, semanticBatchIdentity } from '../lib/semantic-batching'
import { parseSemanticTxt } from '../lib/semantic-parser'

function plan() {
  const source = Array.from({ length: 18 }, (_, index) => `${index % 6 === 0 ? `# Chapter ${index / 6 + 1}\n` : ''}${`word${index} `.repeat(40)}`).join('\n\n')
  return createDeterministicSemanticBatches(parseSemanticTxt(source, 'retry-source').nodes, 160)
}

test('truncated middle batch fails closed and retry invokes only the missing identity', async () => {
  const batches = plan(), cache = new Map<string, string>(), calls = new Map<string, number>()
  const identity = (batch: typeof batches[number]) => semanticBatchIdentity({ orderId:'order',language:'fr',documentFingerprint:'document',pass:1,orderedNodeIds:batch.orderedNodeIds,briefRevision:1,briefFingerprint:'brief',modelId:'sonnet',schemaVersion:'2.0',promptVersion:'p1' })
  async function run(failIdentity?: string) {
    for (const batch of batches) {
      const id = identity(batch)
      if (cache.has(id)) continue
      calls.set(id, (calls.get(id) || 0) + 1)
      if (id === failIdentity) throw new SyntaxError('truncated JSON')
      cache.set(id, JSON.stringify(batch.orderedNodeIds))
    }
  }
  const middle = identity(batches[Math.floor(batches.length / 2)])
  await assert.rejects(run(middle), /truncated JSON/)
  const completedBeforeRetry = new Map(calls)
  await run()
  for (const [id, count] of Array.from(calls.entries())) assert.equal(count, id === middle ? 2 : completedBeforeRetry.get(id) || 1)
  const callsAfterCompletion = new Map(calls)
  await run()
  assert.deepEqual(calls, callsAfterCompletion)
})

test('cache identities cannot cross language, pass, model, brief, or source changes', () => {
  const batch = plan()[0]
  const base = { orderId:'order',language:'fr',documentFingerprint:'document',pass:1 as const,orderedNodeIds:batch.orderedNodeIds,briefRevision:1,briefFingerprint:'brief',modelId:'sonnet',schemaVersion:'2.0',promptVersion:'p1' }
  const original = semanticBatchIdentity(base)
  for (const changed of [
    { ...base, language:'de' }, { ...base, pass:2 as const }, { ...base, modelId:'other' },
    { ...base, briefFingerprint:'other' }, { ...base, documentFingerprint:'other' },
  ]) assert.notEqual(semanticBatchIdentity(changed), original)
})
