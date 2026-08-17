import { createHash } from 'crypto'
import { nodeBatchFingerprint, NodeTranslationInput, NodeTranslationOutput } from './node-translation-contract'

export interface SemanticRecoveryRequestContext {
  requestId: string
  depth: number
}

function childInput(parent: NodeTranslationInput, nodes: NodeTranslationInput['nodes']): NodeTranslationInput {
  return {
    schemaVersion: parent.schemaVersion,
    sourceFingerprint: nodeBatchFingerprint(nodes),
    nodes,
  }
}

function childRequestId(parentRequestId: string, input: NodeTranslationInput, side: 'left' | 'right'): string {
  const identity = createHash('sha256').update(JSON.stringify(input.nodes.map(node => node.id))).digest('hex').slice(0, 16)
  return `${parentRequestId}:json-recovery:${side}:${identity}`
}

export async function translateWithDeterministicJsonRecovery(
  input: NodeTranslationInput,
  requestId: string,
  request: (batch: NodeTranslationInput, context: SemanticRecoveryRequestContext) => Promise<NodeTranslationOutput>,
  maxDepth = 3,
): Promise<NodeTranslationOutput> {
  async function run(batch: NodeTranslationInput, currentRequestId: string, depth: number): Promise<NodeTranslationOutput> {
    try {
      return await request(batch, { requestId: currentRequestId, depth })
    } catch (error) {
      if (!(error instanceof SyntaxError) || depth >= maxDepth || batch.nodes.length < 2) throw error
      const midpoint = Math.ceil(batch.nodes.length / 2)
      const left = childInput(batch, batch.nodes.slice(0, midpoint))
      const right = childInput(batch, batch.nodes.slice(midpoint))
      const [leftOutput, rightOutput] = await Promise.all([
        run(left, childRequestId(currentRequestId, left, 'left'), depth + 1),
        run(right, childRequestId(currentRequestId, right, 'right'), depth + 1),
      ])
      return {
        schemaVersion: batch.schemaVersion,
        sourceFingerprint: batch.sourceFingerprint,
        nodes: [...leftOutput.nodes, ...rightOutput.nodes],
      }
    }
  }
  return run(input, requestId, 0)
}
