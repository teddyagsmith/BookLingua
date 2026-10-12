import {createHash} from 'node:crypto'
import Anthropic from '@anthropic-ai/sdk'
import {createClient} from '@supabase/supabase-js'
import {downloadOriginalBinary} from '../lib/source-binary'
import {parseSemanticEpub} from '../lib/semantic-parser'
import {createDeterministicSemanticBatches,semanticBatchIdentity} from '../lib/semantic-batching'
import {createNodeTranslationInput} from '../lib/node-translation-contract'
import {translationBriefFingerprint,renderTranslationBriefPrompt,TranslationBriefV1} from '../lib/translation-brief'
import {BOOKLINGUA_MODEL_CONFIG} from '../lib/model-config'
import {TRANSLATION_PROMPT_VERSION,editorialSystemPrompt} from '../lib/editorial-prompt'
import {deterministicSemanticBuildId,runSemanticPipeline,SEMANTIC_PROMPT_SIGNATURE} from '../lib/semantic-pipeline'
import {translateWithDeterministicJsonRecovery} from '../lib/semantic-model-recovery'
import {recordModelTelemetry} from '../lib/model-telemetry'

const ORDER='a3341608-0fd7-4341-b74f-3f2905d1ce72',LANGUAGE='es-es'
const PRIOR_BUILD='c9b3e93e-8552-54d5-81c4-1652a8778130',TITLE='En sentido contrario'
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}})
const anthropic=new Anthropic({apiKey:process.env.ANTHROPIC_API_KEY!})

async function downloadArtifact(row:any){const blob=await db.storage.from(row.storage_bucket).download(row.storage_path);if(blob.error||!blob.data)throw blob.error;const data=Buffer.from(await blob.data.arrayBuffer());if(createHash('sha256').update(data).digest('hex')!==row.sha256)throw new Error(`Checksum mismatch: ${row.artifact_type}`);return data}

async function seedCurrentFinalAsPass1(brief:TranslationBriefV1,sourceNodes:any[],priorPass2:any){
  const briefFingerprint=translationBriefFingerprint(brief),batches=createDeterministicSemanticBatches(sourceNodes)
  const documentFingerprint=createNodeTranslationInput(sourceNodes).sourceFingerprint,byId=new Map(priorPass2.nodes.map((node:any)=>[node.id,node]))
  for(const batch of batches){
    const request=createNodeTranslationInput(batch.nodes,false)
    const nodes=batch.nodes.map(node=>{const prior:any=byId.get(node.id);if(!prior?.translatedText?.trim())throw new Error(`Missing prior translation ${node.id}`);return{id:node.id,text:prior.translatedText}})
    const structure=semanticBatchIdentity({orderId:ORDER,language:LANGUAGE,documentFingerprint,pass:1,orderedNodeIds:batch.orderedNodeIds,briefRevision:brief.revision,briefFingerprint,modelId:BOOKLINGUA_MODEL_CONFIG.translation,schemaVersion:request.schemaVersion,promptVersion:TRANSLATION_PROMPT_VERSION})
    const content=JSON.stringify({schemaVersion:request.schemaVersion,sourceFingerprint:request.sourceFingerprint,nodes})
    const saved=await db.from('translation_chunks').upsert({order_id:ORDER,lang_code:LANGUAGE,chunk_index:batch.index,pass:'semantic-pass1',content,pipeline_version:'semantic-v2',schema_version:request.schemaVersion,structure_fingerprint:structure,model_provider:BOOKLINGUA_MODEL_CONFIG.provider,model_id:BOOKLINGUA_MODEL_CONFIG.translation,model_stage:'translation'},{onConflict:'order_id,lang_code,chunk_index,pass,pipeline_version,schema_version,structure_fingerprint,model_id'})
    if(saved.error)throw saved.error
  }
  return batches.length
}

