import { createHash } from 'crypto'
import { SemanticNodeV2 } from './semantic-document'

export const SEMANTIC_BATCH_POLICY_VERSION = 'semantic-batch-v1'
export const DEFAULT_MAX_EXPECTED_OUTPUT_WORDS = 700

export interface SemanticBatch {
  index: number
  nodes: SemanticNodeV2[]
  orderedNodeIds: string[]
  expectedOutputWords: number
  startsChapter: boolean
  endsChapter: boolean
}
function words(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length
}

export function createDeterministicSemanticBatches(
  nodes: SemanticNodeV2[],
  maxExpectedOutputWords = DEFAULT_MAX_EXPECTED_OUTPUT_WORDS,
): SemanticBatch[] {
  if (!Number.isInteger(maxExpectedOutputWords) || maxExpectedOutputWords < 1) throw new Error('Semantic batch budget must be a positive integer')
  const batches: SemanticBatch[] = []
  let current: SemanticNodeV2[] = []
  let currentWords = 0
  const flush = () => {
    if (!current.length) return
    const previous = nodes[current[0].order - 1]
    const next = nodes[current[current.length - 1].order + 1]
    batches.push({
      index: batches.length,
      nodes: current,
      orderedNodeIds: current.map(node => node.id),
      expectedOutputWords: currentWords,
      startsChapter: !previous || previous.chapterId !== current[0].chapterId,
      endsChapter: !next || next.chapterId !== current[current.length - 1].chapterId,
    })
    current = []
    currentWords = 0
  }
  for (const node of nodes) {
    const nodeWords = Math.max(1, words(node.translatedText ?? node.sourceText))
    if (current.length && currentWords + nodeWords > maxExpectedOutputWords) flush()
    current.push(node)
    currentWords += nodeWords
    // Oversized nodes remain whole by design; the next node starts a new batch.
    if (currentWords >= maxExpectedOutputWords) flush()
  }
  flush()
  return batches
}

export function semanticBatchIdentity(input: {
  orderId: string
  language: string
  documentFingerprint: string
  pass: 1 | 2
  orderedNodeIds: string[]
  briefRevision: number
  briefFingerprint: string
  modelId: string
  schemaVersion: string
  promptVersion: string
}): string {
  return createHash('sha256').update(JSON.stringify({
    policy: SEMANTIC_BATCH_POLICY_VERSION,
    orderId: input.orderId,
    language: input.language,
    documentFingerprint: input.documentFingerprint,
    pass: input.pass,
    orderedNodeIds: input.orderedNodeIds,
    briefRevision: input.briefRevision,
    briefFingerprint: input.briefFingerprint,
    modelId: input.modelId,
    schemaVersion: input.schemaVersion,
    promptVersion: input.promptVersion,
  })).digest('hex')
}

export function assertCompleteBatchCoverage(authoritative: SemanticNodeV2[], batches: SemanticBatch[]): void {
  const expected = authoritative.map(node => node.id)
  const actual = batches.flatMap(batch => batch.orderedNodeIds)
  if (new Set(actual).size !== actual.length) throw new Error('Semantic batches contain overlapping or duplicate node IDs')
  if (actual.length !== expected.length) throw new Error('Semantic batches contain a node gap')
  if (expected.some((id, index) => actual[index] !== id)) throw new Error('Semantic batches do not preserve global node order')
  for (const batch of batches) {
    if (batch.nodes.some((node, index) => node.id !== batch.orderedNodeIds[index])) throw new Error('Semantic batch node identity mismatch')
  }
}
