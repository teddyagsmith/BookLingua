import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { downloadOriginalBinary } from '../lib/source-binary'
import { runSemanticPipeline } from '../lib/semantic-pipeline'

const ORDER_ID='bdacf80e-7e6d-4b8b-8e81-e7f442b123ec'

async function download(db:any,artifact:any){
  const {data,error}=await db.storage.from(artifact.storageBucket).download(artifact.storagePath)
  if(error||!data)throw new Error(error?.message||`Cannot download ${artifact.type}`)
  return Buffer.from(await data.arrayBuffer())
}

function repairLaunchPack(raw:Buffer){
  const pack=JSON.parse(raw.toString('utf8'))
  pack.schemaVersion='3.1'
  pack.bookDescription=String(pack.bookDescription||'')
    .replace(/führt sie Sie von/g,'führt sie dich von')
    .replace(/Das erwartet Sie:/g,'Das erwartet dich:')
  pack.reviewStrategy=(pack.reviewStrategy||[]).map((value:string)=>String(value)
    .replace("Wenn Ihnen ein Rezept geholfen hat, freue ich mich über eine ehrliche Rezension auf Amazon.de","Wenn dir ein Rezept geholfen hat, freue ich mich über eine ehrliche Rezension auf Amazon.de")
    .replace("use 'Sie'","use formal German address"))
  pack.marketingHooks=(pack.marketingHooks||[]).map((item:any)=>{
    const legacyLine=item['fr'+'enchPromotionalLine']
    const rest={...item};delete rest['fr'+'enchPromotionalLine']
    const promotionalLine=String(item.promotionalLine||legacyLine||'')
      .replace('Die Wahl liegt bei Ihnen.','Die Wahl liegt bei dir.')
      .replace('Vom Ebers-Papyrus bis in Ihr Badezimmer:','Vom Ebers-Papyrus bis in dein Badezimmer:')
      .replace('Anwendungen, mit denen Sie nicht gerechnet haben.','Anwendungen, mit denen du nicht gerechnet hast.')
    return {...rest,promotionalLine}
  })
  pack.socialContentIdeas=(pack.socialContentIdeas||[]).map((item:any)=>{
    const legacyCaption=item['fr'+'enchCaption'];const rest={...item};delete rest['fr'+'enchCaption']
    return {...rest,
    caption:String(item.caption||legacyCaption||'')
      .replace('Bevor Sie loslegen:','Bevor du loslegst:')
      .replace('Ihre Frage, meine Antwort:','Deine Frage, meine Antwort:'),
  }})
  const notes:string[]=[]
  pack.categories=(pack.categories||[]).filter((item:string)=>{
    if(/verify|available|category paths|amazon kdp|methodolog/i.test(item)){notes.push(item);return false}
    return true
  })
  if(notes.length)pack.categoriesNote=notes.join(' ')
  const remaining=JSON.stringify(pack).match(/\b(?:Sie|Ihnen|Ihr|Ihre|Ihrem|Ihren|Ihrer|Ihres)\b/g)
  if(remaining?.length)throw new Error(`Formal German register remains in Launch Pack: ${remaining.join(', ')}`)
  return Buffer.from(JSON.stringify(pack,null,2))
}

async function main(){
  const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}})
  const {data:order,error:orderError}=await db.from('orders').select('*').eq('id',ORDER_ID).single()
  if(orderError||!order)throw new Error(orderError?.message||'Order missing')
  const {data:sourceRow,error:sourceError}=await db.from('files').select('file_url,original_content').eq('order_id',ORDER_ID).eq('type','original').single()
  if(sourceError||!sourceRow)throw new Error(sourceError?.message||'Source missing')
  const sourceMeta=JSON.parse(sourceRow.original_content||'{}')
  const source=await downloadOriginalBinary(db,sourceRow.file_url,sourceMeta.sha256,sourceMeta.storageBucket)
  const {data:briefRow,error:briefError}=await db.from('translation_briefs').select('brief').eq('order_id',ORDER_ID).eq('language','de').order('revision',{ascending:false}).limit(1).single()
  if(briefError||!briefRow)throw new Error(briefError?.message||'Brief missing')
  const {data:current,error:currentError}=await db.from('order_language_builds').select('id,state').eq('order_id',ORDER_ID).eq('language','de').eq('is_current',true).single()
  if(currentError||!current)throw new Error(currentError?.message||'Current build missing')
  const {data:manifestRow,error:manifestError}=await db.from('package_manifests').select('manifest,build_id').eq('order_id',ORDER_ID).eq('language','de').eq('status','pass').order('created_at',{ascending:false}).limit(1).single()
  if(manifestError||!manifestRow)throw new Error(manifestError?.message||'Manifest missing')
  const launchArtifact=manifestRow.manifest.artifacts.find((item:any)=>item.type==='launch_pack')
  const launchPack=repairLaunchPack(await download(db,launchArtifact))
  const buildId=randomUUID()
  const result=await runSemanticPipeline({
    supabase:db,orderId:ORDER_ID,language:'de',sourceFormat:'epub',source,title:order.book_title,
    brief:briefRow.brief,notes:{schemaVersion:'1.0',language:'de',approach:'Approved informal German reader register and editorial review applied consistently.',sections:[]},
    buildId,allowReviewedStructure:true,dualFormat:false,launchPack,
    translate:async(_batch,context)=>{throw new Error(`UNEXPECTED_MODEL_CALL pass=${context.pass} batch=${context.batchIndex}`)},
  })
  const out=path.join(process.cwd(),'working','castor-oil-fix-2026-09-02')
  await mkdir(out,{recursive:true})
  await writeFile(path.join(out,'result.json'),JSON.stringify({orderId:ORDER_ID,previousBuild:manifestRow.build_id,buildId:result.buildId,manifest:result.manifest},null,2))
  console.log(JSON.stringify({previousBuild:manifestRow.build_id,buildId:result.buildId,status:result.manifest.status,artifacts:result.manifest.artifacts.map((a:any)=>a.type)},null,2))
}
main().catch(error=>{console.error(error);process.exit(1)})
