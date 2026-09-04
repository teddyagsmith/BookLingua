import { SemanticNodeV2 } from './semantic-document'

const MIN_SUBSTANTIAL_CHARACTERS = 120

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9À-ž\s]/gi, '').replace(/\s+/g, ' ').trim()
}

interface ComparableText { normalized: string; words: Set<string> }

function comparable(value: string): ComparableText {
  const normalized = normalize(value)
  return { normalized, words: new Set(normalized.split(' ')) }
}

function substantiallyEquivalent(a: ComparableText, b: ComparableText): boolean {
  if (a.normalized.length < MIN_SUBSTANTIAL_CHARACTERS || b.normalized.length < MIN_SUBSTANTIAL_CHARACTERS) return false
  const overlap = Array.from(a.words).filter(word => b.words.has(word)).length / Math.max(a.words.size, b.words.size)
  const lengthRatio = Math.min(a.normalized.length, b.normalized.length) / Math.max(a.normalized.length, b.normalized.length)
  return overlap >= 0.94 && lengthRatio >= 0.9
}

export function assertSourceAwareDuplicateParity(
  sourceNodes: SemanticNodeV2[],
  translatedNodes: SemanticNodeV2[],
): void {
  if (sourceNodes.length !== translatedNodes.length) throw new Error('Duplicate parity requires complete semantic node coverage')
  for (let index = 0; index < sourceNodes.length; index++) {
    if (sourceNodes[index].id !== translatedNodes[index]?.id || sourceNodes[index].order !== translatedNodes[index]?.order) {
      throw new Error('Duplicate parity requires exact semantic node identity and order')
    }
    if (!translatedNodes[index].translatedText?.trim()) throw new Error(`Duplicate parity requires translated text for ${sourceNodes[index].id}`)
  }

  const bodyIndexes = sourceNodes.map((node,index)=>node.type === 'heading' ? -1 : index).filter(index=>index >= 0)
  const sourceComparable = sourceNodes.map(node=>comparable(node.sourceText))
  const translatedComparable = translatedNodes.map(node=>comparable(node.translatedText!))
  for (let leftIndex = 0; leftIndex < bodyIndexes.length; leftIndex++) {
    for (let rightIndex = leftIndex + 1; rightIndex < bodyIndexes.length; rightIndex++) {
      const left = bodyIndexes[leftIndex], right = bodyIndexes[rightIndex]
      const sourceDuplicate = substantiallyEquivalent(sourceComparable[left], sourceComparable[right])
      const translatedDuplicate = substantiallyEquivalent(translatedComparable[left], translatedComparable[right])
      // Repeated source nodes define the authorized locations for repetition.
      // Their translations may use naturally different wording while still
      // preserving both complete semantic nodes, so textual equality is not
      // required within an authoritative source duplicate group.
      if (sourceDuplicate) continue
      const ids = `${sourceNodes[left].id}, ${sourceNodes[right].id}`
      if (translatedDuplicate) throw new Error(`Translation introduced substantial duplicate content at nodes ${ids}`)
    }
  }
}

export function assertSourceAwareHeadingDuplicateParity(
  sourceNodes: SemanticNodeV2[],
  translatedNodes: SemanticNodeV2[],
): void {
  if (sourceNodes.length !== translatedNodes.length) throw new Error('Heading duplicate parity requires complete semantic node coverage')
  const headings=sourceNodes.map((node,index)=>node.type==='heading'?index:-1).filter(index=>index>=0)
  for(let left=0;left<headings.length;left++)for(let right=left+1;right<headings.length;right++){
    const a=headings[left],b=headings[right]
    if(sourceNodes[a].id!==translatedNodes[a]?.id||sourceNodes[b].id!==translatedNodes[b]?.id)throw new Error('Heading duplicate parity requires exact semantic node identity')
    const translatedA=normalize(translatedNodes[a].translatedText||''),translatedB=normalize(translatedNodes[b].translatedText||'')
    const sourceA=normalize(sourceNodes[a].sourceText),sourceB=normalize(sourceNodes[b].sourceText)
    // Split display headings often repeat an opening fragment elsewhere (for example
    // "Creating Your" and "Creating Your Personal"). A translation may legitimately
    // render that shared prefix identically; unrelated headings must still differ.
    const sourcePrefix=sourceA.startsWith(`${sourceB} `)||sourceB.startsWith(`${sourceA} `)
    if(translatedA&&translatedA===translatedB&&sourceA!==sourceB&&!sourcePrefix){
      throw new Error(`Translation introduced duplicate heading at nodes ${sourceNodes[a].id}, ${sourceNodes[b].id}`)
    }
  }
}
