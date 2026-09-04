import { createHash } from 'crypto'
import { SemanticNodeV2 } from './semantic-document'

export const NODE_BATCH_SCHEMA_VERSION = '2.0'

export interface NodeTranslationInput {
  schemaVersion: typeof NODE_BATCH_SCHEMA_VERSION
  sourceFingerprint: string
  nodes: Array<{ id: string; text: string }>
  /**
   * Original-language text for the same nodes, supplied on the editorial pass so the
   * editor can check fidelity rather than only fluency. Deliberately excluded from the
   * fingerprint, which stays keyed on the text the model must return.
   */
  sources?: Array<{ id: string; text: string }>
}

export interface NodeTranslationOutput {
  schemaVersion: typeof NODE_BATCH_SCHEMA_VERSION
  sourceFingerprint: string
  nodes: Array<{ id: string; text: string }>
}

export function nodeBatchFingerprint(nodes: Array<{ id: string; text: string }>): string {
  return createHash('sha256').update(JSON.stringify(nodes)).digest('hex')
}

export function createNodeTranslationInput(nodes: SemanticNodeV2[], includeSource = false): NodeTranslationInput {
  const translatable = nodes.map(node => ({ id: node.id, text: node.translatedText ?? node.sourceText }))
  const input: NodeTranslationInput = { schemaVersion: NODE_BATCH_SCHEMA_VERSION, sourceFingerprint: nodeBatchFingerprint(translatable), nodes: translatable }
  if (includeSource) input.sources = nodes.map(node => ({ id: node.id, text: node.sourceText }))
  return input
}

export function validateAndMergeNodeOutput(
  authoritative: SemanticNodeV2[],
  output: NodeTranslationOutput,
  expectedSourceFingerprint?: string,
): SemanticNodeV2[] {
  if (output.schemaVersion !== NODE_BATCH_SCHEMA_VERSION) throw new Error('Unexpected node output schema version')
  const expectedFingerprint = expectedSourceFingerprint || nodeBatchFingerprint(authoritative.map(node => ({ id: node.id, text: node.translatedText ?? node.sourceText })))
  if (output.sourceFingerprint !== expectedFingerprint) throw new Error('Model output source fingerprint is stale or incorrect')
  const expected = authoritative.map(node => node.id)
  const actual = output.nodes.map(node => node.id)
  if (new Set(actual).size !== actual.length) throw new Error('Duplicate node ID in model output')
  if (expected.length !== actual.length || expected.some(id => !actual.includes(id))) throw new Error('Model output node ID set does not match source')
  if (expected.some((id, index) => actual[index] !== id)) throw new Error('Model output reordered semantic nodes')
  if (output.nodes.some(node => typeof node.text !== 'string' || !node.text.trim())) throw new Error('Model output contains an empty required translation')
  const byId = new Map(output.nodes.map(node => [node.id, node.text]))
  return authoritative.map(node => ({ ...node, translatedText: byId.get(node.id)! }))
}

export interface TranslationChunkIdentity {
  pipelineVersion: 'legacy-v1' | 'semantic-v2'
  schemaVersion: string
  structureFingerprint: string
}

export function semanticChunkIdentity(nodes: SemanticNodeV2[]): TranslationChunkIdentity {
  return { pipelineVersion: 'semantic-v2', schemaVersion: NODE_BATCH_SCHEMA_VERSION, structureFingerprint: nodeBatchFingerprint(nodes.map(node => ({ id: node.id, text: node.sourceText }))) }
}
