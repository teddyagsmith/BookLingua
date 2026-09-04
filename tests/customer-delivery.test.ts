import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import { PackageArtifact,PackageManifestV1 } from '../lib/package-manifest'
import { CUSTOMER_ARTIFACT_TYPES,customerArtifactFilename,customerContentDisposition,customerDeliveryAllowed,customerVisibleArtifacts,resolveCustomerDeliveryOrigin,sanitizeCustomerFilenamePart } from '../lib/customer-delivery'
import { buildCustomerArtifactDownloadUrl,buildCustomerPortalUrl,buildReviewArtifactDownloadUrl,buildReviewPortalUrl,verifyCustomerArtifactToken,verifyCustomerPortalToken,verifyReviewArtifactToken,verifyReviewPortalToken } from '../lib/download-token'
import { renderCustomerPackageEmail } from '../lib/email-templates'

function artifact(type:PackageArtifact['type'],filename=`${type}.docx`):PackageArtifact{return{id:`id-${type}`,buildId:'build',type,required:true,filename,storageBucket:'private',storagePath:`secret/${type}`,sha256:'a'.repeat(64),sizeBytes:10,validationStatus:'pass'}}
function manifest():PackageManifestV1{const artifacts=[artifact('translation_brief','brief.json'),artifact('pass1_docx'),artifact('review_docx'),artifact('final_docx'),artifact('final_epub','final.epub'),artifact('translation_notes','notes.txt'),artifact('chapter_map_docx'),artifact('chapter_map_csv','map.csv'),artifact('upload_guide'),artifact('launch_pack','pack.json')];return{schemaVersion:'1.0',orderId:'order',language:'fr',buildId:'build',status:'pass',entitlements:{sourceFormat:'epub',launchPack:true,dualFormat:true},artifacts,errors:[],generatedAt:'2026-08-14T00:00:00Z'}}

test('customer artifact selection exposes only the intended author package',()=>{
  const items=customerVisibleArtifacts('Bride of the Hollow King',manifest())
  assert.deepEqual(items.map(item=>item.type),CUSTOMER_ARTIFACT_TYPES)
  for(const hidden of ['translation_brief','pass1_docx','chapter_map_csv','upload_guide'])assert.equal(items.some(item=>item.type===hidden),false)
  assert.deepEqual(items.map(item=>item.filename),[
    'Bride of the Hollow King - Final - FR.docx','Bride of the Hollow King - Final - FR.epub',
    'Bride of the Hollow King - Review - FR.docx','Bride of the Hollow King - Chapters - FR.docx',
    'Bride of the Hollow King - Notes - FR.docx','Bride of the Hollow King - Launch Pack - FR.docx',
  ])
})

test('customer filenames use exact labels/codes, actual extensions, and safe readable titles',()=>{
  assert.equal(customerArtifactFilename('Bride: Hollow/King','de',artifact('final_docx')),'Bride Hollow King - Final - DE.docx')
  assert.equal(customerArtifactFilename('Bride','de',artifact('translation_notes','notes.txt')),'Bride - Notes - DE.docx')
  assert.equal(customerArtifactFilename('Bride','de',artifact('launch_pack','pack.json')),'Bride - Launch Pack - DE.docx')
  assert.equal(sanitizeCustomerFilenamePart('../ Unsafe: Book?. '),'Unsafe Book')
  assert.throws(()=>customerArtifactFilename('Bride','fr',artifact('pass1_docx')),/Internal artifact/)
  assert.match(customerContentDisposition('Épouse - Final - FR.docx'),/filename\*=UTF-8''/)
})

test('customer tokens are scoped to the portal or one visible artifact',()=>{
  const old=process.env.STRIPE_WEBHOOK_SECRET;process.env.STRIPE_WEBHOOK_SECRET='test-secret'
  try{
    const portal=buildCustomerPortalUrl('order','https://booklingua.test'),portalToken=new URL(portal).searchParams.get('token')!
    assert.equal(verifyCustomerPortalToken('order',portalToken),true);assert.equal(verifyCustomerPortalToken('other',portalToken),false)
    const url=buildCustomerArtifactDownloadUrl('order','fr','final_docx','https://booklingua.test'),token=new URL(url).searchParams.get('token')!
    assert.equal(verifyCustomerArtifactToken('order','fr','final_docx',token),true)
    assert.equal(verifyCustomerArtifactToken('order','fr','pass1_docx',token),false)
    const reviewPortal=buildReviewPortalUrl('order','https://booklingua.test'),reviewPortalToken=new URL(reviewPortal).searchParams.get('token')!
    assert.equal(verifyReviewPortalToken('order',reviewPortalToken),true);assert.equal(verifyCustomerPortalToken('order',reviewPortalToken),false)
    const reviewUrl=buildReviewArtifactDownloadUrl('order','fr','launch_pack','https://booklingua.test'),reviewToken=new URL(reviewUrl).searchParams.get('token')!
    assert.equal(verifyReviewArtifactToken('order','fr','launch_pack',reviewToken),true)
    assert.equal(verifyCustomerArtifactToken('order','fr','launch_pack',reviewToken),false)
  }finally{if(old===undefined)delete process.env.STRIPE_WEBHOOK_SECRET;else process.env.STRIPE_WEBHOOK_SECRET=old}
})

