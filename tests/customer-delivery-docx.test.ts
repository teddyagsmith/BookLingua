import test from 'node:test'
import assert from 'node:assert/strict'
import AdmZip from 'adm-zip'
import { renderCustomerLaunchPackDocx,renderCustomerTranslationNotesDocx,renderCustomerUploadGuideDocx } from '../lib/customer-delivery-docx'
import { renderChapterMapDocx } from '../lib/chapter-map'
import { BRANDED_DOCUMENT_LOGO_ASSET,BRANDED_DOCUMENT_LOGO_HEIGHT_PX,BRANDED_DOCUMENT_LOGO_INTRINSIC,BRANDED_DOCUMENT_LOGO_WIDTH_MM,BRANDED_DOCUMENT_LOGO_WIDTH_PX } from '../lib/branded-document-header'
import { researchFields } from './launch-pack-fixture'

function documentXml(bytes:Buffer):string{const zip:any=new AdmZip(bytes);return zip.readAsText('word/document.xml')}
function allWordXml(bytes:Buffer):string{const zip:any=new AdmZip(bytes);return zip.getEntries().filter((entry:any)=>/^word\/.*\.xml$/.test(entry.entryName)).map((entry:any)=>zip.readAsText(entry.entryName)).join('\n')}

test('Launch Pack JSON deterministically renders as a human-readable DOCX',async()=>{
  const source=Buffer.from(JSON.stringify({schemaVersion:'3.0',locale:'fr',language:'French',market:'France',amazonDomain:'amazon.fr',currency:'EUR',backendKeywords:Array.from({length:7},(_,i)=>`mot-clé français ${i}`),adKeywords:Array.from({length:20},(_,i)=>`recherche française ${i}`),categories:['Romantasy française','Romance fantastique','Fantasy sombre'],pricingRecommendation:{ebook:'4,99 €',paperback:'14,99 €',reasoning:'RAISON FRANÇAISE INTERNE'},bookDescription:'Une description gothique en français.',reviewStrategy:['STRATÉGIE FRANÇAISE INTERNE'],kdpUploadChecklist:['ÉTAPE FRANÇAISE INTERNE'],...researchFields}))
  const first=await renderCustomerLaunchPackDocx(source,'Bride of the Hollow King',"L'Épouse du Roi Vide"),second=await renderCustomerLaunchPackDocx(source,'Bride of the Hollow King',"L'Épouse du Roi Vide")
  assert.equal(documentXml(first),documentXml(second))
  const xml=allWordXml(first)
  for(const expected of ['L&apos;Épouse du Roi Vide','Une description gothique en français.','mot-clé français 0','Romance fantastique','READY TO COPY INTO YOUR AMAZON LISTING','Your Launch at a Glance','If you only do three things','Minimum viable launch','Recommended positioning','Recommended launch price','Best promotional angle','Where to focus','Book Description','Amazon Keywords','Suggested Categories','Pricing','validated launch-price recommendations','Recruit advance readers','KDP Upload Checklist','Set the book language to French','All explanations and instructions are in English','Translate your book in hours, not months'])assert.ok(xml.includes(expected),expected)
  assert.ok(new AdmZip(first).getEntries().some((entry:any)=>entry.entryName.startsWith('word/media/image-')))
  for(const forbidden of ['RAISON FRANÇAISE INTERNE','STRATÉGIE FRANÇAISE INTERNE','ÉTAPE FRANÇAISE INTERNE','w:pageBreakBefore'])assert.ok(!xml.includes(forbidden),forbidden)
  for(const forbidden of ['schemaVersion','backendKeywords','request_identity'])assert.doesNotMatch(xml,new RegExp(forbidden,'i'))
  assert.doesNotMatch(xml,/<w:t[^>]*>[^<]*model/i)
})

test('structured notes text deterministically renders as a customer DOCX',async()=>{
  const source=Buffer.from("Translation Notes — fr\nCareful decisions grounded in the completed translation.\n\nRepresentative decisions\nBride of the Hollow King → L'Épouse du Roi Vide\nReason: Used consistently as the authoritative translated book title in the manuscript and customer files.\nCaelan → Caelan\nReason: Proper name retained consistently.\n")
  const first=await renderCustomerTranslationNotesDocx(source,'Bride of the Hollow King','French'),second=await renderCustomerTranslationNotesDocx(source,'Bride of the Hollow King','French')
  assert.equal(documentXml(first),documentXml(second))
  const xml=documentXml(first)
  assert.match(xml,/Translation Notes/);assert.match(xml,/L&apos;Épouse du Roi Vide/);assert.match(xml,/French Translation/);assert.match(xml,/WHY WE CHOSE IT/);assert.match(xml,/Caelan/)
  for(const forbidden of ['schemaVersion','semantic node','build ID'])assert.doesNotMatch(xml,new RegExp(forbidden,'i'))
  await assert.rejects(()=>renderCustomerTranslationNotesDocx(Buffer.from('Translation Notes — fr\nNothing recorded.'),'Bride','French'),/no customer-facing decisions/)
})

