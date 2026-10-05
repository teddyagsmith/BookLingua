import test from 'node:test'
import assert from 'node:assert/strict'
import {applyBookWideExplanatoryNotes,auditBookWideExplanatoryNotes,explanatorySpans} from '../lib/explanatory-notes'
import {SemanticDocumentV2} from '../lib/semantic-document'
import {TranslationBriefV1} from '../lib/translation-brief'

function document(rows:Array<[string,string]>):SemanticDocumentV2{return{schemaVersion:'2.0',sourceHash:'source',sourceFormat:'docx',parserConfidence:1,nodes:rows.map(([sourceText,translatedText],index)=>({id:`node-${index}`,type:'paragraph',order:index,chapterId:'chapter-1',sourceText,translatedText,headingLevel:null,sourceLocation:`docx:block:${index}`,sourceChapterNumber:null}))}}
const brief:TranslationBriefV1={schemaVersion:'1.0',language:'de',sourceManifestFingerprint:'source',approvedAt:'2026-10-05T00:00:00.000Z',revision:1,approvalSource:'author_scan',items:[
  {id:'one',sourceTerm:'high school',issueType:'country_specific',authorDecision:'footnote',targetInstruction:'Explain once.'},
  {id:'two',sourceTerm:'DMV',issueType:'country_specific',authorDecision:'footnote',targetInstruction:'Explain once.'},
  {id:'three',sourceTerm:'preparatory school',issueType:'country_specific',authorDecision:'false_positive',targetInstruction:'No note.'},
]}
const verified=[
  {sourceTerm:'high school',targetTerm:'Highschool-Foto',canonicalNote:'Highschool: die amerikanische Oberstufe'},
  {sourceTerm:'DMV',targetTerm:'DMV',canonicalNote:'US-amerikanische Kraftfahrzeugbehörde'},
]

test('selected explanations appear once at first source occurrence and unselected/stray brackets are removed',()=>{
  const source=document([
    ['His high school photo.',''],['Another high school memory.',''],['Search DMV records.',''],['The DMV was slow.',''],
    ['A preparatory school.',''],['Was a gun license required?',''],
  ])
  const target=document([
    ['His high school photo.','Sein Highschool-Foto (lange alte Erklärung).'],['Another high school memory.','Noch eine Highschool (zweite Erklärung).'],
    ['Search DMV records.','Die DMV (alte Behörde).'],['The DMV was slow.','Die DMV (noch einmal).'],
    ['A preparatory school.','Eine Vorbereitungsschule (unbestellte Erklärung).'],['Was a gun license required?','War eine Lizenz nötig (falscher DMV-Hinweis)?'],
  ])
  const output=applyBookWideExplanatoryNotes({source,target,brief,verified,removeUnexpected:true})
  const text=output.nodes.map(node=>node.translatedText).join('\n')
  assert.equal((text.match(/Highschool: die amerikanische Oberstufe/g)||[]).length,1)
  assert.equal((text.match(/US-amerikanische Kraftfahrzeugbehörde/g)||[]).length,1)
  assert.doesNotMatch(text,/zweite Erklärung|noch einmal|unbestellte Erklärung|falscher DMV-Hinweis/)
  const audit=auditBookWideExplanatoryNotes(source,output,brief,verified)
  assert.equal(audit.selected['high school'].count,1)
  assert.equal(audit.selected.DMV.count,1)
  assert.equal(audit.unrequestedAdditions.length,0)
  assert.equal(audit.bracketAdditionsWithoutSource,2)
})

test('a canonical note cannot be attached where its source term is absent',()=>{
  const source=document([['Search DMV records.',''],['Was a gun license required?','']])
  const target=document([['Search DMV records.','Die DMV.'],['Was a gun license required?','Eine Lizenz (US-amerikanische Kraftfahrzeugbehörde).']])
  assert.throws(()=>applyBookWideExplanatoryNotes({source,target,brief:{...brief,items:[brief.items[1]]},verified:[verified[1]],removeUnexpected:false}),/Target explanatory addition absent in source/)
})

test('explanation contract detects brackets, paired hyphen/en/em dashes, and free-standing colon additions',()=>{
  const spans=explanatorySpans('A (bracket note). B - das heißt Schule -. C – amerikanische Schule –. D — meaning school —. Highschool: die amerikanische Oberstufe.')
  assert.deepEqual(spans.map(item=>item.style),['bracket','paired_dash','paired_dash','paired_dash','colon'])
})

test('later dash and colon explanations are removed while the canonical first note remains once',()=>{
  const source=document([['His high school photo.',''],['When he was in high school, he hated it.',''],['Another high school memory.','']])
  const target=document([
    ['His high school photo.','Sein Highschool-Foto (alte Erklärung).'],
    ['When he was in high school, he hated it.','Als er auf die Highschool ging – die amerikanische Oberstufe –, hasste er es.'],
    ['Another high school memory.','Noch eine Highschool: die amerikanische Oberstufe.'],
  ])
  const onlyHighschool={...brief,items:[brief.items[0]]}
  const output=applyBookWideExplanatoryNotes({source,target,brief:onlyHighschool,verified:[verified[0]],removeUnexpected:true})
  assert.equal(output.nodes[0].translatedText,'Sein Highschool-Foto (Highschool: die amerikanische Oberstufe).')
  assert.equal(output.nodes[1].translatedText,'Als er auf die Highschool ging, hasste er es.')
  assert.equal(output.nodes[2].translatedText,'Noch eine Highschool.')
  const audit=auditBookWideExplanatoryNotes(source,output,onlyHighschool,[verified[0]])
  assert.equal(audit.selected['high school'].count,1)
  assert.deepEqual(audit.unrequestedAdditions,[])
})
