import test from 'node:test'
import assert from 'node:assert/strict'
import AdmZip from 'adm-zip'
import { renderCustomerLaunchPackDocx,renderCustomerTranslationNotesDocx } from '../lib/customer-delivery-docx'

function documentXml(bytes:Buffer):string{const zip:any=new AdmZip(bytes);return zip.readAsText('word/document.xml')}

test('Launch Pack JSON deterministically renders as a human-readable DOCX',async()=>{
  const source=Buffer.from(JSON.stringify({schemaVersion:'2.0',locale:'fr',language:'French',market:'France',amazonDomain:'amazon.fr',currency:'EUR',backendKeywords:Array.from({length:7},(_,i)=>`keyword ${i}`),adKeywords:Array.from({length:20},(_,i)=>`advertising ${i}`),categories:['Romantasy','Fantasy Romance','Dark Fantasy'],pricingRecommendation:{ebook:'4,99 €',paperback:'14,99 €',reasoning:'Market-aligned launch pricing.'},bookDescription:'A gothic romantasy description.',reviewStrategy:['Invite advance readers.'],kdpUploadChecklist:['Upload the final EPUB.']}))
  const first=await renderCustomerLaunchPackDocx(source,'Bride of the Hollow King'),second=await renderCustomerLaunchPackDocx(source,'Bride of the Hollow King')
  assert.deepEqual(first,second)
  const xml=documentXml(first)
  for(const expected of ['Bride of the Hollow King — Launch Pack','Book Description','Amazon Backend Keywords','Suggested Categories','KDP Upload Checklist'])assert.match(xml,new RegExp(expected))
  for(const forbidden of ['schemaVersion','backendKeywords','request_identity'])assert.doesNotMatch(xml,new RegExp(forbidden,'i'))
  assert.doesNotMatch(xml,/<w:t[^>]*>[^<]*model/i)
})

test('structured notes text deterministically renders as a customer DOCX',async()=>{
  const source=Buffer.from('Translation Notes — fr\nAuthor-approved terminology and localization decisions.\n\nAuthor-approved decisions\nCaelan → Keep exactly as written.\nReason: Proper name.\n')
  const first=await renderCustomerTranslationNotesDocx(source,'Bride of the Hollow King','French'),second=await renderCustomerTranslationNotesDocx(source,'Bride of the Hollow King','French')
  assert.deepEqual(first,second)
  const xml=documentXml(first)
  assert.match(xml,/Bride of the Hollow King — Translation Notes/);assert.match(xml,/Author-approved decisions/);assert.match(xml,/Caelan/)
  for(const forbidden of ['schemaVersion','semantic node','build ID'])assert.doesNotMatch(xml,new RegExp(forbidden,'i'))
  await assert.rejects(()=>renderCustomerTranslationNotesDocx(Buffer.from('Translation Notes — fr\nNothing recorded.'),'Bride','French'),/no customer-facing decisions/)
})
