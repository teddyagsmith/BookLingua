import crypto from 'node:crypto'
import Anthropic from '@anthropic-ai/sdk'
import {createClient} from '@supabase/supabase-js'
import {downloadOriginalBinary} from '../lib/source-binary'
import {deterministicSemanticBuildId,runSemanticPipeline} from '../lib/semantic-pipeline'
import {translationSystemPrompt,editorialSystemPrompt} from '../lib/editorial-prompt'
import {BOOKLINGUA_MODEL_CONFIG} from '../lib/model-config'
import {renderTranslationBriefPrompt,translationBriefFingerprint,TranslationBriefV1} from '../lib/translation-brief'
import {translateWithDeterministicJsonRecovery} from '../lib/semantic-model-recovery'
import {recordModelTelemetry} from '../lib/model-telemetry'
import {generateLaunchStrategy,toCanonicalLaunchPack} from '../lib/launch-strategy'
import {launchMarket} from '../lib/launch-pack-schema'

const ORDER='a3341608-0fd7-4341-b74f-3f2905d1ce72'
const LANGUAGE='es-es'
const EXPECTED_SOURCE_HASH='9a95959d06328d036db6e4aad0e86c21e4dea9ba3ceb1e79e9184efbe3d231c8'
const BUILD_ID=deterministicSemanticBuildId(ORDER,LANGUAGE,EXPECTED_SOURCE_HASH,2,'artifact-nav-subtitle-v3')
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}})
const anthropic=new Anthropic({apiKey:process.env.ANTHROPIC_API_KEY!})

