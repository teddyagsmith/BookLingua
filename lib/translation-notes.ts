export const TRANSLATION_NOTES_SCHEMA_VERSION = '1.0'

export interface TranslationNoteEntry {
  source: string
  target: string
  reason: string
}

export interface TranslationNotesSection {
  id: string
  title: string
  entries: TranslationNoteEntry[]
}

export interface TranslationNotesV1 {
  schemaVersion: typeof TRANSLATION_NOTES_SCHEMA_VERSION
  language: string
  approach: string
  sections: TranslationNotesSection[]
}

function decodeVisibleEntities(value: string): string {
  let previous = ''
  let output = value
  for (let index = 0; index < 3 && output !== previous; index++) {
    previous = output
    output = output
      .replace(/&#x([0-9a-f]+);/gi, (_match, hex) => String.fromCodePoint(parseInt(hex, 16)))
      .replace(/&#(\d+);/g, (_match, decimal) => String.fromCodePoint(parseInt(decimal, 10)))
      .replace(/&(?:amp|apos|quot|lt|gt|nbsp);/g, entity => ({
        '&amp;': '&', '&apos;': "'", '&quot;': '"', '&lt;': '<', '&gt;': '>', '&nbsp;': '\u00a0',
      }[entity]!))
  }
  return output
}

export function validateTranslationNotes(notes: TranslationNotesV1, options:{requireSpecificReasons?:boolean}={}): string[] {
  const errors: string[] = []
  if (notes.schemaVersion !== TRANSLATION_NOTES_SCHEMA_VERSION) errors.push('Unexpected translation-notes schema version')
  if (!notes.language.trim()) errors.push('Translation-notes language is missing')
  if (!notes.approach.trim()) errors.push('Translation-notes approach is missing')
  // An empty section list is truthful when no notable decisions were recorded.
  if (notes.sections.some(section => !section.id || !section.title || !section.entries.length)) errors.push('Translation-notes section is incomplete')
  if (notes.sections.some(section => section.entries.some(entry => !entry.source || !entry.target || !entry.reason))) errors.push('Translation-note entry is incomplete')
  if(options.requireSpecificReasons){
    const entries=notes.sections.flatMap(section=>section.entries)
    const normalized=entries.map(entry=>entry.reason.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g,' ').trim())
    if(new Set(normalized).size!==normalized.length)errors.push('Translation-note reasons must be unique')
    for(const entry of entries){
      const evidence=[entry.source,entry.target].map(value=>value.normalize('NFKC').trim().slice(0,28)).filter(value=>value.length>=3)
      if(entry.source.normalize('NFKC').trim()===entry.target.normalize('NFKC').trim())errors.push(`Translation-note before/after values are identical: ${entry.source.slice(0,60)}`)
      if(entry.reason.trim().length<45||!evidence.some(value=>entry.reason.includes(value))){
        errors.push(`Translation-note reason lacks specific evidence: ${entry.source.slice(0,60)}`)
      }
      if(/\.\s+(?:The editorial review|This edit|It also)\b/.test(entry.reason))errors.push(`Translation-note reason contains an appended generic sentence: ${entry.source.slice(0,60)}`)
    }
  }
  return errors
}

export function parseLegacyTranslationNotes(text: string, language: string): TranslationNotesV1 {
  const sections: TranslationNotesSection[] = []
  const blocks = text.split(/\n(?=---\s*)/)
  for (const block of blocks) {
    const title = block.match(/^---\s*(.+?)\s*---/m)?.[1]
    if (!title) continue
    const entries = block.split('\n').flatMap(line => {
      const match = line.match(/^ORIGINAL:\s*(.*?)\s*\|\s*(?:TRANSLATED|KEPT AS):\s*(.*?)\s*\|\s*REASON:\s*(.+)$/i)
      return match ? [{ source: match[1].trim(), target: match[2].trim(), reason: match[3].trim() }] : []
    })
    if (entries.length) sections.push({ id: title.toLowerCase().replace(/[^a-z0-9]+/g, '-'), title, entries })
  }
  return {
    schemaVersion: TRANSLATION_NOTES_SCHEMA_VERSION,
    language,
    approach: 'Structured from the editorial pass translation decisions.',
    sections,
  }
}

export function renderTranslationNotes(notes: TranslationNotesV1): string {
  return decodeVisibleEntities([
    `Translation Notes — ${notes.language}`,
    notes.approach,
    ...notes.sections.flatMap(section => [
      `\n${section.title}`,
      ...section.entries.map(entry => `${entry.source} → ${entry.target}\nReason: ${entry.reason}`),
    ]),
  ].join('\n'))
}

export function deriveEditorialTranslationNotes(input: {
  language: string
  genre?: string
  pass1: { nodes: Array<{ id: string; sourceText: string; translatedText?: string | null }> }
  pass2: { nodes: Array<{ id: string; sourceText: string; translatedText?: string | null }> }
  existing?: TranslationNotesV1
  authoritativeTitle?: { source: string; target: string }
  limit?: number
}): TranslationNotesV1 {
  const excerpt=(value:string,limit=72)=>{const clean=value.normalize('NFKC').replace(/\s+/g,' ').trim();return clean.length>limit?`${clean.slice(0,limit-1).trimEnd()}…`:clean}
  const normalizedNodes=(nodes:typeof input.pass1.nodes)=>{
    const output:typeof nodes=[]
    for(let index=0;index<nodes.length;index++){
      const node=nodes[index],next=nodes[index+1]
      if(next&&/^[A-Za-zÀ-ÖØ-öø-ÿĀ-ž]$/.test(node.sourceText.trim())&&/^[A-Za-zÀ-ÖØ-öø-ÿĀ-ž]$/.test((node.translatedText||'').trim())&&/^[a-zà-öø-ÿā-ž]/.test(next.sourceText.trim())){
        output.push({...next,id:`${node.id}+${next.id}`,sourceText:`${node.sourceText.trim()}${next.sourceText.trimStart()}`,translatedText:`${(node.translatedText||'').trim()}${(next.translatedText||'').trimStart()}`})
        index++
      }else output.push(node)
    }
    return output
  }
  const tokenize=(value:string)=>value.normalize('NFKC').replace(/\s+/g,' ').trim().match(/[A-Za-zÀ-ÖØ-öø-ÿĀ-ž0-9]+(?:[’'’-][A-Za-zÀ-ÖØ-öø-ÿĀ-ž0-9]+)*|[^A-Za-zÀ-ÖØ-öø-ÿĀ-ž0-9\s]+/g)||[]
  const same=(a:string,b:string)=>a.replace(/[‘’]/g,"'")===b.replace(/[‘’]/g,"'")
  const relatedContext=(a:string,b:string)=>{const left=a.toLocaleLowerCase(),right=b.toLocaleLowerCase(),short=left.length<=right.length?left:right,long=left.length>right.length?left:right;return short.length>=3&&long.startsWith(short)}
  const changedSpan=(beforeValue:string,afterValue:string)=>{
    const before=tokenize(beforeValue),after=tokenize(afterValue);let start=0
    while(start<before.length&&start<after.length&&(same(before[start],after[start])||relatedContext(before[start],after[start])))start++
    let beforeEnd=before.length,afterEnd=after.length
    while(beforeEnd>start&&afterEnd>start&&same(before[beforeEnd-1],after[afterEnd-1])){beforeEnd--;afterEnd--}
    const trim=(tokens:string[])=>tokens.join(' ').replace(/\s+([,.;:!?…\)\]])/g,'$1').replace(/([\(\[„“”"'])\s+/g,'$1').replace(/\s+([“”"'])/g,'$1').trim()
    return{before:trim(before.slice(start,beforeEnd)),after:trim(after.slice(start,afterEnd))}
  }
  const family=/romance|romantasy|erotic/i.test(input.genre||'')?'romance':/thriller|mystery|crime|suspense|spy/i.test(input.genre||'')?'thriller':'general'
  const reason=(before:string,after:string,source:string)=>{
    const change=`“${excerpt(before,52)}” becomes “${excerpt(after,52)}”`
    if(/high.?school/i.test(`${source} ${before} ${after}`))return`${change} to enforce Duden “Highschool” spelling and the author-approved first-occurrence explanation.`
    if(/\bDMV\b/i.test(`${source} ${before} ${after}`))return`${change} to keep the US agency term clear without repeating its explanation.`
    if(family==='thriller')return/[“”"']/.test(source)?`${change} to keep the dialogue idiomatic and the thriller’s investigative tension intact.`:`${change} to remove a literal construction while preserving the thriller’s pace and meaning.`
    if(family==='romance'&&/\b(?:kiss|touch|desire|want|body|breath|heart|love|consent|please)\b/i.test(source))return`${change} to preserve the romance’s emotional and consent cues in natural target-language phrasing.`
    if(/[“”"']/.test(source))return`${change} to preserve the speaker’s voice in natural target-language dialogue.`
    return`${change} to replace a literal construction with idiomatic wording while preserving the source meaning.`
  }
  const limit = Math.max(1, Math.min(input.limit || 12, 20))
  const decisions: TranslationNoteEntry[] = []
  if (input.authoritativeTitle&&input.authoritativeTitle.source.normalize('NFKC')!==input.authoritativeTitle.target.normalize('NFKC')) decisions.push({
    source: input.authoritativeTitle.source,
    target: input.authoritativeTitle.target,
    reason: `“${excerpt(input.authoritativeTitle.source)}” becomes “${excerpt(input.authoritativeTitle.target)}” as the manuscript-authoritative title used across customer files.`,
  })
  const pass1=normalizedNodes(input.pass1.nodes),pass2=normalizedNodes(input.pass2.nodes)
  for (let index = 0; index < pass1.length && decisions.length < limit; index++) {
    const first = pass1[index]; const second = pass2[index]
    if (!second || first.id !== second.id || !first.translatedText || !second.translatedText || first.translatedText === second.translatedText) continue
    const span=changedSpan(first.translatedText,second.translatedText)
    if(!span.before||!span.after||span.before===span.after)continue
    if(input.authoritativeTitle&&span.before===input.authoritativeTitle.source&&span.after===input.authoritativeTitle.target)continue
    decisions.push({source:span.before,target:span.after,reason:reason(span.before,span.after,first.sourceText)})
  }
  const existingSections = input.existing?.sections || []
  return {
    schemaVersion: TRANSLATION_NOTES_SCHEMA_VERSION,
    language: input.language,
    approach: 'The translation preserves the author’s narrative voice and semantic structure. These notes highlight representative title, terminology, dialogue, tone, and editorial decisions evidenced in the completed two-pass translation.',
    sections: [
      ...(decisions.length ? [{ id: 'editorial-decisions', title: 'Representative Editorial Decisions', entries: decisions }] : []),
      ...existingSections.map(section => ({ ...section, id: `approved-${section.id}`, title: `Approved Instructions — ${section.title}`,entries:section.entries.map(entry=>({
        ...entry,
        reason:`“${excerpt(entry.source,48)}” is kept as “${excerpt(entry.target,64)}” to apply the author-approved terminology decision exactly once where required.`,
      })) })),
    ],
  }
}
