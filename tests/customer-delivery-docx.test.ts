import test from 'node:test'
import assert from 'node:assert/strict'
import AdmZip from 'adm-zip'
import { renderCustomerLaunchPackDocx,renderCustomerTranslationNotesDocx,renderCustomerUploadGuideDocx } from '../lib/customer-delivery-docx'

function documentXml(bytes:Buffer):string{const zip:any=new AdmZip(bytes);return zip.readAsText('word/document.xml')}
function allWordXml(bytes:Buffer):string{const zip:any=new AdmZip(bytes);return zip.getEntries().filter((entry:any)=>/^word\/.*\.xml$/.test(entry.entryName)).map((entry:any)=>zip.readAsText(entry.entryName)).join('\n')}

test('Launch Pack JSON deterministically renders as a human-readable DOCX',async()=>{
  const source=Buffer.from(JSON.stringify({schemaVersion:'2.0',locale:'fr',language:'French',market:'France',amazonDomain:'amazon.fr',currency:'EUR',backendKeywords:Array.from({length:7},(_,i)=>`keyword ${i}`),adKeywords:Array.from({length:20},(_,i)=>`advertising ${i}`),categories:['Romantasy','Fantasy Romance','Dark Fantasy'],pricingRecommendation:{ebook:'4,99 €',paperback:'14,99 €',reasoning:'Market-aligned launch pricing.'},bookDescription:'A gothic romantasy description.',reviewStrategy:['Invite advance readers.'],kdpUploadChecklist:['Upload the final EPUB.']}))
  const first=await renderCustomerLaunchPackDocx(source,'Bride of the Hollow King',"L'Épouse du Roi Vide"),second=await renderCustomerLaunchPackDocx(source,'Bride of the Hollow King',"L'Épouse du Roi Vide")
  assert.deepEqual(first,second)
  const xml=allWordXml(first)
  for(const expected of ['L&apos;Épouse du Roi Vide','READY TO COPY INTO YOUR AMAZON LISTING','Book Description','Amazon Keywords','Suggested Categories','Pricing','KDP Upload Checklist','Translate your book in hours, not months'])assert.ok(xml.includes(expected),expected)
  for(const forbidden of ['schemaVersion','backendKeywords','request_identity'])assert.doesNotMatch(xml,new RegExp(forbidden,'i'))
  assert.doesNotMatch(xml,/<w:t[^>]*>[^<]*model/i)
})

test('structured notes text deterministically renders as a customer DOCX',async()=>{
  const source=Buffer.from("Translation Notes — fr\nCareful decisions grounded in the completed translation.\n\nRepresentative decisions\nBride of the Hollow King → L'Épouse du Roi Vide\nReason: Used consistently as the authoritative translated book title in the manuscript and customer files.\nCaelan → Caelan\nReason: Proper name retained consistently.\n")
  const first=await renderCustomerTranslationNotesDocx(source,'Bride of the Hollow King','French'),second=await renderCustomerTranslationNotesDocx(source,'Bride of the Hollow King','French')
  assert.deepEqual(first,second)
  const xml=documentXml(first)
  assert.match(xml,/Translation Notes/);assert.match(xml,/L&apos;Épouse du Roi Vide/);assert.match(xml,/French Translation/);assert.match(xml,/WHY WE CHOSE IT/);assert.match(xml,/Caelan/)
  for(const forbidden of ['schemaVersion','semantic node','build ID'])assert.doesNotMatch(xml,new RegExp(forbidden,'i'))
  await assert.rejects(()=>renderCustomerTranslationNotesDocx(Buffer.from('Translation Notes — fr\nNothing recorded.'),'Bride','French'),/no customer-facing decisions/)
})

test('customer guide is deterministic, renamed and structured as Start Here',async()=>{
  const first=await renderCustomerUploadGuideDocx(),second=await renderCustomerUploadGuideDocx()
  assert.deepEqual(first,second)
  const xml=documentXml(first)
  for(const expected of ['START HERE','How to Use Your Translations + Upload Guide','Your Final files','Your Review file','Your Chapters file','Your Translation Notes','Your Launch Pack','Before you publish','Uploading your translated book','Need help'])assert.ok(xml.includes(expected),expected)
  assert.match(xml,/automated validation does not replace your final publishing review/i)
})
