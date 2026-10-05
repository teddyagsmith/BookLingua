import { SemanticDocumentV2 } from './semantic-document'
import { TranslationBriefV1 } from './translation-brief'

export interface VerifiedExplanatoryNote {
  sourceTerm: string
  targetTerm: string
  canonicalNote: string
}

export type ExplanatoryStyle = 'bracket'|'paired_dash'|'colon'
export interface ExplanatorySpan { start:number; end:number; text:string; style:ExplanatoryStyle }

export interface ExplanatoryNoteAudit {
  selected: Record<string, { count: number; firstSourceNodeId?: string; noteNodeIds: string[] }>
  unrequestedAdditions: Array<{ nodeId: string; sourceText: string; additions: string[]; styles:ExplanatoryStyle[] }>
  bracketAdditionsWithoutSource: number
  additionsByStyle: Record<ExplanatoryStyle,number>
}

/**
 * Return the three forms an editor can use to smuggle an explanation into prose.
 * Ranges never overlap: a colon inside parentheses belongs to the bracket span,
 * while a free-standing "term: explanation" remains independently detectable.
 */
export function explanatorySpans(value:string):ExplanatorySpan[]{
  const candidates:ExplanatorySpan[]=[]
  const explanatoryCue=/\b(?:school|Schule|Oberstufe|amerikanisch|US-amerikanisch|britisch|entspricht|vergleichbar|bedeutet|also|sprich|das heißt|that is|meaning|i\.e\.)\b/i
  for(const match of Array.from(value.matchAll(/\([^()]{1,240}\)|\[[^\[\]]{1,240}\]/g))){
    candidates.push({start:match.index!,end:match.index!+match[0].length,text:match[0].slice(1,-1).trim(),style:'bracket'})
  }
  for(const match of Array.from(value.matchAll(/([–—])\s*([^\n]{1,240}?)\s*\1/g))){
    if(explanatoryCue.test(match[2]))candidates.push({start:match.index!,end:match.index!+match[0].length,text:match[2].trim(),style:'paired_dash'})
  }
  for(const match of Array.from(value.matchAll(/(?:^|\s)(-)\s+([^\n]{1,240}?)\s+\1(?=\s|[,.;:!?]|$)/g))){
    const dashOffset=match[0].indexOf(match[1])
    if(explanatoryCue.test(match[2]))candidates.push({start:match.index!+dashOffset,end:match.index!+match[0].length,text:match[2].trim(),style:'paired_dash'})
  }
  // A free-standing colon explanation ends at sentence punctuation. Colons already
  // contained by brackets/dashes are represented by their enclosing structure.
  for(const match of Array.from(value.matchAll(/\b([A-Za-zÀ-ÖØ-öø-ÿĀ-ž0-9][A-Za-zÀ-ÖØ-öø-ÿĀ-ž0-9'’ -]{0,48}):\s+((?:(?:die|der|das|ein(?:e|en)?|the)\s+(?:amerikanisch|US-amerikanisch|britisch|US |American|British)|bedeutet\b|heißt\b|entspricht\b|vergleichbar\b|that is\b|meaning\b|i\.e\.\b)[^.!?\n]{0,180})(?=[.!?]|$)/gi))){
    const colon=match[0].indexOf(':')
    const colonPosition=match.index!+colon
    if(candidates.some(candidate=>candidate.start<colonPosition&&candidate.end>colonPosition))continue
    candidates.push({start:colonPosition,end:match.index!+match[0].length,text:match[2].trim(),style:'colon'})
  }
  const ordered=candidates.sort((a,b)=>a.start-b.start||(b.end-b.start)-(a.end-a.start))
  return ordered.filter((candidate,index)=>!ordered.some((other,otherIndex)=>otherIndex!==index&&other.start<=candidate.start&&other.end>=candidate.end))
}

function includesTerm(value:string,term:string):boolean{return value.toLocaleLowerCase().includes(term.toLocaleLowerCase())}
function selectedItems(brief:TranslationBriefV1){return brief.items.filter(item=>item.authorDecision==='footnote'||item.authorDecision==='convert_with_note')}

function removeAddedExplanations(value:string,ranges:ExplanatorySpan[]):string{
  let output=value
  for(const range of [...ranges].sort((a,b)=>b.start-a.start)){
    let start=range.start,end=range.end
    if(range.style==='colon'){
      // Keep the term before the colon, remove only ": explanation".
      start=range.start
    }else if(start>0&&/\s/.test(output[start-1]))start--
    output=output.slice(0,start)+output.slice(end)
  }
  return output.replace(/[ \t]{2,}/g,' ').replace(/\s+([,.;:!?])/g,'$1')
}

function additionsForNode(sourceText:string,targetText:string):ExplanatorySpan[]{
  const source=explanatorySpans(sourceText),target=explanatorySpans(targetText)
  const remaining:ExplanatorySpan[]=[]
  const available=new Map<ExplanatoryStyle,number>()
  for(const span of source)available.set(span.style,(available.get(span.style)||0)+1)
  for(const span of target){
    const count=available.get(span.style)||0
    if(count)available.set(span.style,count-1)
    else remaining.push(span)
  }
  return remaining
}

/** Enforce explanatory notes once, book-wide, after all model batches are joined. */
export function applyBookWideExplanatoryNotes(input:{
  source:SemanticDocumentV2;target:SemanticDocumentV2;brief:TranslationBriefV1;verified:VerifiedExplanatoryNote[];removeUnexpected?:boolean
}):SemanticDocumentV2{
  if(input.source.nodes.length!==input.target.nodes.length)throw new Error('Explanatory-note documents differ in node count')
  const selected=selectedItems(input.brief),specs=new Map(input.verified.map(item=>[item.sourceTerm.toLocaleLowerCase(),item]))
  const selectedTerms=new Set(selected.map(item=>item.sourceTerm.toLocaleLowerCase()))
  for(const spec of input.verified){
    if(!selectedTerms.has(spec.sourceTerm.toLocaleLowerCase()))throw new Error(`Explanatory note was not author-selected: ${spec.sourceTerm}`)
    if(!spec.targetTerm.trim()||!spec.canonicalNote.trim())throw new Error(`Explanatory note is incomplete: ${spec.sourceTerm}`)
    if(spec.canonicalNote.trim().split(/\s+/).length>12)throw new Error(`Explanatory note is not short enough: ${spec.sourceTerm}`)
  }
  for(const item of selected)if(!specs.has(item.sourceTerm.toLocaleLowerCase()))throw new Error(`Author-selected explanatory term lacks canonical target wording: ${item.sourceTerm}`)

  const nodes=input.target.nodes.map((node,index)=>{
    const sourceNode=input.source.nodes[index]
    if(sourceNode.id!==node.id)throw new Error(`Explanatory-note semantic identity mismatch at ${node.id}`)
    const additions=additionsForNode(sourceNode.sourceText,node.translatedText||'')
    if(!additions.length)return{...node}
    if(!input.removeUnexpected)throw new Error(`Target explanatory addition absent in source at ${node.id}: ${additions.map(item=>item.style).join(', ')}`)
    return{...node,translatedText:removeAddedExplanations(node.translatedText||'',additions)}
  })

  for(const item of selected){
    const spec=specs.get(item.sourceTerm.toLocaleLowerCase())!
    const firstIndex=input.source.nodes.findIndex(node=>includesTerm(node.sourceText,item.sourceTerm))
    if(firstIndex<0)throw new Error(`Author-selected explanatory term is absent from source: ${item.sourceTerm}`)
    const node=nodes[firstIndex],target=node.translatedText||'',occurrences=target.split(spec.targetTerm).length-1
    if(occurrences!==1)throw new Error(`Canonical target term must occur exactly once in first source node: ${item.sourceTerm}`)
    node.translatedText=target.replace(spec.targetTerm,`${spec.targetTerm} (${spec.canonicalNote.trim()})`)
  }

  const output={...input.target,nodes},audit=auditBookWideExplanatoryNotes(input.source,output,input.brief,input.verified)
  for(const item of selected){
    const result=audit.selected[item.sourceTerm]
    if(!result||result.count!==1||result.noteNodeIds[0]!==result.firstSourceNodeId)throw new Error(`Explanatory note must appear exactly once at first source occurrence: ${item.sourceTerm}`)
  }
  if(audit.unrequestedAdditions.length)throw new Error(`Unrequested target explanatory additions remain at ${audit.unrequestedAdditions.map(item=>item.nodeId).join(', ')}`)
  return output
}

export function auditBookWideExplanatoryNotes(source:SemanticDocumentV2,target:SemanticDocumentV2,brief:TranslationBriefV1,verified:VerifiedExplanatoryNote[]):ExplanatoryNoteAudit{
  const selected:ExplanatoryNoteAudit['selected']={},allowedByNode=new Map<string,string[]>()
  for(const item of selectedItems(brief)){
    const spec=verified.find(candidate=>candidate.sourceTerm.toLocaleLowerCase()===item.sourceTerm.toLocaleLowerCase())
    const first=source.nodes.find(node=>includesTerm(node.sourceText,item.sourceTerm))
    const noteNodeIds=spec?target.nodes.filter(node=>(node.translatedText||'').includes(spec.canonicalNote.trim())).map(node=>node.id):[]
    selected[item.sourceTerm]={count:noteNodeIds.length,firstSourceNodeId:first?.id,noteNodeIds}
    if(first&&spec)allowedByNode.set(first.id,[...(allowedByNode.get(first.id)||[]),spec.canonicalNote.trim()])
  }
  const unrequestedAdditions:ExplanatoryNoteAudit['unrequestedAdditions']=[],additionsByStyle:Record<ExplanatoryStyle,number>={bracket:0,paired_dash:0,colon:0}
  target.nodes.forEach((node,index)=>{
    const additions=additionsForNode(source.nodes[index].sourceText,node.translatedText||'')
    for(const addition of additions)additionsByStyle[addition.style]++
    if(!additions.length)return
    const allowed=allowedByNode.get(node.id)||[]
    const unexpected=additions.filter(addition=>!allowed.some(note=>addition.text.includes(note)))
    if(unexpected.length||additions.length!==allowed.length)unrequestedAdditions.push({nodeId:node.id,sourceText:source.nodes[index].sourceText,additions:(unexpected.length?unexpected:additions).map(item=>item.text),styles:(unexpected.length?unexpected:additions).map(item=>item.style)})
  })
  return{selected,unrequestedAdditions,bracketAdditionsWithoutSource:additionsByStyle.bracket,additionsByStyle}
}
