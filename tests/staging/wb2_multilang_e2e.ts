import { createClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'
import { runSemanticPipeline } from '../../lib/semantic-pipeline'
import { buildTranslationBrief, translationBriefFingerprint } from '../../lib/translation-brief'

const url=process.env.NEXT_PUBLIC_SUPABASE_URL!, key=process.env.SUPABASE_SERVICE_ROLE_KEY!
if(!url.startsWith('http://127.0.0.1:')) throw new Error('local Supabase required')
const db=createClient(url,key), orderId='92000000-0000-0000-0000-000000000001', source=Buffer.from(Array.from({length:12},(_,i)=>`# Chapter ${i+1}\nSynthetic Moonroot body ${i+1}.`).join('\n\n')), hash=createHash('sha256').update(source).digest('hex')

async function language(lang:string) {
  const brief=buildTranslationBrief({language:lang,sourceManifestFingerprint:hash,approvedAt:'2026-08-13T00:00:00.000Z',approvalSource:'admin',decisions:[{term:'Moonroot',decision:'keep'}]})
  const {error}=await db.from('translation_briefs').insert({order_id:orderId,language:lang,source_manifest_fingerprint:hash,schema_version:'1.0',revision:1,brief,content_fingerprint:translationBriefFingerprint(brief),approved_at:brief.approvedAt,approval_source:'admin'}); if(error) throw error
  return runSemanticPipeline({supabase:db,orderId,language:lang,sourceFormat:'txt',source,title:'Multilingual Synthetic',brief,notes:{schemaVersion:'1.0',language:lang,approach:'Synthetic.',sections:[]},allowReviewedStructure:true,translate:async(batch,ctx)=>({...batch,nodes:batch.nodes.map(n=>({...n,text:`${ctx.language}-${ctx.pass} ${n.text}`}))})})
}

async function main(){
  await db.from('orders').delete().eq('id',orderId)
  const {error}=await db.from('orders').insert({id:orderId,email:'multi@example.invalid',author_name:'Synthetic',book_title:'Multi',word_count:1000,tier:'small',file_format:'.txt',languages:['fr','de'],amount_paid:198,status:'processing',pipeline_version:'semantic-v2'}); if(error)throw error
  await db.from('files').insert({order_id:orderId,type:'source_manifest',language:'en',content:JSON.stringify({sourceHash:hash})})
  const fr=await language('fr'); const afterFr=(await db.from('orders').select('status').eq('id',orderId).single()).data!.status
  const de=await language('de'); const afterBoth=(await db.from('orders').select('status').eq('id',orderId).single()).data!.status
  const {data:event,error:approvalError}=await db.rpc('begin_hardened_delivery',{p_order_id:orderId})
  if(afterFr!=='gate_failed'||afterBoth!=='ready_for_review'||approvalError) throw new Error(`multi-language lifecycle failed ${afterFr}/${afterBoth}/${approvalError?.message}`)
  console.log(JSON.stringify({afterFr,afterBoth,frBuild:fr.buildId,deBuild:de.buildId,deliveryEvent:event},null,2))
}
main().catch(e=>{console.error(e);process.exitCode=1})
