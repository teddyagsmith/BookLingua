import test from 'node:test'
import assert from 'node:assert/strict'
import AdmZip from 'adm-zip'
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx'
import { applyTitleAuthority, cleanBookTitle, resolveTitleAuthority } from '../lib/authoritative-title'
import { assessSourceFormatting } from '../lib/formatting-policy'
import { buildFinalSemanticDocx, buildSemanticDocxPreservingSource, buildSemanticEpub, buildSemanticReviewDocx, wordLevelDiff } from '../lib/semantic-artifacts'
import { deriveEditorialTranslationNotes, validateTranslationNotes } from '../lib/translation-notes'
import { parseSemanticDocx, parseSemanticTxt } from '../lib/semantic-parser'

function document(nodes: Array<{ sourceText: string; translatedText: string }>,sourceFormat:'epub'|'docx'|'txt'='epub'): any {
  return { schemaVersion: '2.0', sourceHash: 'source', sourceFormat, parserConfidence: 1, nodes: nodes.map((node,index)=>({ id:`node-${index}`, chapterId:'chapter-1', type:index?'paragraph':'heading', headingLevel:index?null:1, sourceChapterNumber:null, order:index, sourceLocation:`OEBPS/book.xhtml:block:${index}`,...node })) }
}

function epub(title:string,h1='Chapter 1'):Buffer{
  const zip:any=new AdmZip();zip.addFile('mimetype',Buffer.from('application/epub+zip'));zip.addFile('META-INF/container.xml',Buffer.from('<container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>'))
  zip.addFile('OEBPS/content.opf',Buffer.from(`<package xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:title>${title}</dc:title></metadata><manifest><item id="book" href="book.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="book"/></spine></package>`))
  zip.addFile('OEBPS/book.xhtml',Buffer.from(`<html><body><h1>${h1}</h1></body></html>`));return zip.toBuffer()
}

test('existing exact semantic title node remains authoritative for French and German', () => {
  const input=document([
    {sourceText:'Bride of the Hollow King',translatedText:"L’Épouse du Roi Vide"},
    {sourceText:'Did you love Bride of the Hollow King?',translatedText:'Vous avez aimé La Mariée du Roi Creux ?'},
  ])
  const authority=resolveTitleAuthority({document:input,checkoutTitle:'Bride of the Hollow King',source:epub('Bride of the Hollow King','Bride of the Hollow King')})
  assert.equal(authority.translatedValue,"L’Épouse du Roi Vide")
  const result=applyTitleAuthority(input,'Bride of the Hollow King',authority)
  assert.match(result.document.nodes[1].translatedText!,/L’Épouse du Roi Vide/)
  assert.doesNotMatch(result.document.nodes[1].translatedText!,/Mariée du Roi Creux/)
  const german=document([{sourceText:'Bride of the Hollow King',translatedText:'Braut des Hohlen Königs'}])
  assert.equal(resolveTitleAuthority({document:german,checkoutTitle:'Bride of the Hollow King',source:epub('Bride of the Hollow King')}).translatedValue,'Braut des Hohlen Königs')
})

test('metadata-only EPUB preserves its title and never treats first H1 Chapter 1 as title',()=>{
  const source=epub('Bride of the Hollow King','Chapter 1'),doc=document([{sourceText:'Chapter 1',translatedText:'Chapitre 1'}])
  const authority=resolveTitleAuthority({document:doc,checkoutTitle:'Bride of the Hollow King',source})
  assert.equal(authority.sourceKind,'epub_metadata');assert.equal(authority.effectiveValue,'Bride of the Hollow King');assert.equal(authority.translatedValue,undefined);assert.equal(authority.warning?.code,'TITLE_TRANSLATION_UNAVAILABLE')
  const output:any=new AdmZip(buildSemanticEpub(source,doc,authority)),opf=output.getEntry('OEBPS/content.opf').getData().toString('utf8')
  assert.match(opf,/<dc:title>Bride of the Hollow King<\/dc:title>/);assert.doesNotMatch(opf,/<dc:title>Chapitre 1<\/dc:title>/)
})

test('internal upload labels are stripped from title fallback',()=>{
  assert.equal(cleanBookTitle('Updated eBook Reclaim Your Longevity'),'Reclaim Your Longevity')
})

test('safe title matching accepts subtitle, punctuation and apostrophe variation without fuzzy heading guesses',()=>{
  for(const [checkout,source,target] of [
    ['Bride of the Hollow King','Bride of the Hollow King: A Gothic Romance','L’Épouse du Roi Vide : une romance gothique'],
    ['Bride of the Hollow King','Bride of the Hollow King!','L’Épouse du Roi Vide !'],
    ["King's Bride",'King’s Bride','La Fiancée du Roi'],
  ]){
    const doc=document([{sourceText:source,translatedText:target}]),authority=resolveTitleAuthority({document:doc,checkoutTitle:checkout,source:epub(checkout)})
    assert.equal(authority.sourceKind,'semantic_title_node');assert.equal(authority.translatedValue,target)
  }
  const chapter=document([{sourceText:'Chapter 1',translatedText:'Chapitre 1'}]),authority=resolveTitleAuthority({document:chapter,checkoutTitle:'Bride of the Hollow King',source:epub('Bride of the Hollow King')})
  assert.notEqual(authority.sourceKind,'semantic_title_node')
})

test('DOCX subtitle variation can be authoritative while absent title safely falls back to original metadata',async()=>{
  const packed=Buffer.from(await Packer.toBuffer(new Document({sections:[{children:[new Paragraph('Chapter 1')]}]}))),zip:any=new AdmZip(packed)
  zip.updateFile('docProps/core.xml',Buffer.from(zip.getEntry('docProps/core.xml').getData().toString('utf8').replace('</cp:coreProperties>','<dc:title>Bride of the Hollow King</dc:title></cp:coreProperties>')))
  const source=zip.toBuffer(),subtitle=document([{sourceText:'Bride of the Hollow King — A Novel',translatedText:'Braut des Hohlen Königs — Ein Roman'}],'docx')
  assert.equal(resolveTitleAuthority({document:subtitle,checkoutTitle:'Bride of the Hollow King',source}).translatedValue,'Braut des Hohlen Königs — Ein Roman')
  const absent=document([{sourceText:'Chapter 1',translatedText:'Kapitel 1'}],'docx'),fallback=resolveTitleAuthority({document:absent,checkoutTitle:'Bride of the Hollow King',source})
  assert.equal(fallback.sourceKind,'docx_metadata');assert.equal(fallback.effectiveValue,'Bride of the Hollow King');assert.equal(fallback.fallbackUsed,true)
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

test('review diff keeps bilingual title replacements coherent and suppresses typography-only noise',()=>{
  const title=wordLevelDiff('Bride of the Hollow King ?',"L'Épouse du Roi Vide ?")
  assert.equal(title.filter(token=>token.kind==='delete').map(token=>token.text).join(''),'Bride of the Hollow King ?')
  assert.equal(title.filter(token=>token.kind==='insert').map(token=>token.text).join(''),"L'Épouse du Roi Vide ?")
  assert.ok(title.findIndex(token=>token.kind==='delete')<title.findIndex(token=>token.kind==='insert'))
  const apostrophe=wordLevelDiff("Il s'adoucit et parle d'entre eux.",'Il s’adoucit et parle d’entre eux.')
  assert.deepEqual(apostrophe,[{text:'Il s’adoucit et parle d’entre eux.',kind:'same'}])
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