test('customer guide is deterministic, renamed and structured as Start Here',async()=>{
  const first=await renderCustomerUploadGuideDocx(),second=await renderCustomerUploadGuideDocx()
  assert.equal(documentXml(first),documentXml(second))
  const xml=documentXml(first)
  for(const expected of ['START HERE','How to Use Your Translations + Upload Guide','Start with these three steps','What every delivered file is for','Review and edit the Final DOCX','Understand the Review document','Use the Translation Notes','Use the Chapter Map in practice','Chapter 1 → Chapitre 1','Transfer into your existing formatted book','Practical Atticus workflow','Practical Vellum workflow','Use the Final EPUB or rebuild?','Final checks before upload','Basic KDP upload workflow','Need help'])assert.ok(xml.includes(expected),expected)
  assert.match(xml,/automated validation does not replace your final publishing review/i)
})

test('every branded support document uses the shared centred 55–65 mm aspect-safe logo header',async()=>{
  const launchSource=Buffer.from(JSON.stringify({schemaVersion:'3.0',locale:'fr',language:'French',market:'France',amazonDomain:'amazon.fr',currency:'EUR',backendKeywords:Array.from({length:7},(_,i)=>`mot-clé ${i}`),adKeywords:Array.from({length:20},(_,i)=>`recherche ${i}`),categories:['Romantasy','Fantasy sombre','Romance fantastique'],pricingRecommendation:{ebook:'4,99 €',paperback:'14,99 €',reasoning:'Grounded.'},bookDescription:'Description française.',reviewStrategy:['Review'],kdpUploadChecklist:['Upload'],...researchFields}))
  const documents=[
    await renderCustomerLaunchPackDocx(launchSource,'Bride of the Hollow King',"L'Épouse du Roi Vide"),
    await renderCustomerTranslationNotesDocx(Buffer.from("Translation Notes — fr\nGrounded decisions.\n\nRepresentative decisions\nBride of the Hollow King → L'Épouse du Roi Vide\nReason: Authoritative translated title.\nCaelan → Caelan\nReason: Proper name retained."),'Bride of the Hollow King','French'),
    await renderCustomerUploadGuideDocx(),
    await renderChapterMapDocx([{chapterId:'chapter-001',sourceChapterNumber:'1',sourceTitle:'Chapter 1',translatedChapterNumber:'1',translatedTitle:'Chapitre 1',status:'mapped'}],{bookTitle:'Bride of the Hollow King',language:'French'}),
  ]
  assert.equal(BRANDED_DOCUMENT_LOGO_ASSET,'public/logo-doc-safe.png')
  assert.ok(BRANDED_DOCUMENT_LOGO_WIDTH_MM>=55&&BRANDED_DOCUMENT_LOGO_WIDTH_MM<=65)
  assert.equal(BRANDED_DOCUMENT_LOGO_WIDTH_PX/BRANDED_DOCUMENT_LOGO_HEIGHT_PX,BRANDED_DOCUMENT_LOGO_INTRINSIC.width/BRANDED_DOCUMENT_LOGO_INTRINSIC.height)
  for(const bytes of documents){
    const zip:any=new AdmZip(bytes),xml=zip.readAsText('word/document.xml')
    const logoParagraph=xml.match(/<w:p[\s\S]*?<w:drawing>[\s\S]*?<\/w:drawing>[\s\S]*?<\/w:p>/)?.[0]||''
    assert.match(logoParagraph,/<w:jc w:val="center"\/>/)
    const extent=logoParagraph.match(/<wp:extent cx="(\d+)" cy="(\d+)"\/>/)
    assert.ok(extent)
    assert.ok(Math.abs(Number(extent[1])/Number(extent[2])-BRANDED_DOCUMENT_LOGO_INTRINSIC.width/BRANDED_DOCUMENT_LOGO_INTRINSIC.height)<0.00001)
    const media=zip.getEntries().find((entry:{entryName:string})=>entry.entryName.startsWith('word/media/image-'))?.getData()
    assert.ok(media)
    assert.equal(media.readUInt32BE(16),BRANDED_DOCUMENT_LOGO_INTRINSIC.width)
    assert.equal(media.readUInt32BE(20),BRANDED_DOCUMENT_LOGO_INTRINSIC.height)
  }
})
