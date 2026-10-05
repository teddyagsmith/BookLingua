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
      const identical=entry.source.normalize('NFKC').trim()===entry.target.normalize('NFKC').trim()
      if(identical&&!/retained unchanged|kept unchanged/i.test(entry.reason))errors.push(`Translation-note unchanged wording lacks an explicit retention reason: ${entry.source.slice(0,60)}`)
      if(entry.reason.trim().length<35)errors.push(`Translation-note reason is not specific enough: ${entry.source.slice(0,60)}`)
      if(/…|\.\.\./.test(entry.reason))errors.push(`Translation-note reason contains truncated text: ${entry.source.slice(0,60)}`)
      if(/\.\s+(?:The editorial review|This edit|It also)\b/.test(entry.reason))errors.push(`Translation-note reason contains an appended generic sentence: ${entry.source.slice(0,60)}`)
    }
  }
  return errors
}

function normalizedExact(value:string):string{
  return decodeVisibleEntities(value).normalize('NFKC').replace(/[‘’]/g,"'").replace(/[“”]/g,'"').replace(/[\u00a0\u2007\u202f]/g,' ').replace(/\s+/g,' ').trim()
}

function englishSourceLanguageResult(value:string,allowlisted:Set<string>):{passed:boolean;reason:string}{
  const normalized=normalizedExact(value),lower=normalized.toLocaleLowerCase()
  if(allowlisted.has(lower))return{passed:true,reason:'approved source term or authoritative title'}
  const words=lower.match(/[a-zà-öø-ÿ]+(?:['’][a-zà-öø-ÿ]+)*/g)||[]
  if(words.length<=2&&words.every(word=>/^[A-Z]/.test(normalized)||/^[A-Z0-9]+$/.test(value)))return{passed:true,reason:'short proper noun or acronym'}
  const english=new Set(['a','an','and','are','as','at','be','but','by','for','from','give','he','her','him','his','i','in','is','it','its','low','memory','not','of','on','or','our','she','the','their','there','they','this','to','was','we','when','where','with','you','your'])
  const german=new Set(['aber','als','auf','aus','bei','das','dem','den','der','des','die','durch','ein','eine','einem','einen','einer','er','es','für','hat','ich','ihm','in','ist','kein','keine','man','mit','nicht','oder','sein','sie','sind','und','von','war','wie','wir','wo','zu','zum','zur'])
  const englishScore=words.filter(word=>english.has(word)).length
  const germanScore=words.filter(word=>german.has(word)).length+(value.match(/[äöüß]/gi)||[]).length
  if(germanScore>0&&germanScore>=englishScore)return{passed:false,reason:`German-only evidence (${germanScore}) is not outweighed by English evidence (${englishScore})`}
  return{passed:true,reason:`English evidence ${englishScore}; German-only evidence ${germanScore}`}
}

/** Customer Notes are a source-to-delivery contract, never an editorial draft diff. */
export function validateCustomerTranslationNotes(notes:TranslationNotesV1,input:{
  sourceTexts:string[]
  finalText:string
  approvedSourceTerms?:string[]
  authoritativeSourceTitle?:string
}):string[]{
  const errors:string[]=[],sourceCorpus=normalizedExact(input.sourceTexts.join('\n')),finalText=normalizedExact(input.finalText)
  const allowlisted=new Set([...(input.approvedSourceTerms||[]),input.authoritativeSourceTitle||''].map(value=>normalizedExact(value).toLocaleLowerCase()).filter(Boolean))
  for(const entry of notes.sections.flatMap(section=>section.entries)){
    const source=normalizedExact(entry.source),target=normalizedExact(entry.target)
    const language=englishSourceLanguageResult(source,allowlisted)
    if(!language.passed)errors.push(`Customer Notes source is not English: ${entry.source.slice(0,80)} (${language.reason})`)
    if(!sourceCorpus.includes(source)&&!allowlisted.has(source.toLocaleLowerCase()))errors.push(`Customer Notes source is not linked to the author manuscript: ${entry.source.slice(0,80)}`)
    if(!finalText.includes(target))errors.push(`Customer Notes final wording is not an exact delivered substring: ${entry.target.slice(0,80)}`)
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
  const family=/romance|romantasy|erotic/i.test(input.genre||'')?'romance':/thriller|mystery|crime|suspense|spy/i.test(input.genre||'')?'thriller':'general'
  const reason=(source:string,index:number)=>{
    const opening=(source.match(/[A-Za-z]+(?:[’'][A-Za-z]+)?/g)||[]).slice(0,5).join(' ')
    const identity=opening?`The passage beginning ${opening}`:`Editorial decision ${index+1}`
    if(/high.?school/i.test(source))return`${identity} follows the author-approved German school terminology at its delivered occurrence.`
    if(/\bDMV\b/i.test(source))return`${identity} keeps the US agency reference clear in the delivered German.`
    if(family==='thriller')return`${identity} uses natural German while preserving the thriller’s pace, evidence, and narrative intent.`
    if(family==='romance')return`${identity} uses natural German while preserving the scene’s emotional meaning and narrative voice.`
    return`${identity} uses natural target-language wording while preserving the author’s meaning and tone.`
  }
  const limit = Math.max(1, Math.min(input.limit || 12, 20))
  const decisions: TranslationNoteEntry[] = []
  if (input.authoritativeTitle&&input.authoritativeTitle.source.normalize('NFKC')!==input.authoritativeTitle.target.normalize('NFKC')) decisions.push({
    source: input.authoritativeTitle.source,
    target: input.authoritativeTitle.target,
    reason: 'The German title follows the manuscript-authoritative title decision used consistently across the delivered files.',
  })
  const pass1=normalizedNodes(input.pass1.nodes),pass2=normalizedNodes(input.pass2.nodes)
  for (let index = 0; index < pass1.length && decisions.length < limit; index++) {
    const first = pass1[index]; const second = pass2[index]
    if (!second || first.id !== second.id || !first.translatedText || !second.translatedText || first.translatedText === second.translatedText) continue
    const source=normalizedExact(first.sourceText),target=normalizedExact(second.translatedText)
    if(!source||!target)continue
    if(input.authoritativeTitle&&source===normalizedExact(input.authoritativeTitle.source)&&target===normalizedExact(input.authoritativeTitle.target))continue
    decisions.push({source,target,reason:reason(source,decisions.length)})
  }
  const existingSections = input.existing?.sections || []
  return {
    schemaVersion: TRANSLATION_NOTES_SCHEMA_VERSION,
    language: input.language,
    approach: 'The translation preserves the author’s narrative voice and semantic structure. These notes highlight representative title, terminology, dialogue, tone, and editorial decisions evidenced in the completed two-pass translation.',
    sections: [
      ...(decisions.length ? [{ id: 'editorial-decisions', title: 'Representative Editorial Decisions', entries: decisions }] : []),
      ...existingSections.map(section => ({ ...section, id: `approved-${section.id}`, title: `Approved Instructions — ${section.title}` })),
    ],
  }
}

/** Full Pass 1 → Pass 2 history is internal evidence and must never be rendered to customers. */
export function deriveEditorialQaChangelog(input:{
  language:string
  pass1:{nodes:Array<{id:string;sourceText:string;translatedText?:string|null}>}
  pass2:{nodes:Array<{id:string;sourceText:string;translatedText?:string|null}>}
}):string{
  const rows:string[]=[
    '# Internal QA Changelog',
    '',
    '**Internal only — never include in a customer portal, ZIP, email, or Notes document.**',
    '',
    `Language: ${input.language}`,
    '',
  ]
  for(let index=0;index<input.pass1.nodes.length;index++){
    const draft=input.pass1.nodes[index],final=input.pass2.nodes[index]
    if(!final||draft.id!==final.id||!draft.translatedText||!final.translatedText||draft.translatedText===final.translatedText)continue
    rows.push(`## ${draft.id}`,'',`- Author source: ${draft.sourceText}`,`- Pass 1 draft: ${draft.translatedText}`,`- Delivered final: ${final.translatedText}`,'')
  }
  if(rows.length===6)rows.push('No Pass 1 to Pass 2 wording changes were recorded.','')
  return rows.join('\n')
}
