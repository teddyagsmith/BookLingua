import assert from 'node:assert/strict'
import test from 'node:test'
import { nodeBatchFingerprint, NodeTranslationInput } from '../lib/node-translation-contract'
import { translateWithDeterministicJsonRecovery } from '../lib/semantic-model-recovery'

function input(ids: string[]): NodeTranslationInput {
  const nodes = ids.map(id => ({ id, text: `source ${id}` }))
  return { schemaVersion: '2.0', sourceFingerprint: nodeBatchFingerprint(nodes), nodes }
}

test('malformed parent JSON deterministically splits and recombines under the original identity', async () => {
  const batch = input(['a', 'b', 'c', 'd'])
  const calls: Array<{ ids: string[]; requestId: string; depth: number }> = []
  const output = await translateWithDeterministicJsonRecovery(batch, 'parent', async (part, context) => {
    calls.push({ ids: part.nodes.map(node => node.id), requestId: context.requestId, depth: context.depth })
    if (part.nodes.length === 4) throw new SyntaxError('truncated JSON')
    return {
      schemaVersion: part.schemaVersion,
      sourceFingerprint: part.sourceFingerprint,
      nodes: part.nodes.map(node => ({ id: node.id, text: `translated ${node.id}` })),
    }
  })
  assert.equal(output.sourceFingerprint, batch.sourceFingerprint)
  assert.deepEqual(output.nodes.map(node => node.id), ['a', 'b', 'c', 'd'])
  assert.deepEqual(calls.map(call => call.ids), [['a', 'b', 'c', 'd'], ['a', 'b'], ['c', 'd']])
  assert.equal(calls[1].depth, 1)
  assert.match(calls[1].requestId, /^parent:json-recovery:left:/)
  assert.match(calls[2].requestId, /^parent:json-recovery:right:/)
})

test('non-JSON failures remain fail-closed without splitting', async () => {
  const batch = input(['a', 'b'])
  let calls = 0
  await assert.rejects(
    translateWithDeterministicJsonRecovery(batch, 'parent', async () => {
      calls += 1
      throw new Error('provider unavailable')
    }),
    /provider unavailable/,
  )
  assert.equal(calls, 1)
})

test('recovery recursively splits a malformed child but never reorders nodes', async () => {
  const batch = input(['a', 'b', 'c', 'd'])
  const output = await translateWithDeterministicJsonRecovery(batch, 'parent', async part => {
    if (part.nodes.length > 1) throw new SyntaxError('malformed')
    return {
      schemaVersion: part.schemaVersion,
      sourceFingerprint: part.sourceFingerprint,
      nodes: [{ id: part.nodes[0].id, text: `translated ${part.nodes[0].id}` }],
    }
  })
  assert.equal(output.sourceFingerprint, batch.sourceFingerprint)
  assert.deepEqual(output.nodes.map(node => node.id), ['a', 'b', 'c', 'd'])
})
