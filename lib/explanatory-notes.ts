import { SemanticDocumentV2 } from './semantic-document'
import { TranslationBriefV1 } from './translation-brief'

export interface VerifiedExplanatoryNote {
  sourceTerm: string
  targetTerm: string
  canonicalNote: string
}

export interface ExplanatoryNoteAudit {
  selected: Record<string, { count: number; firstSourceNodeId?: string; noteNodeIds: string[] }>
  unrequestedAdditions: Array<{ nodeId: string; sourceText: string; additions: string[] }>
  bracketAdditionsWithoutSource: number
}

type Bracket = { start: number; end: number; text: string }

function brackets(value: string): Bracket[] {
  return Array.from(value.matchAll(/\([^()]{1,240}\)|\[[^\[\]]{1,240}\]/g), match => ({
    start: match.index!, end: match.index! + match[0].length, text: match[0].slice(1, -1).trim(),
  }))
}

function includesTerm(value: string, term: string): boolean {
  return value.toLocaleLowerCase().includes(term.toLocaleLowerCase())
}

function removeAddedBrackets(value: string, ranges: Bracket[]): string {
  let output = value
  for (const range of [...ranges].reverse()) {
    let start = range.start
    if (start > 0 && /\s/.test(output[start - 1])) start--
    output = output.slice(0, start) + output.slice(range.end)
  }
  return output.replace(/[ \t]{2,}/g, ' ').replace(/\s+([,.;:!?])/g, '$1')
}

function selectedItems(brief: TranslationBriefV1) {
  return brief.items.filter(item => item.authorDecision === 'footnote' || item.authorDecision === 'convert_with_note')
}

/**
 * Enforce explanatory notes as book-wide state rather than independent batch choices.
 *
 * Model batches cannot know whether another batch already explained a term. The final
 * editorial document is therefore normalised once, after all batches have been joined:
 * every target-only bracket addition is removed, then the approved canonical note is
 * inserted beside the selected term's first source occurrence only.
 */
export function applyBookWideExplanatoryNotes(input: {
  source: SemanticDocumentV2
  target: SemanticDocumentV2
  brief: TranslationBriefV1
  verified: VerifiedExplanatoryNote[]
  removeUnexpected?: boolean
}): SemanticDocumentV2 {
  if (input.source.nodes.length !== input.target.nodes.length) throw new Error('Explanatory-note documents differ in node count')
  const selected = selectedItems(input.brief)
  const specs = new Map(input.verified.map(item => [item.sourceTerm.toLocaleLowerCase(), item]))
  const selectedTerms = new Set(selected.map(item => item.sourceTerm.toLocaleLowerCase()))
  for (const spec of input.verified) {
    if (!selectedTerms.has(spec.sourceTerm.toLocaleLowerCase())) throw new Error(`Explanatory note was not author-selected: ${spec.sourceTerm}`)
    if (!spec.targetTerm.trim() || !spec.canonicalNote.trim()) throw new Error(`Explanatory note is incomplete: ${spec.sourceTerm}`)
    if (spec.canonicalNote.trim().split(/\s+/).length > 12) throw new Error(`Explanatory note is not short enough: ${spec.sourceTerm}`)
  }
  for (const item of selected) if (!specs.has(item.sourceTerm.toLocaleLowerCase())) {
    throw new Error(`Author-selected explanatory term lacks canonical target wording: ${item.sourceTerm}`)
  }

  const nodes = input.target.nodes.map((node, index) => {
    const sourceNode = input.source.nodes[index]
    if (sourceNode.id !== node.id) throw new Error(`Explanatory-note semantic identity mismatch at ${node.id}`)
    const sourceBrackets = brackets(sourceNode.sourceText)
    const targetBrackets = brackets(node.translatedText || '')
    if (targetBrackets.length <= sourceBrackets.length) return node
    if (sourceBrackets.length) {
      throw new Error(`Target bracket additions cannot be mapped safely at ${node.id}`)
    }
    if (!input.removeUnexpected) throw new Error(`Target bracket addition absent in source at ${node.id}`)
    return { ...node, translatedText: removeAddedBrackets(node.translatedText || '', targetBrackets) }
  })

  for (const item of selected) {
    const spec = specs.get(item.sourceTerm.toLocaleLowerCase())!
    const firstIndex = input.source.nodes.findIndex(node => includesTerm(node.sourceText, item.sourceTerm))
    if (firstIndex < 0) throw new Error(`Author-selected explanatory term is absent from source: ${item.sourceTerm}`)
    const node = nodes[firstIndex]
    const target = node.translatedText || ''
    const occurrences = target.split(spec.targetTerm).length - 1
    if (occurrences !== 1) throw new Error(`Canonical target term must occur exactly once in first source node: ${item.sourceTerm}`)
    node.translatedText = target.replace(spec.targetTerm, `${spec.targetTerm} (${spec.canonicalNote.trim()})`)
  }

  const output = { ...input.target, nodes }
  const audit = auditBookWideExplanatoryNotes(input.source, output, input.brief, input.verified)
  for (const item of selected) {
    const result = audit.selected[item.sourceTerm]
    if (!result || result.count !== 1 || result.noteNodeIds[0] !== result.firstSourceNodeId) {
      throw new Error(`Explanatory note must appear exactly once at first source occurrence: ${item.sourceTerm}`)
    }
  }
  if (audit.unrequestedAdditions.length) throw new Error(`Unrequested target bracket additions remain at ${audit.unrequestedAdditions.map(item => item.nodeId).join(', ')}`)
  return output
}

export function auditBookWideExplanatoryNotes(
  source: SemanticDocumentV2,
  target: SemanticDocumentV2,
  brief: TranslationBriefV1,
  verified: VerifiedExplanatoryNote[],
): ExplanatoryNoteAudit {
  const selected: ExplanatoryNoteAudit['selected'] = {}
  const allowedByNode = new Map<string, string[]>()
  for (const item of selectedItems(brief)) {
    const spec = verified.find(candidate => candidate.sourceTerm.toLocaleLowerCase() === item.sourceTerm.toLocaleLowerCase())
    const first = source.nodes.find(node => includesTerm(node.sourceText, item.sourceTerm))
    const noteNodeIds = spec ? target.nodes.filter(node => (node.translatedText || '').includes(`(${spec.canonicalNote.trim()})`)).map(node => node.id) : []
    selected[item.sourceTerm] = { count: noteNodeIds.length, firstSourceNodeId: first?.id, noteNodeIds }
    if (first && spec) allowedByNode.set(first.id, [...(allowedByNode.get(first.id) || []), spec.canonicalNote.trim()])
  }
  const unrequestedAdditions: ExplanatoryNoteAudit['unrequestedAdditions'] = []
  let bracketAdditionsWithoutSource = 0
  target.nodes.forEach((node, index) => {
    const sourceCount = brackets(source.nodes[index].sourceText).length
    const targetValues = brackets(node.translatedText || '').map(item => item.text)
    const extra = Math.max(0, targetValues.length - sourceCount)
    bracketAdditionsWithoutSource += extra
    if (!extra) return
    const allowed = allowedByNode.get(node.id) || []
    const additions = sourceCount === 0 ? targetValues : targetValues.slice(sourceCount)
    const unexpected = additions.filter(value => !allowed.includes(value))
    if (unexpected.length || additions.length !== allowed.length) {
      unrequestedAdditions.push({ nodeId: node.id, sourceText: source.nodes[index].sourceText, additions: unexpected.length ? unexpected : additions })
    }
  })
  return { selected, unrequestedAdditions, bracketAdditionsWithoutSource }
}