async function main(){
  const [{data:order,error:orderError},{data:sourceRow,error:sourceError},{data:briefRow,error:briefError},{data:docs,error:docsError},{data:launchRow,error:launchError}]=await Promise.all([
    db.from('orders').select('*').eq('id',ORDER).single(),
    db.from('files').select('file_url,original_content').eq('order_id',ORDER).eq('type','original').single(),
    db.from('translation_briefs').select('brief').eq('order_id',ORDER).eq('language',LANGUAGE).order('revision',{ascending:false}).limit(1).single(),
    db.from('semantic_documents').select('pass,document').eq('order_id',ORDER).eq('language',LANGUAGE).eq('build_id',PRIOR_BUILD).in('pass',['pass2']),
    db.from('artifacts').select('*').eq('order_id',ORDER).eq('language',LANGUAGE).eq('build_id',PRIOR_BUILD).eq('artifact_type','launch_pack').single(),
  ])
  if(orderError||!order||!['ready_for_review','reader_review_pending'].includes(order.status)||order.completed_at)throw orderError||new Error(`Unsafe order state: ${order?.status}`)
  if(sourceError||!sourceRow||briefError||!briefRow?.brief||docsError||!docs?.[0]?.document||launchError||!launchRow)throw sourceError||briefError||docsError||launchError||new Error('Required immutable inputs unavailable')
  const metadata=typeof sourceRow.original_content==='string'?JSON.parse(sourceRow.original_content):sourceRow.original_content||{}
  const source=await downloadOriginalBinary(db,sourceRow.file_url,metadata.sha256||null,metadata.storageBucket),sourceHash=createHash('sha256').update(source).digest('hex')
  const sourceDocument=parseSemanticEpub(source,sourceHash),priorPass2=docs[0].document,brief=briefRow.brief as TranslationBriefV1
  if(sourceDocument.nodes.length!==priorPass2.nodes.length)throw new Error('Semantic node count changed')
  const seededPass1Batches=await seedCurrentFinalAsPass1(brief,sourceDocument.nodes,priorPass2)
  const verifiedEditorialOverrides=[
    {nodeId:'node-000019',before:'Capítulo 1\tCreciendo en el Belfast de la guerra',after:'Capítulo 1\tCrecer en un Belfast desgarrado por la guerra'},
    {nodeId:'node-000032',before:'Capítulo 14\tMiedo y asco, Norteamérica',after:'Capítulo 14\tMiedo y amor, Norteamérica'},
    {nodeId:'node-000098',before:'No recuerdo haber sentido nunca miedo al oír las sirenas de la policía, al ver edificios en llamas, ni tampoco recuerdo la emoción de tener la oportunidad de rebuscar entre los restos de una tienda destrozada de camino a casa desde el colegio.',after:'No recuerdo haber sentido nunca miedo ante el peligro al oír las sirenas de la policía, al ver edificios en llamas, ni la emoción de tener la oportunidad de rebuscar entre los restos de una tienda destrozada de camino a casa desde el colegio.'},
    {nodeId:'node-001931',before:'A ambos lados del patio, la selva humeaba.',after:'Alrededor del patio, la selva humeaba.'},
    {nodeId:'node-001935',before:'a treinta kilómetros de cualquier sitio',after:'a veinte millas de cualquier sitio'},
    {nodeId:'node-001939',before:'quizá pudieran darme un poco más',after:'quizá pudieran darme una pinta'},
    {nodeId:'node-001953',before:'Ya era de noche cuando llegué a la frontera con Zambia',after:'Ya era por la tarde cuando llegué a la frontera con Zambia'},
    {nodeId:'node-001972',before:'—No, no lo soy —me mantuve firme esta vez.',after:'—No, no voy —me mantuve firme esta vez.'},
    {nodeId:'node-001984',before:'no tenía nada más pequeño que un billete de cincuenta dólares que no quería cambiar',after:'no tenía nada más pequeño que un billete de cincuenta dólares, que no necesitaba cambiar'},
    {nodeId:'node-003042',before:'travesías marítimas en botes hinchables',after:'travesías marítimas en botes pequeños'},
    {nodeId:'node-003054',before:'Aquellas primeras aventuras suyas habían llevado a nuestras propias aventuras emocionantes',after:'Aquellas primeras aventuras nos habían llevado a nuestras propias aventuras emocionantes'},
    {nodeId:'node-003099',before:'mientras empapaba el ambiente',after:'mientras me empapaba del ambiente'},
    {nodeId:'node-003116',before:'un abrigo de cazador de ciervos',after:'un abrigo de tweed estilo cazador'},
  ]
  const launchPack=await downloadArtifact(launchRow),buildId=deterministicSemanticBuildId(ORDER,LANGUAGE,sourceHash,brief.revision,`${SEMANTIC_PROMPT_SIGNATURE}+current-standard-editorial-v2`)
  const attempts=new Map<string,number>()
  const notes={schemaVersion:'1.0' as const,language:LANGUAGE,approach:'The editorial review preserves the author’s candid first-person memoir voice, dry humour, factual detail, place names, and motorcycle terminology in natural European Spanish.',sections:[{id:'representative-decisions',title:'Representative Editorial Decisions',entries:[
    {source:'Going the Wrong Way',target:TITLE,reason:'The Spanish title conveys the book’s recurring idea of deliberately taking the unconventional route.'},
    {source:'Fear & Loving, North America',target:'Miedo y amor, Norteamérica',reason:'“Loving” remains love rather than becoming “loathing,” preserving the author’s deliberate twist on the familiar phrase.'},
    {source:'Those early adventures led to our own exciting enterprises',target:'Aquellas primeras aventuras nos habían llevado a nuestras propias aventuras emocionantes',reason:'The shared pronoun preserves that these were Chris and Richard’s formative adventures, not Richard’s alone.'},
    {source:'listened to a street jazz band and soaked up the atmosphere.',target:'escuché a una banda callejera de jazz mientras me empapaba del ambiente.',reason:'The idiomatic reflexive construction keeps the narrator actively absorbing the atmosphere of New Orleans.'},
  ]}]}
  const result=await runSemanticPipeline({
    supabase:db,orderId:ORDER,language:LANGUAGE,sourceFormat:'epub',source,title:order.book_title,verifiedTranslatedTitle:TITLE,authorName:order.author_name,genre:order.genre,brief,notes,customerNotesAreAuthoritative:true,launchPack,dualFormat:true,buildId,maxBatchConcurrency:3,repairUnexpectedExplanatoryBrackets:true,verifiedEditorialOverrides,
    translate:async(batch,context)=>{
      if(context.pass!==2)throw new Error(`Unexpected uncached Pass 1 batch ${context.batchIndex}`)
      const requestIdentity=`${ORDER}:${LANGUAGE}:current-standard-editorial:${context.batchId}`
      return translateWithDeterministicJsonRecovery(batch,requestIdentity,async(requestBatch,recovery)=>{
        const attempt=(attempts.get(recovery.requestId)||0)+1;attempts.set(recovery.requestId,attempt)
        let response:any
        try{
          response=await anthropic.messages.create({model:BOOKLINGUA_MODEL_CONFIG.editorial,max_tokens:20000,system:editorialSystemPrompt('Spanish (Spain)',context.genre,context.readerRegisterPrompt),messages:[{role:'user',content:`${renderTranslationBriefPrompt(context.brief)}\nEditorial pass; target language ${LANGUAGE}.\n${JSON.stringify(requestBatch)}`}]})
          const text=response.content.find((block:any)=>block.type==='text');if(!text||text.type!=='text')throw new Error('Model returned no JSON text')
          const parsed=JSON.parse(text.text.trim().replace(/^```json\s*/,'').replace(/\s*```$/,''))
          await recordModelTelemetry(db,{orderId:ORDER,language:LANGUAGE,buildId,stage:'editorial-current-standard',batchId:context.batchId,attempt,requestIdentity:recovery.requestId,provider:'anthropic',modelId:response.model,providerRequestId:response.id,success:true,inputTokens:response.usage.input_tokens,outputTokens:response.usage.output_tokens,cacheStatus:'write'})
          return parsed
        }catch(error){await recordModelTelemetry(db,{orderId:ORDER,language:LANGUAGE,buildId,stage:'editorial-current-standard',batchId:context.batchId,attempt,requestIdentity:recovery.requestId,provider:'anthropic',modelId:response?.model||BOOKLINGUA_MODEL_CONFIG.editorial,providerRequestId:response?.id,success:false,inputTokens:response?.usage.input_tokens,outputTokens:response?.usage.output_tokens,cacheStatus:'miss',errorCode:error instanceof Error?error.name:'MODEL_FAILURE'});throw error}
      })
    },
  })
  if(result.manifest.status!=='pass')throw new Error('Current-standard package did not pass')
  console.log(JSON.stringify({orderId:ORDER,priorBuildId:PRIOR_BUILD,buildId,status:result.manifest.status,seededPass1Batches,pass2Changes:priorPass2.nodes.filter((node:any,index:number)=>node.translatedText!==result.pass2.nodes[index]?.translatedText).length,customerEmailSent:false},null,2))
}

main().catch(error=>{console.error(error);process.exit(1)})
