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
  return errors
}
