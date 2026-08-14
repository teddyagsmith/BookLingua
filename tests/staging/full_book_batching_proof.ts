import fs from 'fs'
import { createHash } from 'crypto'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { deterministicSemanticBuildId, runSemanticPipeline, SemanticTranslator } from '../../lib/semantic-pipeline'
import { parseSemanticEpub } from '../../lib/semantic-parser'
import { buildTranslationBrief, renderTranslationBriefPrompt, translationBriefFingerprint } from '../../lib/translation-brief'
import { BOOKLINGUA_MODEL_CONFIG } from '../../lib/model-config'
import { cachedLaunchPack, launchPackRequestIdentity } from '../../lib/launch-pack-cache'
import { generateLaunchStrategy, toCanonicalLaunchPack } from '../../lib/launch-strategy'
import { launchMarket } from '../../lib/launch-pack-schema'
import { recordModelTelemetry } from '../../lib/model-telemetry'
import { recordTerminalFailure } from '../../lib/pipeline-events'
import { finalizeSemanticOrder } from '../../lib/semantic-finalization'

const url=process.env.NEXT_PUBLIC_SUPABASE_URL!,key=process.env.SUPABASE_SERVICE_ROLE_KEY!,apiKey=process.env.ANTHROPIC_API_KEY!
if(!url.startsWith('http://127.0.0.1:'))throw new Error('Full-book proof refuses non-loopback Supabase')
if(!apiKey)throw new Error('Anthropic key missing')
process.env.PIPELINE_HARDENING_V1='enabled'
const db=createClient(url,key),anthropic=new Anthropic({apiKey})
const orderId=process.env.FULL_BOOK_PROOF_ORDER_ID||'95000000-0000-0000-0000-000000000003'
const source=fs.readFileSync('/Users/gilbert/Desktop/Bride of the Hollow King-Kindle.docx (6) (1).epub')
const sourceHash=createHash('sha256').update(source).digest('hex')
const semantic=parseSemanticEpub(source,sourceHash)
if(semantic.nodes.length!==1760)throw new Error(`Expected 1760 nodes, got ${semantic.nodes.length}`)
const sourceText=semantic.nodes.map(n=>n.sourceText).join('\n\n')
const usage:any={sonnet:{calls:0,inputTokens:0,outputTokens:0,failedCalls:0},opus:{calls:0,inputTokens:0,outputTokens:0},cacheHits:0,deliberateFailures:0}
let injectFailure=process.env.FULL_BOOK_PROOF_RESUME!=='1'

async function nextAttempt(requestIdentity:string):Promise<number>{
  const {data,error}=await db.from('model_call_events').select('attempt').eq('request_identity',requestIdentity).order('attempt',{ascending:false}).limit(1)
  if(error)throw error
  return Number(data?.[0]?.attempt||0)+1
}

const translator:SemanticTranslator=async(batch,context)=>{
  if(injectFailure&&context.language==='fr'&&context.pass===1&&context.batchIndex===2){injectFailure=false;usage.deliberateFailures++;throw new Error('STAGING_DELIBERATE_MIDDLE_BATCH_FAILURE')}
  const requestIdentity=`${orderId}:${context.language}:${context.pass}:${context.batchId}`
  const modelAttempt=await nextAttempt(requestIdentity)
  let response:any
  try{
    response=await anthropic.messages.create({model:BOOKLINGUA_MODEL_CONFIG.translation,max_tokens:4096,system:'Return only valid JSON. Preserve every supplied node ID and order exactly. Translate every text value; never omit or add nodes.',messages:[{role:'user',content:`${renderTranslationBriefPrompt(context.brief)}\nPass ${context.pass}; target ${context.language}.\n${JSON.stringify(batch)}`}]})
    usage.sonnet.calls++;usage.sonnet.inputTokens+=response.usage.input_tokens;usage.sonnet.outputTokens+=response.usage.output_tokens
    const block=response.content.find((item:any)=>item.type==='text');if(!block||block.type!=='text')throw new Error('Sonnet returned no text')
    const output=JSON.parse(block.text.replace(/^```json\s*|\s*```$/g,''))
    await recordModelTelemetry(db,{orderId,language:context.language,stage:context.pass===1?'translation':'editorial',batchId:context.batchId,attempt:modelAttempt,requestIdentity,provider:'anthropic',modelId:response.model,providerRequestId:response.id,success:true,inputTokens:response.usage.input_tokens,outputTokens:response.usage.output_tokens,cacheStatus:'write'})
    return output
  }catch(error){
    if(response){usage.sonnet.failedCalls++;await recordModelTelemetry(db,{orderId,language:context.language,stage:context.pass===1?'translation':'editorial',batchId:context.batchId,attempt:modelAttempt,requestIdentity,provider:'anthropic',modelId:response.model,providerRequestId:response.id,success:false,inputTokens:response.usage.input_tokens,outputTokens:response.usage.output_tokens,cacheStatus:'miss',errorCode:error instanceof SyntaxError?'MODEL_JSON_INVALID':'MODEL_FAILURE'})}
    throw error
  }
}

