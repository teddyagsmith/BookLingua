import {createClient} from '@supabase/supabase-js'
import {google} from 'googleapis'
import {createHash} from 'node:crypto'
import {Readable} from 'node:stream'
import {readFile} from 'node:fs/promises'
import {renderCustomerLaunchPackDocx,renderCustomerTranslationNotesDocx} from '../lib/customer-delivery-docx'

const ORDER='6b47fdde-389a-49ad-ab94-fcc2e1ea08cc'
const TOKEN='/Users/gilbert/.openclaw/workspace/gilly_token.json'
const TARGETS={
  'es-es':{folder:'1srbrsxRctSU6RqcZOlYH8iLkUqF1Yt4K',code:'ES',title:'Recupera tu longevidad'},
  fr:{folder:'11GNgprwvknRIVhs_uVbmefJkJIUlmV7L',code:'FR',title:'Reconquérez votre longévité'},
  'pt-br':{folder:'1Q-HD3xkk4N1GEF_yJ4ZuW8sPNo75mG4B',code:'PT',title:'Reconquiste Sua Longevidade'},
  de:{folder:'1e02fecNjg70drucBXJC6drLrA6kFv5B9',code:'DE',title:'Erobern Sie Ihre Langlebigkeit zurück'},
} as const
const mime=(name:string)=>name.endsWith('.epub')?'application/epub+zip':'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

async function main(){
  const token=JSON.parse(await readFile(TOKEN,'utf8')),auth=new google.auth.OAuth2(token.client_id,token.client_secret);auth.setCredentials({refresh_token:token.refresh_token})
  const drive=google.drive({version:'v3',auth}),db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}})
  for(const [language,target] of Object.entries(TARGETS).filter(([language])=>!process.env.REPAIR_LANG||language===process.env.REPAIR_LANG)){
    const {data:build,error:buildError}=await db.from('order_language_builds').select('id,state').eq('order_id',ORDER).eq('language',language).eq('is_current',true).single()
    if(buildError||build?.state!=='passed')throw new Error(`${language}: current passed build missing`)
    const {data:manifest,error:manifestError}=await db.from('package_manifests').select('manifest').eq('order_id',ORDER).eq('language',language).eq('build_id',build.id).eq('status','pass').single()
    if(manifestError||!manifest)throw new Error(`${language}: passed manifest missing`)
    const artifacts=new Map(manifest.manifest.artifacts.map((artifact:any)=>[artifact.type,artifact]))
    const bytes=async(type:string)=>{const artifact:any=artifacts.get(type);if(!artifact)throw new Error(`${language}: ${type} missing`);const {data,error}=await db.storage.from(artifact.storageBucket).download(artifact.storagePath);if(error||!data)throw error||new Error('download failed');const value=Buffer.from(await data.arrayBuffer());if(createHash('sha256').update(value).digest('hex')!==artifact.sha256)throw new Error(`${language}: ${type} checksum mismatch`);return value}
    const files=[
      {name:`Reclaim Your Longevity - Final - ${target.code}.docx`,data:await bytes('final_docx')},
      {name:`Reclaim Your Longevity - Final - ${target.code}.epub`,data:await bytes('final_epub')},
      {name:`Reclaim Your Longevity - Review - ${target.code}.docx`,data:await bytes('review_docx')},
      {name:`Reclaim Your Longevity - Chapters - ${target.code}.docx`,data:await bytes('chapter_map_docx')},
      {name:`Reclaim Your Longevity - Notes - ${target.code}.docx`,data:await renderCustomerTranslationNotesDocx(await bytes('translation_notes'),target.title,language)},
      {name:`Reclaim Your Longevity - Launch Pack - ${target.code}.docx`,data:await renderCustomerLaunchPackDocx(await bytes('launch_pack'),'Reclaim Your Longevity',target.title,'Cari Rhys-Owen')},
    ]
    const old=(await drive.files.list({q:`'${target.folder}' in parents and trashed=false`,fields:'files(id,name,size,modifiedTime,md5Checksum)',pageSize:100})).data.files||[],oldFinal=old.find(file=>file.name===`Reclaim Your Longevity - Final - ${target.code}.docx`),staged:Array<{id:string;name:string;md5:string;size:number}>=[]
    try{
      for(const file of files){const stagedName=`.replacement-${build.id}-${file.name}`,upload=await drive.files.create({requestBody:{name:stagedName,parents:[target.folder]},media:{mimeType:mime(file.name),body:Readable.from(file.data)},fields:'id,size,md5Checksum'}),md5=createHash('md5').update(file.data).digest('hex');if(upload.data.md5Checksum!==md5||Number(upload.data.size)!==file.data.length)throw new Error(`${language}: Drive upload mismatch ${file.name}`);staged.push({id:upload.data.id!,name:file.name,md5,size:file.data.length})}
      if(staged.length!==6)throw new Error(`${language}: expected six customer files`)
      for(const file of old)await drive.files.update({fileId:file.id!,requestBody:{trashed:true}})
      for(const file of staged)await drive.files.update({fileId:file.id,requestBody:{name:file.name}})
    }catch(error){for(const file of staged)await drive.files.update({fileId:file.id,requestBody:{trashed:true}}).catch(()=>undefined);throw error}
    const current=(await drive.files.list({q:`'${target.folder}' in parents and trashed=false`,fields:'files(id,name,size,modifiedTime,md5Checksum)',orderBy:'name',pageSize:100})).data.files||[]
    if(current.length!==6||staged.some(expected=>!current.some(file=>file.name===expected.name&&file.md5Checksum===expected.md5&&Number(file.size)===expected.size)))throw new Error(`${language}: final Drive verification failed`)
    const final=current.find(file=>file.name===`Reclaim Your Longevity - Final - ${target.code}.docx`);if(!final?.id)throw new Error(`${language}: Final DOCX missing after read-back`)
    const refetched=(await drive.files.get({fileId:final.id,fields:'id,name,size,modifiedTime,md5Checksum,parents,trashed'})).data
    if(refetched.trashed||refetched.id!==final.id||refetched.md5Checksum!==final.md5Checksum||refetched.size!==final.size)throw new Error(`${language}: file-id read-back mismatch`)
    console.log(JSON.stringify({language,buildId:build.id,files:current.map(file=>file.name),finalDocx:{oldFileId:oldFinal?.id,oldSize:Number(oldFinal?.size||0),oldModifiedTime:oldFinal?.modifiedTime,newFileId:refetched.id,newSize:Number(refetched.size),newModifiedTime:refetched.modifiedTime,md5Checksum:refetched.md5Checksum}}))
  }
}
main().catch(error=>{console.error(error);process.exit(1)})
