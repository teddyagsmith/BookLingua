import test from 'node:test'
import assert from 'node:assert/strict'
import AdmZip from 'adm-zip'
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx'
import { applyTitleAuthority, cleanBookTitle, resolveTitleAuthority } from '../lib/authoritative-title'
import { assessSourceFormatting } from '../lib/formatting-policy'
import { buildFinalSemanticDocx, buildSemanticDocx, buildSemanticDocxPreservingSource, buildSemanticEpub, buildSemanticReviewDocx, wordLevelDiff } from '../lib/semantic-artifacts'
import { deriveEditorialTranslationNotes, validateTranslationNotes } from '../lib/translation-notes'
import { parseSemanticDocx, parseSemanticTxt } from '../lib/semantic-parser'
import { inferHeadingsFromContents } from '../lib/extract-segments'
import { validateArtifact } from '../lib/artifact-validation-v2'

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
  const doc=document([{sourceText:'Reclaim Your Longevity',translatedText:'Recupera tu longevidad'}])
  const authority=resolveTitleAuthority({document:doc,checkoutTitle:'Updated eBook Reclaim Your Longevity',source:epub('Reclaim Your Longevity')})
  assert.equal(authority.sourceKind,'semantic_title_node')
  assert.equal(authority.translatedValue,'Recupera tu longevidad')
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

test('review replacements retain a visible boundary between deleted and inserted words',async()=>{
  const pass1=document([{sourceText:'Title',translatedText:'Titel'},{sourceText:'Do it.',translatedText:'Wir machen es.'}])
  const pass2=structuredClone(pass1);pass2.nodes[1].translatedText='Wir Tun es.'
  const zip:any=new AdmZip(await buildSemanticReviewDocx(pass1,pass2,'Titel'))
  const xml=zip.getEntry('word/document.xml')!.getData().toString('utf8')
  assert.doesNotMatch(xml,/machen<\/w:t>.*?<w:t[^>]*>Tun/)
  assert.match(xml,/machen<\/w:t>.*?<w:t[^>]*> Tun/)
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

test('clean DOCX output uses the approved Calibri house-style hierarchy', async () => {
  const input=document([{sourceText:'Chapter 1',translatedText:'Capítulo 1'},{sourceText:'Body.',translatedText:'Cuerpo.'}])
  const zip:any=new AdmZip(await buildSemanticDocx(input,'Título','final'))
  const styles=zip.getEntry('word/styles.xml')!.getData().toString('utf8')
  assert.match(styles,/<w:docDefaults>[\s\S]*?w:ascii="Calibri"[\s\S]*?<w:sz w:val="22"/)
  const styleBlock=(id:string)=>styles.match(new RegExp(`<w:style[^>]+w:styleId="${id}"[\\s\\S]*?</w:style>`))?.[0]||''
  assert.match(styleBlock('Title'),/<w:sz w:val="52"/)
  for(const [level,size] of [[1,36],[2,30],[3,26],[4,24],[5,22],[6,22]]){
    assert.match(styleBlock(`Heading${level}`),/w:ascii="Calibri"/)
    assert.match(styleBlock(`Heading${level}`),new RegExp(`<w:sz w:val="${size}"`))
    assert.equal((styles.match(new RegExp(`w:styleId="Heading${level}"`,'g'))||[]).length,1)
  }
  assert.equal((styles.match(/w:styleId="Title"/g)||[]).length,1)
  assert.equal(validateArtifact(zip.toBuffer(),'docx').passed,true)
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

test('flattened DOCX contents recover only exact later body headings',()=>{
  const paragraph=(id:number,text:string):any=>({id,type:'paragraph',level:0,text})
  const input=[paragraph(0,'Contents'),paragraph(1,'Part One ........ 1'),paragraph(2,'Healthy Mouth .... 3'),paragraph(3,'Daily Care .... 7'),paragraph(4,'Body introduction.'),paragraph(5,'Part One'),paragraph(6,'Healthy Mouth'),paragraph(7,'Daily Care'),paragraph(8,'Long body text.')]
  const recovered=inferHeadingsFromContents(input)
  assert.equal(recovered[1].type,'paragraph');assert.equal(recovered[2].type,'paragraph')
  assert.deepEqual(recovered.slice(5,8).map(item=>[item.type,item.level]),[['heading',1],['heading',2],['heading',2]])
})

test('source-preserving DOCX applies recovered semantic heading styles',async()=>{
  const source=Buffer.from(await Packer.toBuffer(new Document({sections:[{children:[new Paragraph('Recovered chapter'),new Paragraph('Body text.')]}]})))
  const parsed=await parseSemanticDocx(source,'recovered-source');parsed.nodes[0].type='heading';parsed.nodes[0].headingLevel=1;parsed.nodes.forEach(node=>{node.translatedText=node.sourceText})
  const zip:any=new AdmZip(await buildSemanticDocxPreservingSource(source,parsed)),xml=zip.getEntry('word/document.xml')!.getData().toString('utf8')
  assert.match(xml,/w:pStyle w:val="Heading1"/)
})

test('translation notes are derived from real editorial changes and remain schema-valid', () => {
  const pass1=document([{sourceText:'Title',translatedText:'Titre'},{sourceText:'A sharp breath.',translatedText:'Un souffle vif.'}])
  const pass2=structuredClone(pass1);pass2.nodes[1].translatedText='Une inspiration brusque.'
  const notes=deriveEditorialTranslationNotes({language:'French',pass1,pass2,authoritativeTitle:{source:'Title',target:'Titre'}})
  assert.deepEqual(validateTranslationNotes(notes),[])
  assert.equal(notes.sections[0].entries.length,2)
  assert.match(notes.sections[0].entries[1].reason,/editorial review/)
})

test('preserved DOCX gains a real default Normal style when the source stylesheet leaves it dangling',async()=>{
  const source=Buffer.from(await Packer.toBuffer(new Document({sections:[{children:[
    new Paragraph({heading:HeadingLevel.HEADING_1,children:[new TextRun('Chapter 1')]}),
    new Paragraph({children:[new TextRun('Body text.')]}),
  ]}]})))
  // Simulate a customer manuscript whose own styles.xml never defines "Normal" even though
  // every style references it — the exact shape that shipped a bold/centered ES delivery.
  const brokenZip:any=new AdmZip(source)
  const strippedStyles=brokenZip.getEntry('word/styles.xml').getData().toString('utf8').replace(/<w:style\b[^>]*w:styleId=["']Normal["'][\s\S]*?<\/w:style>/,'')
  assert.doesNotMatch(strippedStyles,/w:styleId="Normal"/)
  brokenZip.updateFile('word/styles.xml',Buffer.from(strippedStyles))
  const brokenSource=brokenZip.toBuffer()
  const parsed=await parseSemanticDocx(brokenSource,'docx-source');parsed.nodes.forEach((node,index)=>{node.translatedText=index?'Corps du texte.':'Chapitre 1'})
  const preserved=await buildSemanticDocxPreservingSource(brokenSource,parsed)
  const outputZip:any=new AdmZip(preserved)
  const stylesXml=outputZip.getEntry('word/styles.xml').getData().toString('utf8')
  assert.match(stylesXml,/<w:style\b[^>]*w:type="paragraph"[^>]*w:default="1"/)
})