async function launch(language:string,brief:any){
  const market=launchMarket(language),description=sourceText.slice(0,2500)
  return cachedLaunchPack({supabase:db,identity:{orderId,language,targetLanguage:market.language,targetMarket:market.market,
    sourceFingerprint:sourceHash,buildId:deterministicSemanticBuildId(orderId,language,sourceHash,brief.revision),
    briefRevision:brief.revision,briefSchemaVersion:brief.schemaVersion,briefFingerprint:translationBriefFingerprint(brief),
    bookTitle:'Bride of the Hollow King',authorName:'Synthetic staging proof',genre:'fantasy romance',description,
    modelId:BOOKLINGUA_MODEL_CONFIG.launchPack,schemaVersion:'3.0',entitled:true,researchFingerprint:'launch-pack-research-contract-v3'},generate:async identity=>{
    const strategy=await generateLaunchStrategy({bookTitle:'Bride of the Hollow King',authorName:'Synthetic staging proof',genre:'fantasy romance',bookDescription:description,targetLanguage:market.language,targetMarket:market.market},{requestId:launchPackRequestIdentity(identity),onMetadata:async metadata=>{await recordModelTelemetry(db,{orderId,language,stage:'launch-pack',attempt:await nextAttempt(metadata.requestId),requestIdentity:metadata.requestId,provider:metadata.provider,modelId:metadata.modelId,providerRequestId:metadata.providerRequestId,success:metadata.success,inputTokens:metadata.inputTokens,outputTokens:metadata.outputTokens,cacheStatus:metadata.success?'write':'miss',errorCode:metadata.errorCode})},createMessage:async params=>{const r=await anthropic.messages.create(params);usage.opus.calls++;usage.opus.inputTokens+=r.usage.input_tokens;usage.opus.outputTokens+=r.usage.output_tokens;return r}})
    return toCanonicalLaunchPack(strategy,language,true)
  }})
}

async function pipeline(language:string){
  const brief=(await db.from('translation_briefs').select('brief').eq('order_id',orderId).eq('language',language).single()).data!.brief
  const lp=await launch(language,brief)
  return runSemanticPipeline({supabase:db,orderId,language,sourceFormat:'epub',source,title:'Bride of the Hollow King',brief,buildId:deterministicSemanticBuildId(orderId,language,sourceHash,brief.revision),notes:{schemaVersion:'1.0',language,approach:'Full-book synthetic staging proof.',sections:[]},allowReviewedStructure:true,launchPack:Buffer.from(JSON.stringify(lp.pack)),dualFormat:true,maxBatchOutputWords:700,maxBatchConcurrency:4,translate:translator})
}

