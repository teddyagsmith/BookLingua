import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'
import AdmZip from 'adm-zip'
import { runSemanticPipeline, SemanticTranslator } from '../../lib/semantic-pipeline'
import { buildTranslationBrief, renderTranslationBriefPrompt, translationBriefFingerprint } from '../../lib/translation-brief'
import { BOOKLINGUA_MODEL_CONFIG } from '../../lib/model-config'

const url=process.env.NEXT_PUBLIC_SUPABASE_URL!, key=process.env.SUPABASE_SERVICE_ROLE_KEY!, apiKey=process.env.ANTHROPIC_API_KEY!
if(!url.startsWith('http://127.0.0.1:')) throw new Error('Real-model proof refuses non-loopback Supabase')
if(!apiKey) throw new Error('Anthropic key missing')
const db=createClient(url,key), model=process.env.BOOKLINGUA_TEST_MODEL || BOOKLINGUA_MODEL_CONFIG.translation, anthropic=new Anthropic({apiKey})
let inputTokens=0, outputTokens=0, calls=0
const cost=()=>inputTokens/1_000_000*3+outputTokens/1_000_000*15

const translator: SemanticTranslator=async(batch,context)=>{
  const response=await anthropic.messages.create({model,max_tokens:4096,system:'You are a book translation engine. Return ONLY JSON with exactly schemaVersion, sourceFingerprint, nodes. Preserve node IDs and order exactly. Translate every node text; never add, remove, reorder, or empty nodes.',messages:[{role:'user',content:`${renderTranslationBriefPrompt(context.brief)}\nPASS ${context.pass}. TARGET ${context.language}.\nINPUT JSON:\n${JSON.stringify(batch)}`}]})
  calls++; inputTokens+=response.usage.input_tokens; outputTokens+=response.usage.output_tokens
  if(cost()>5) throw new Error(`Abnormal proof cost threshold exceeded: $${cost().toFixed(4)}`)
  const block=response.content.find(item=>item.type==='text'); if(!block||block.type!=='text') throw new Error('Model returned no text')
  const clean=block.text.trim().replace(/^```json\s*/,'').replace(/```$/,'').trim(); return JSON.parse(clean)
}

function epub(){const z:any=new AdmZip();z.addFile('mimetype',Buffer.from('application/epub+zip'));z.addFile('META-INF/container.xml',Buffer.from('<container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>'));z.addFile('OPS/book.opf',Buffer.from('<package><manifest><item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/><item id="c2" href="c2.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c1"/><itemref idref="c2"/></spine></package>'));z.addFile('OPS/c1.xhtml',Buffer.from('<html><body><h1>Chapter 1</h1><p>Mara protects the <em>Moonroot</em> beside the old bridge.</p></body></html>'));z.addFile('OPS/c2.xhtml',Buffer.from('<html><body><h1>Chapter 2</h1><p>Mara follows a <a href="#note">silver map</a> home.</p></body></html>'));return z.toBuffer()}
async function setup(orderId:string,languages:string[],format:string,source:Buffer){await db.from('orders').delete().eq('id',orderId);const hash=createHash('sha256').update(source).digest('hex');let r=await db.from('orders').insert({id:orderId,email:`${orderId}@example.invalid`,author_name:'Synthetic',book_title:'Moonroot Test',word_count:200,tier:'small',file_format:`.${format}`,languages,amount_paid:99,status:'processing',pipeline_version:'semantic-v2'});if(r.error)throw r.error;await db.from('files').insert({order_id:orderId,type:'source_manifest',language:'en',content:JSON.stringify({sourceHash:hash})});for(const language of languages){const brief=buildTranslationBrief({language,sourceManifestFingerprint:hash,approvedAt:'2026-08-13T00:00:00.000Z',approvalSource:'admin',decisions:[{term:'Moonroot',decision:'keep'}]});r=await db.from('translation_briefs').insert({order_id:orderId,language,source_manifest_fingerprint:hash,schema_version:'1.0',revision:1,brief,content_fingerprint:translationBriefFingerprint(brief),approved_at:brief.approvedAt,approval_source:'admin'});if(r.error)throw r.error}return hash}
async function run(orderId:string,language:string,format:'epub'|'txt',source:Buffer){const brief=(await db.from('translation_briefs').select('brief').eq('order_id',orderId).eq('language',language).single()).data!.brief;return runSemanticPipeline({supabase:db,orderId,language,sourceFormat:format,source,title:'Moonroot Test',brief,notes:{schemaVersion:'1.0',language,approach:'Synthetic real-model proof.',sections:[{id:'term',title:'Terminology',entries:[{source:'Moonroot',target:'Moonroot',reason:'Author requested exact retention.'}]}]},allowReviewedStructure:true,translationModel:model,editorialModel:model,translate:translator})}

async function main(){console.log(JSON.stringify({usageBefore:{calls:0,inputTokens:0,outputTokens:0,costUsd:0},model}))
 const e=epub(), epubOrder='93000000-0000-0000-0000-000000000001';await setup(epubOrder,['fr'],'epub',e);const er=await run(epubOrder,'fr','epub',e);if(er.manifest.status!=='pass')throw new Error('Real EPUB package failed')
 const callsAfterEpub=calls;const retry=await run(epubOrder,'fr','epub',e);if(calls!==callsAfterEpub||retry.buildId!==er.buildId)throw new Error('Cache retry invoked model or changed build')
 const txt=Buffer.from('# Chapter 1\nMara keeps Moonroot safe.\n\n# Chapter 2\nMara returns home.'), multi='93000000-0000-0000-0000-000000000002';await setup(multi,['fr','de'],'txt',txt);await run(multi,'fr','txt',txt);const partial=(await db.from('orders').select('status').eq('id',multi).single()).data!.status;await run(multi,'de','txt',txt);const complete=(await db.from('orders').select('status').eq('id',multi).single()).data!.status;if(partial!=='gate_failed'||complete!=='ready_for_review')throw new Error(`Multilingual gate ${partial}/${complete}`);const {error:approvalError}=await db.rpc('begin_hardened_delivery',{p_order_id:multi});if(approvalError)throw approvalError
 console.log(JSON.stringify({model,epub:{status:er.manifest.status,buildId:er.buildId,retryCacheHit:true},multi:{partial,complete,approved:true},usageAfter:{calls,inputTokens,outputTokens,costUsd:Number(cost().toFixed(6))}},null,2))}
main().catch(error=>{console.error(error);process.exitCode=1})
