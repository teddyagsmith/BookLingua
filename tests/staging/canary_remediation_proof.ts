import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'
import AdmZip from 'adm-zip'
import { runSemanticPipeline, SemanticTranslator } from '../../lib/semantic-pipeline'
import { buildTranslationBrief, renderTranslationBriefPrompt, translationBriefFingerprint } from '../../lib/translation-brief'
import { BOOKLINGUA_MODEL_CONFIG } from '../../lib/model-config'
import { generateLaunchStrategy, LaunchPackExecutionMetadata, toCanonicalLaunchPack } from '../../lib/launch-strategy'
import { launchMarket } from '../../lib/launch-pack-schema'
import { finalizeSemanticOrder } from '../../lib/semantic-finalization'

const url=process.env.NEXT_PUBLIC_SUPABASE_URL!, key=process.env.SUPABASE_SERVICE_ROLE_KEY!, apiKey=process.env.ANTHROPIC_API_KEY!
if(!url.startsWith('http://127.0.0.1:')) throw new Error('Canary remediation proof refuses non-loopback Supabase')
if(!apiKey) throw new Error('Anthropic key missing')
const db=createClient(url,key), anthropic=new Anthropic({apiKey}), orderId=process.env.CANARY_REMEDIATION_ORDER_ID || '94000000-0000-0000-0000-000000000001'
const usage={sonnet:{calls:0,inputTokens:0,outputTokens:0},opus:[] as LaunchPackExecutionMetadata[]}

function epub(){const z:any=new AdmZip();z.addFile('mimetype',Buffer.from('application/epub+zip'));z.addFile('META-INF/container.xml',Buffer.from('<container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>'));z.addFile('OPS/book.opf',Buffer.from('<package><manifest><item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/><item id="c2" href="c2.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c1"/><itemref idref="c2"/></spine></package>'));z.addFile('OPS/c1.xhtml',Buffer.from('<html><body><h1>Chapter 1</h1><p>Mara protects the <em>Moonroot</em> beside the old bridge.</p></body></html>'));z.addFile('OPS/c2.xhtml',Buffer.from('<html><body><h1>Chapter 2</h1><p>Mara follows a silver map home.</p></body></html>'));return z.toBuffer()}

const translator:SemanticTranslator=async(batch,context)=>{const response=await anthropic.messages.create({model:BOOKLINGUA_MODEL_CONFIG.translation,max_tokens:4096,system:'Return only JSON. Preserve every supplied node ID and order exactly. Translate every text value.',messages:[{role:'user',content:`${renderTranslationBriefPrompt(context.brief)}\nPass ${context.pass}; target ${context.language}.\n${JSON.stringify(batch)}`} ]});usage.sonnet.calls++;usage.sonnet.inputTokens+=response.usage.input_tokens;usage.sonnet.outputTokens+=response.usage.output_tokens;const block=response.content.find(item=>item.type==='text');if(!block||block.type!=='text')throw new Error('Sonnet returned no text');return JSON.parse(block.text.replace(/^```json\s*|\s*```$/g,''))}

async function launch(language:string,sourceText:string){const market=launchMarket(language);let blockTypes:string[]=[];const strategy=await generateLaunchStrategy({bookTitle:'Moonroot Synthetic',authorName:'Synthetic',genre:'fantasy',bookDescription:sourceText,targetLanguage:market.language,targetMarket:market.market},{requestId:`${orderId}:${language}:launch-pack`,onMetadata:record=>{usage.opus.push(record)},createMessage:async params=>{const response=await anthropic.messages.create(params);blockTypes=response.content.map(item=>item.type);return response}});return {pack:Buffer.from(JSON.stringify(toCanonicalLaunchPack(strategy,language,true))),blockTypes}}

async function main(){
 const source=epub(),hash=createHash('sha256').update(source).digest('hex');await db.from('orders').delete().eq('id',orderId)
 let result=await db.from('orders').insert({id:orderId,email:'synthetic@example.invalid',author_name:'Synthetic',book_title:'Moonroot Synthetic',word_count:30,tier:'small',file_format:'.epub',languages:['fr','de'],upsells:['launch-pack','dual-format'],amount_paid:198,status:'processing',pipeline_version:'semantic-v2',semantic_structure_approved:true});if(result.error)throw result.error
 await db.from('files').insert({order_id:orderId,type:'source_manifest',language:'en',content:JSON.stringify({sourceHash:hash})})
 for(const language of ['fr','de']){const brief=buildTranslationBrief({language,sourceManifestFingerprint:hash,approvedAt:'2026-08-13T00:00:00.000Z',approvalSource:'admin',decisions:[{term:'Moonroot',decision:'keep'}]});result=await db.from('translation_briefs').insert({order_id:orderId,language,source_manifest_fingerprint:hash,schema_version:'1.0',revision:1,brief,content_fingerprint:translationBriefFingerprint(brief),approved_at:brief.approvedAt,approval_source:'admin'});if(result.error)throw result.error}
 const sends:any[]=[];const finalize=()=>finalizeSemanticOrder({supabase:db,orderId,bookTitle:'Moonroot Synthetic',languages:['fr','de'],internalReviewAddress:'intercepted@example.invalid',appUrl:'https://example.invalid',sendInternalReview:async(message,options)=>{sends.push({subject:message.subject,html:message.html,idempotencyKey:options.idempotencyKey});return{id:'mock-provider-id'}}})
 const callSnapshot=()=>({sonnet:usage.sonnet.calls,opus:usage.opus.length})
 const outputs:any={}
 for(const language of ['fr','de']){const brief=(await db.from('translation_briefs').select('brief').eq('order_id',orderId).eq('language',language).single()).data!.brief;const launchResult=await launch(language,source.toString('utf8'));outputs[language]=await runSemanticPipeline({supabase:db,orderId,language,sourceFormat:'epub',source,title:'Moonroot Synthetic',brief,notes:{schemaVersion:'1.0',language,approach:'Synthetic proof.',sections:[]},allowReviewedStructure:true,launchPack:launchResult.pack,dualFormat:true,translate:translator});outputs[`${language}BlockTypes`]=launchResult.blockTypes;if(language==='fr')outputs.partial=await finalize()}
 outputs.complete=await finalize();const beforeRetry=callSnapshot(),hashesBefore=(await db.from('artifacts').select('language,artifact_type,sha256').eq('order_id',orderId)).data
 outputs.retry=await finalize();const hashesAfter=(await db.from('artifacts').select('language,artifact_type,sha256').eq('order_id',orderId)).data
 if(outputs.partial.status!=='gate_failed'||outputs.complete.status!=='ready_for_review'||sends.length!==1)throw new Error('Aggregate finalization/idempotency proof failed')
 if(JSON.stringify(beforeRetry)!==JSON.stringify(callSnapshot())||JSON.stringify(hashesBefore)!==JSON.stringify(hashesAfter))throw new Error('Completed retry changed calls or hashes')
 const eventCount=(await db.from('pipeline_events').select('id',{count:'exact',head:true}).eq('order_id',orderId).eq('stage','internal_review_email')).count
 console.log(JSON.stringify({models:BOOKLINGUA_MODEL_CONFIG,usage,blockTypes:{fr:outputs.frBlockTypes,de:outputs.deBlockTypes},partial:outputs.partial,complete:outputs.complete,retry:outputs.retry,reviewEventCount:eventCount,logicalEmailSends:sends.length,artifactCount:hashesAfter?.length,hashesReused:true,callsBeforeRetry:beforeRetry,callsAfterRetry:callSnapshot()},null,2))
}
main().catch(error=>{console.error(error);process.exitCode=1})