async function main(){
  const {data:order,error:orderError}=await db.from('orders').select('*').eq('id',ORDER).single()
  if(orderError||!order)throw new Error(orderError?.message||'Order unavailable')
  if(JSON.stringify(order.languages)!==JSON.stringify([LANGUAGE]))throw new Error(`Unexpected ordered languages: ${JSON.stringify(order.languages)}`)
  const {data:file,error:fileError}=await db.from('files').select('file_url,original_content,content').eq('order_id',ORDER).eq('type','original').single()
  if(fileError||!file?.file_url)throw new Error(fileError?.message||'Original source unavailable')
  const metadata=typeof file.original_content==='string'?JSON.parse(file.original_content):file.original_content||{}
  const source=await downloadOriginalBinary(db,file.file_url,metadata.sha256||null,metadata.storageBucket)
  const sourceHash=crypto.createHash('sha256').update(source).digest('hex')
  if(sourceHash!==EXPECTED_SOURCE_HASH)throw new Error('Authoritative source hash changed')

  const {data:briefRow,error:briefError}=await db.from('translation_briefs').select('brief,revision').eq('order_id',ORDER).eq('language',LANGUAGE).order('revision',{ascending:false}).limit(1).single()
  if(briefError||!briefRow?.brief)throw new Error(briefError?.message||'Translation brief unavailable')
  const prior=briefRow.brief as TranslationBriefV1
  const registerItem={id:'reader-register',sourceTerm:'Reader address in the narrator’s own voice',issueType:'reader_register',authorDecision:'informal_address',targetInstruction:'Address the reader as tú throughout the narrator’s own voice. Dialogue follows the source.'}
  const hasRegister=prior.items.some(item=>item.issueType==='reader_register'&&item.authorDecision==='informal_address'&&item.targetInstruction===registerItem.targetInstruction)
  const brief:TranslationBriefV1=hasRegister?prior:{...prior,revision:Number(briefRow.revision)+1,approvedAt:new Date().toISOString(),approvalSource:'admin',items:[...prior.items.filter(item=>item.issueType!=='reader_register'),registerItem]}
  if(!hasRegister){
    const {error:insertError}=await db.from('translation_briefs').insert({order_id:ORDER,language:LANGUAGE,schema_version:brief.schemaVersion,revision:brief.revision,source_manifest_fingerprint:brief.sourceManifestFingerprint,content_fingerprint:translationBriefFingerprint(brief),approved_at:brief.approvedAt,approval_source:brief.approvalSource,brief})
    if(insertError)throw new Error(`Brief revision insert failed: ${insertError.message}`)
  }

  const market=launchMarket(LANGUAGE)
  const launchRequestId=`${ORDER}:${LANGUAGE}:${BUILD_ID}:launch-pack-current-schema`
  const strategy=await generateLaunchStrategy({bookTitle:order.book_title,authorName:order.author_name,genre:order.genre,bookDescription:String(file.content||'').slice(0,2500),manuscriptFacts:String(file.content||'').slice(0,12000),targetLanguage:market.language,targetMarket:market.market},{requestId:launchRequestId,onMetadata:metadata=>recordModelTelemetry(db,{orderId:ORDER,language:LANGUAGE,buildId:BUILD_ID,stage:'launch-pack',attempt:metadata.attempt,requestIdentity:metadata.requestId,provider:metadata.provider,modelId:metadata.modelId,providerRequestId:metadata.providerRequestId,success:metadata.success,inputTokens:metadata.inputTokens,outputTokens:metadata.outputTokens,cacheStatus:metadata.success?'write':'miss',errorCode:metadata.errorCode})})
  const launchPack=Buffer.from(JSON.stringify(toCanonicalLaunchPack(strategy,LANGUAGE,true)))

  const notes={schemaVersion:'1.0' as const,language:LANGUAGE,approach:'Preserve the candid first-person memoir voice and dry humour in natural European Spanish.',sections:[{id:'author-decisions',title:'Author-approved decisions',entries:brief.items.map(item=>({source:item.sourceTerm,target:item.targetInstruction,reason:item.authorDecision}))}]}
  const attempts=new Map<string,number>()
  const result=await runSemanticPipeline({
    supabase:db,orderId:ORDER,language:LANGUAGE,sourceFormat:'epub',source,title:order.book_title,authorName:order.author_name,genre:order.genre,
    brief,notes,buildId:BUILD_ID,allowReviewedStructure:order.semantic_structure_approved===true,launchPack,dualFormat:true,maxBatchConcurrency:3,
    translate:async(batch,context)=>{
      const stage=context.pass===1?'translation':'editorial',requestIdentity=`${ORDER}:${LANGUAGE}:${stage}:${context.batchId}`
      return translateWithDeterministicJsonRecovery(batch,requestIdentity,async(requestBatch,recovery)=>{
        const attempt=(attempts.get(recovery.requestId)||0)+1;attempts.set(recovery.requestId,attempt)
        let response:any
        try{
          response=await anthropic.messages.create({model:context.pass===1?BOOKLINGUA_MODEL_CONFIG.translation:BOOKLINGUA_MODEL_CONFIG.editorial,max_tokens:20000,system:context.pass===1?translationSystemPrompt(context.readerRegisterPrompt):editorialSystemPrompt('Spanish (Spain)',context.genre,context.readerRegisterPrompt),messages:[{role:'user',content:`${renderTranslationBriefPrompt(context.brief)}\n${context.pass===1?'Translation':'Editorial'} pass; target language ${LANGUAGE}.\n${JSON.stringify(requestBatch)}`}]})
          const text=response.content.find((block:any)=>block.type==='text');if(!text||text.type!=='text')throw new Error('Model returned no JSON text')
          const parsed=JSON.parse(text.text.replace(/^```json\s*|\s*```$/g,''))
          await recordModelTelemetry(db,{orderId:ORDER,language:LANGUAGE,buildId:BUILD_ID,stage,batchId:context.batchId,attempt,requestIdentity:recovery.requestId,provider:'anthropic',modelId:response.model,providerRequestId:response.id,success:true,inputTokens:response.usage.input_tokens,outputTokens:response.usage.output_tokens,cacheStatus:'write'})
          return parsed
        }catch(error){await recordModelTelemetry(db,{orderId:ORDER,language:LANGUAGE,buildId:BUILD_ID,stage,batchId:context.batchId,attempt,requestIdentity:recovery.requestId,provider:'anthropic',modelId:response?.model||(context.pass===1?BOOKLINGUA_MODEL_CONFIG.translation:BOOKLINGUA_MODEL_CONFIG.editorial),providerRequestId:response?.id,success:false,inputTokens:response?.usage.input_tokens,outputTokens:response?.usage.output_tokens,cacheStatus:'miss',errorCode:error instanceof SyntaxError?'MODEL_JSON_INVALID':error instanceof Error?error.name:'MODEL_FAILURE'});throw error}
      })
    },
  })
  console.log(JSON.stringify({orderId:ORDER,language:LANGUAGE,briefRevision:brief.revision,buildId:result.buildId,status:result.manifest.status,sourceNodes:result.pass1.nodes.length,customerEmailSent:false}))
}

main().catch(error=>{console.error(error);process.exit(1)})