async function main(){
  const startedAt=new Date().toISOString()
  let failedBuild:any={state:'failed'},duplicateFailureEvents=1
  if(process.env.FULL_BOOK_PROOF_RESUME!=='1'){
    await db.from('orders').delete().eq('id',orderId)
    let r=await db.from('orders').insert({id:orderId,email:'full-book-proof@example.invalid',author_name:'Synthetic staging proof',book_title:'Bride of the Hollow King',word_count:38119,tier:'small',file_format:'.epub',languages:['fr','de'],upsells:['launch-pack','dual-format'],amount_paid:0,status:'processing',pipeline_version:'semantic-v2',semantic_structure_approved:true});if(r.error)throw r.error
    for(const language of ['fr','de']){const brief=buildTranslationBrief({language,sourceManifestFingerprint:sourceHash,approvedAt:'2026-08-13T00:00:00.000Z',approvalSource:'admin',decisions:[]});r=await db.from('translation_briefs').insert({order_id:orderId,language,source_manifest_fingerprint:sourceHash,schema_version:'1.0',revision:1,brief,content_fingerprint:translationBriefFingerprint(brief),approved_at:brief.approvedAt,approval_source:'admin'});if(r.error)throw r.error}
    try{await pipeline('fr');throw new Error('Deliberate staging interruption did not occur')}catch(error){if(!String(error).includes('STAGING_DELIBERATE'))throw error;await recordTerminalFailure({supabase:db,orderId,language:'fr',stage:'semantic-pass1',error})}
    failedBuild=(await db.from('order_language_builds').select('state').eq('order_id',orderId).eq('language','fr').single()).data
    const failureEvents=(await db.from('pipeline_events').select('id',{count:'exact',head:true}).eq('order_id',orderId).eq('stage','semantic-pass1')).count
    await recordTerminalFailure({supabase:db,orderId,language:'fr',stage:'semantic-pass1',error:new Error('STAGING_DELIBERATE_MIDDLE_BATCH_FAILURE')})
    duplicateFailureEvents=(await db.from('pipeline_events').select('id',{count:'exact',head:true}).eq('order_id',orderId).eq('stage','semantic-pass1')).count ?? 0
    if(failedBuild?.state!=='failed'||failureEvents!==1||duplicateFailureEvents!==1)throw new Error('Terminal cleanup/audit idempotency proof failed')
    await db.from('orders').update({status:'processing',failed_stage:null,failure_message:null,failed_at:null}).eq('id',orderId)
  }
  const sends:any[]=[];const finalize=()=>finalizeSemanticOrder({supabase:db,orderId,bookTitle:'Bride of the Hollow King',languages:['fr','de'],internalReviewAddress:'intercepted@example.invalid',appUrl:'https://example.invalid',sendInternalReview:async(message,options)=>{sends.push({subject:message.subject,idempotencyKey:options.idempotencyKey});return{id:'intercepted'}}})
  const fr=await pipeline('fr');const partial=await finalize();const de=await pipeline('de');const complete=await finalize()
  const beforeRetry={sonnet:usage.sonnet.calls,opus:usage.opus.calls};const beforeHashes=(await db.from('artifacts').select('language,artifact_type,sha256').eq('order_id',orderId).order('language').order('artifact_type')).data
  await pipeline('fr');await pipeline('de');const retryFinal=await finalize();const afterHashes=(await db.from('artifacts').select('language,artifact_type,sha256').eq('order_id',orderId).order('language').order('artifact_type')).data
  if(partial.status!=='gate_failed'||complete.status!=='ready_for_review'||sends.length!==1||JSON.stringify(beforeRetry)!==JSON.stringify({sonnet:usage.sonnet.calls,opus:usage.opus.calls})||JSON.stringify(beforeHashes)!==JSON.stringify(afterHashes))throw new Error('Full-book retry/gate proof failed')
  const chunks=(await db.from('translation_chunks').select('lang_code,pass,chunk_index,structure_fingerprint').eq('order_id',orderId).order('lang_code').order('pass').order('chunk_index')).data||[]
  const docs=(await db.from('semantic_documents').select('language,pass,source_hash,document').eq('order_id',orderId)).data||[]
  const telemetry=(await db.from('model_call_events').select('*').eq('order_id',orderId)).data||[]
  const artifacts=afterHashes||[]
  const tokenTotals=telemetry.filter((row:any)=>row.cache_status!=='hit').reduce((total:any,row:any)=>{const key=row.stage==='launch-pack'?'opus':'sonnet';total[key].calls++;total[key].inputTokens+=Number(row.input_tokens||0);total[key].outputTokens+=Number(row.output_tokens||0);total[key].estimatedCostUsd+=Number(row.estimated_cost_usd||0);if(!row.success)total[key].failedCalls++;return total},{sonnet:{calls:0,inputTokens:0,outputTokens:0,failedCalls:0,estimatedCostUsd:0},opus:{calls:0,inputTokens:0,outputTokens:0,failedCalls:0,estimatedCostUsd:0}})
  const nonCacheTelemetry=telemetry.filter((row:any)=>row.cache_status!=='hit')
  const largestCall=nonCacheTelemetry.reduce((largest:any,row:any)=>Number(row.input_tokens||0)+Number(row.output_tokens||0)>Number(largest.input_tokens||0)+Number(largest.output_tokens||0)?{stage:row.stage,language:row.language,batchId:row.batch_id,inputTokens:Number(row.input_tokens||0),outputTokens:Number(row.output_tokens||0)}:largest,{})
  const report={orderId,startedAt,completedAt:new Date().toISOString(),sourceHash,nodeCount:semantic.nodes.length,processUsage:usage,tokenTotals,largestCall,batches:{frPass1:chunks.filter(x=>x.lang_code==='fr'&&x.pass==='semantic-pass1').length,frPass2:chunks.filter(x=>x.lang_code==='fr'&&x.pass==='semantic-pass2').length,dePass1:chunks.filter(x=>x.lang_code==='de'&&x.pass==='semantic-pass1').length,dePass2:chunks.filter(x=>x.lang_code==='de'&&x.pass==='semantic-pass2').length},documents:docs.map((d:any)=>({language:d.language,pass:d.pass,nodeCount:d.document.nodes.length,uniqueIds:new Set(d.document.nodes.map((n:any)=>n.id)).size,ordered:d.document.nodes.every((n:any,i:number)=>n.order===i),sourceHash:d.source_hash})),partial,complete,retryFinal,failedBuildCleanup:failedBuild?.state,failureEventCount:duplicateFailureEvents,logicalEmailSends:sends.length,modelTelemetryRows:telemetry.length,artifactCount:artifacts.length,artifacts,hashesStable:true,callsStableOnCompletedRetry:true}
  fs.writeFileSync('/Users/gilbert/BookLingua-Backups/20260813T184935Z/canary-remediation/full-book-staging-proof.json',JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify(report,null,2))
}
main().catch(error=>{console.error(error);process.exitCode=1})
