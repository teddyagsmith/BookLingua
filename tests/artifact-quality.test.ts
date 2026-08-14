import test from 'node:test'
import assert from 'node:assert/strict'
import AdmZip from 'adm-zip'
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx'
import { authoritativeTranslatedTitle, enforceAuthoritativeTranslatedTitle } from '../lib/authoritative-title'
import { assessSourceFormatting } from '../lib/formatting-policy'
import { buildFinalSemanticDocx, buildSemanticDocxPreservingSource, buildSemanticReviewDocx, wordLevelDiff } from '../lib/semantic-artifacts'
import { deriveEditorialTranslationNotes, validateTranslationNotes } from '../lib/translation-notes'
import { parseSemanticDocx, parseSemanticTxt } from '../lib/semantic-parser'

function document(nodes: Array<{ sourceText: string; translatedText: string }>): any {
  return { schemaVersion: '2.0', sourceHash: 'source', sourceFormat: 'epub', parserConfidence: 1, nodes: nodes.map((node,index)=>({ id:`node-${index}`, chapterId:'chapter-1', type:index?'paragraph':'heading', headingLevel:index?null:1, sourceChapterNumber:null, order:index, sourceLocation:`book.xhtml:block:${index}`,...node })) }
}

test('authoritative title comes from the exact semantic title node and is enforced in title references', () => {
  const input=document([
    {sourceText:'Bride of the Hollow King',translatedText:"L’Épouse du Roi Vide"},
    {sourceText:'Did you love Bride of the Hollow King?',translatedText:'Vous avez aimé La Mariée du Roi Creux ?'},
  ])
  assert.equal(authoritativeTranslatedTitle(input,'Bride of the Hollow King'),"L’Épouse du Roi Vide")
  const result=enforceAuthoritativeTranslatedTitle(input,'Bride of the Hollow King')
  assert.match(result.document.nodes[1].translatedText!,/L’Épouse du Roi Vide/)
  assert.doesNotMatch(result.document.nodes[1].translatedText!,/Mariée du Roi Creux/)
})

test('word-level review diff does not duplicate the whole changed paragraph', async () => {
  const pass1=document([{sourceText:'Title',translatedText:'Titre'},{sourceText:'She walked into the dark hall.',translatedText:'Elle entra dans la salle sombre.'}])
  const pass2=structuredClone(pass1);pass2.nodes[1].translatedText='Elle pénétra dans la salle obscure.'
  const tokens=wordLevelDiff(pass1.nodes[1].translatedText,pass2.nodes[1].translatedText)
  assert.ok(tokens.some(token=>token.kind==='same'))
  assert.ok(tokens.some(token=>token.kind==='delete'))
  assert.ok(tokens.some(token=>token.kind==='insert'))
  const zip:any=new AdmZip(await buildSemanticReviewDocx(pass1,pass2,'Titre'))
  const xml=zip.getEntry('word/document.xml')!.getData().toString('utf8')
  assert.match(xml,/w:strike/);assert.match(xml,/w:highlight/)
  assert.equal((xml.match(/Elle/g)||[]).length,1)
})

test('formatting policy preserves sound structured sources and falls back for weak input', () => {
  assert.equal(assessSourceFormatting({sourceFormat:'epub',parserConfidence:1,hasHeadings:true,hasPresentationMetadata:true}).disposition,'preserve')
  assert.equal(assessSourceFormatting({sourceFormat:'docx',parserConfidence:.85,hasHeadings:true,hasPresentationMetadata:false}).disposition,'preserve-and-normalize')
  assert.equal(assessSourceFormatting({sourceFormat:'txt',parserConfidence:.4,hasHeadings:false,hasPresentationMetadata:false}).disposition,'clean-fallback')
})

test('well-structured DOCX retains its source presentation while weak text uses clean fallback', async()=>{
  const source=Buffer.from(await Packer.toBuffer(new Document({sections:[{children:[
    new Paragraph({heading:HeadingLevel.HEADING_1,children:[new TextRun({text:'Chapter 1',bold:true,color:'663399'})]}),
    new Paragraph({children:[new TextRun({text:'Styled opening.',italics:true})]}),
  ]}]})))
  const parsed=await parseSemanticDocx(source,'docx-source');parsed.nodes.forEach((node,index)=>{node.translatedText=index?'Ouverture stylée.':'Chapitre 1'})
  const preserved=await buildSemanticDocxPreservingSource(source,parsed),zip:any=new AdmZip(preserved),xml=zip.getEntry('word/document.xml')!.getData().toString('utf8')
  assert.match(xml,/663399/);assert.match(xml,/w:i/);assert.match(xml,/Chapitre/)
  const weak=parseSemanticTxt('Plain body only.','txt-source');weak.nodes[0].translatedText='Corps simple.'
  assert.ok((await buildFinalSemanticDocx(Buffer.from('Plain body only.'),weak,'Simple')).length>0)
})

test('translation notes are derived from real editorial changes and remain schema-valid', () => {
  const pass1=document([{sourceText:'Title',translatedText:'Titre'},{sourceText:'A sharp breath.',translatedText:'Un souffle vif.'}])
  const pass2=structuredClone(pass1);pass2.nodes[1].translatedText='Une inspiration brusque.'
  const notes=deriveEditorialTranslationNotes({language:'French',pass1,pass2,authoritativeTitle:{source:'Title',target:'Titre'}})
  assert.deepEqual(validateTranslationNotes(notes),[])
  assert.equal(notes.sections[0].entries.length,2)
  assert.match(notes.sections[0].entries[1].reason,/editorial review/)
})
