export const SEMANTIC_DOCUMENT_SCHEMA_VERSION = '2.0'

export type SemanticNodeType = 'heading' | 'paragraph' | 'list_item' | 'scene_break'

export interface SemanticNodeV2 {
  id: string
  chapterId: string | null
  type: SemanticNodeType
  headingLevel: number | null
  sourceChapterNumber: string | null
  sourceText: string
  translatedText: string | null
  order: number
  sourceLocation: string
}

export interface SemanticDocumentV2 {
  schemaVersion: typeof SEMANTIC_DOCUMENT_SCHEMA_VERSION
  sourceHash: string
  sourceFormat: 'epub' | 'docx' | 'txt'
  parserConfidence: number
  nodes: SemanticNodeV2[]
}

export type SemanticEligibilityStatus = 'eligible' | 'review_required' | 'unsupported'
export interface SemanticEligibility {
  status: SemanticEligibilityStatus
  reasons: string[]
}

export const SEMANTIC_V2_ENABLED = process.env.PIPELINE_VERSION === 'semantic-v2'

export function extractSourceChapterNumber(text: string): string | null {
  const match = text.trim().match(/^(?:chapter|chapitre|cap[ií]tulo|kapitel|capitolo)\s+([0-9]+|[ivxlcdm]+)/i)
  return match ? match[1].toUpperCase() : null
}

export function validateSemanticDocument(document: SemanticDocumentV2): string[] {
  const errors: string[] = []
  const ids = document.nodes.map(node => node.id)
  if (new Set(ids).size !== ids.length) errors.push('Duplicate semantic node ID')
  if (document.nodes.some((node, index) => node.order !== index)) errors.push('Semantic node order is not contiguous')
  if (document.nodes.some(node => !node.sourceText.trim())) errors.push('Semantic node has empty source text')
  if (!document.sourceHash.trim()) errors.push('Semantic source fingerprint is missing')
  if (document.nodes.length === 0) errors.push('Semantic document has no nodes')
  const chapterNodes = document.nodes.filter(node => node.type === 'heading' && node.headingLevel === 1)
  if (new Set(chapterNodes.map(node => node.chapterId)).size !== chapterNodes.length) errors.push('Duplicate semantic chapter identity')
  return errors
}

export function evaluateSemanticEligibility(document: SemanticDocumentV2): SemanticEligibility {
  const reasons = validateSemanticDocument(document)
  if (reasons.length) return { status: 'unsupported', reasons }
  if (document.sourceFormat === 'txt' || document.parserConfidence < 0.8) {
    return { status: 'review_required', reasons: ['Source structure requires explicit human review'] }
  }
  return { status: 'eligible', reasons: [] }
}