test('delivery origin rejects missing, credentialed, and production-local origins',()=>{
  assert.throws(()=>resolveCustomerDeliveryOrigin(undefined,'production'),/not configured/)
  assert.throws(()=>resolveCustomerDeliveryOrigin('https://user:pass@example.test','production'),/bare/)
  assert.throws(()=>resolveCustomerDeliveryOrigin('http://127.0.0.1:3000','production'),/public HTTPS/)
  assert.equal(resolveCustomerDeliveryOrigin('https://booklingua.io','production'),'https://booklingua.io')
  assert.throws(()=>resolveCustomerDeliveryOrigin('http://127.0.0.1:3000','staging'),/public HTTPS/)
  assert.throws(()=>resolveCustomerDeliveryOrigin('https://192.168.1.5','staging'),/public HTTPS/)
  assert.equal(resolveCustomerDeliveryOrigin('https://preview.example.test','staging'),'https://preview.example.test')
  assert.equal(resolveCustomerDeliveryOrigin('http://127.0.0.1:3000','test'),'http://127.0.0.1:3000')
})

test('external-off staging delivery is restricted to the exact configured test recipient',()=>{
  const saved={external:process.env.HARDENED_EXTERNAL_DELIVERY,env:process.env.BOOKLINGUA_DELIVERY_ENV,to:process.env.BOOKLINGUA_STAGING_DELIVERY_RECIPIENT}
  process.env.HARDENED_EXTERNAL_DELIVERY='off';process.env.BOOKLINGUA_DELIVERY_ENV='staging';process.env.BOOKLINGUA_STAGING_DELIVERY_RECIPIENT='gilly@myromancereads.com'
  try{assert.deepEqual(customerDeliveryAllowed('gilly@myromancereads.com'),{allowed:true,mode:'staging'});assert.deepEqual(customerDeliveryAllowed('customer@example.com'),{allowed:false,mode:'disabled'})}
  finally{for(const [key,value] of Object.entries(saved)){const envKey=key==='external'?'HARDENED_EXTERNAL_DELIVERY':key==='env'?'BOOKLINGUA_DELIVERY_ENV':'BOOKLINGUA_STAGING_DELIVERY_RECIPIENT';if(value===undefined)delete process.env[envKey];else process.env[envKey]=value}}
})

test('global external delivery always enforces production origin rules',()=>{
  const saved={external:process.env.HARDENED_EXTERNAL_DELIVERY,env:process.env.BOOKLINGUA_DELIVERY_ENV}
  process.env.HARDENED_EXTERNAL_DELIVERY='enabled';process.env.BOOKLINGUA_DELIVERY_ENV='staging'
  try{assert.throws(()=>resolveCustomerDeliveryOrigin('http://127.0.0.1:3000'),/public HTTPS/)}
  finally{if(saved.external===undefined)delete process.env.HARDENED_EXTERNAL_DELIVERY;else process.env.HARDENED_EXTERNAL_DELIVERY=saved.external;if(saved.env===undefined)delete process.env.BOOKLINGUA_DELIVERY_ENV;else process.env.BOOKLINGUA_DELIVERY_ENV=saved.env}
})

test('customer email is friendly and contains no internal QA vocabulary',()=>{
  const email=renderCustomerPackageEmail({authorName:'Teddy',bookTitle:'Bride of the Hollow King',languages:['French','German'],downloadPageUrl:'https://booklingua.test/download/order?token=safe'})
  assert.match(email.html,/View &amp; download your files/);assert.match(email.html,/Your <strong>French and German<\/strong> translations of/);assert.match(email.html,/Chapters/);assert.match(email.html,/How to Use Your Translations \+ Upload Guide/);assert.equal(email.templateVersion,'customer-delivery-v4')
  for(const forbidden of ['sha256','build ID','semantic node','final_docx','PASS','package manifest'])assert.doesNotMatch(email.html,new RegExp(forbidden,'i'))
  assert.match(renderCustomerPackageEmail({authorName:'Teddy',bookTitle:'Bride',languages:['French','German','Italian'],downloadPageUrl:'https://preview.example.test'}).text,/French, German, and Italian translations of Bride/)
})

test('preview resend is staging-only, exact-recipient, provider-idempotent and ledger-free',()=>{
  const source=readFileSync('app/api/admin/orders/[orderId]/preview-delivery/route.ts','utf8')
  assert.match(source,/BOOKLINGUA_DELIVERY_ENV!=='staging'/);assert.match(source,/BOOKLINGUA_ALLOW_PREVIEW_DELIVERY!=='enabled'/)
  assert.match(source,/BOOKLINGUA_STAGING_DELIVERY_RECIPIENT/);assert.match(source,/delivery-preview-v3/)
  assert.match(source,/internal-customer-preview-v1/);assert.match(source,/gilly@myromancereads\.com/);assert.match(source,/buildReviewPortalUrl/)
  assert.match(source,/bookTitle:cleanBookTitle\(order\.book_title\)/)
  assert.doesNotMatch(source,/from\('delivery_events'\)|begin_hardened_delivery/)
})
