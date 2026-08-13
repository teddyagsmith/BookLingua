import { createClient } from '@supabase/supabase-js'
import { finalizeSemanticOrder } from '../../lib/semantic-finalization'

const url=process.env.NEXT_PUBLIC_SUPABASE_URL!, key=process.env.SUPABASE_SERVICE_ROLE_KEY!
if(!url.startsWith('http://127.0.0.1:')) throw new Error('Finalization proof refuses non-loopback Supabase')
const db=createClient(url,key),orderId=process.env.CANARY_REMEDIATION_ORDER_ID!,sends:any[]=[]
const run=()=>finalizeSemanticOrder({supabase:db,orderId,bookTitle:'Moonroot Synthetic',languages:['fr','de'],internalReviewAddress:'intercepted@example.invalid',appUrl:'https://example.invalid',sendInternalReview:async(message,options)=>{sends.push({subject:message.subject,idempotencyKey:options.idempotencyKey,hasLaunchPack:message.html.includes('launch_pack'),hasChapterMap:message.html.includes('chapter_map_csv'),hasUploadGuide:message.html.includes('upload_guide')});return{id:'mock-provider-id'}}})
async function main(){const first=await run(),retry=await run();const eventCount=(await db.from('pipeline_events').select('id',{count:'exact',head:true}).eq('order_id',orderId).eq('stage','internal_review_email')).count;const chunks=(await db.from('translation_chunks').select('lang_code,pass,model_provider,model_id,model_stage').eq('order_id',orderId)).data;const artifacts=(await db.from('artifacts').select('language,artifact_type,sha256').eq('order_id',orderId).order('language').order('artifact_type')).data;console.log(JSON.stringify({first,retry,eventCount,logicalEmailSends:sends.length,email:sends[0],translationCache:chunks,artifactCount:artifacts?.length,artifactHashes:artifacts},null,2))}
main().catch(error=>{console.error(error);process.exitCode=1})
