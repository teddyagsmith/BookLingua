import { createClient } from '@supabase/supabase-js'
import { google } from 'googleapis'
import { createHash } from 'node:crypto'
import { Readable } from 'node:stream'
import { readFile } from 'node:fs/promises'
import {assertDeliveryContract,checkUploadedObject} from '../lib/delivery-contract'
import {ensureOriginalAuthorUpload,orderFolderForLanguageFolder} from './drive-original-upload'

const ORDER_ID='bdacf80e-7e6d-4b8b-8e81-e7f442b123ec'
const FOLDER_ID='1MMCHxu9N7bPk8WDp27XD2h0xEbZLp0aK'
const TOKEN_PATH='/Users/gilbert/.openclaw/workspace/gilly_token.json'
const mime=(name:string)=>name.endsWith('.docx')?'application/vnd.openxmlformats-officedocument.wordprocessingml.document':name.endsWith('.epub')?'application/epub+zip':name.endsWith('.csv')?'text/csv':name.endsWith('.json')?'application/json':'text/plain'

async function main(){
  const token=JSON.parse(await readFile(TOKEN_PATH,'utf8'))
  const auth=new google.auth.OAuth2(token.client_id,token.client_secret);auth.setCredentials({refresh_token:token.refresh_token})
  const drive=google.drive({version:'v3',auth})
  const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}})
  const orderFolderId=await orderFolderForLanguageFolder(drive,FOLDER_ID)
  console.log(JSON.stringify({originalAuthorUpload:await ensureOriginalAuthorUpload({db,drive,orderId:ORDER_ID,orderFolderId})}))
  const {data:build,error:buildError}=await db.from('order_language_builds').select('id,state').eq('order_id',ORDER_ID).eq('language','de').eq('is_current',true).single()
  if(buildError||!build||build.state!=='passed')throw new Error(buildError?.message||'Current passed build missing')
  const buildId=build.id
  const {data:manifestRow,error:manifestError}=await db.from('package_manifests').select('manifest').eq('order_id',ORDER_ID).eq('language','de').eq('build_id',buildId).eq('status','pass').single()
  if(manifestError||!manifestRow)throw new Error(manifestError?.message||'Passed manifest missing')
  const before=await drive.files.list({q:`'${FOLDER_ID}' in parents and trashed=false`,fields:'files(id,name,mimeType,size,modifiedTime)',pageSize:1000})
  const old=before.data.files||[]
  const staged:Array<{id:string;name:string;md5:string;size:number;data:Buffer}>=[]
  try{
    for(const artifact of manifestRow.manifest.artifacts){
      const {data,error}=await db.storage.from(artifact.storageBucket).download(artifact.storagePath)
      if(error||!data)throw new Error(error?.message||`Download failed: ${artifact.filename}`)
      const bytes=Buffer.from(await data.arrayBuffer())
      if(createHash('sha256').update(bytes).digest('hex')!==artifact.sha256)throw new Error(`Supabase checksum mismatch: ${artifact.filename}`)
      const stagedName=`.replacement-${buildId}-${artifact.filename}`
      const uploaded=await drive.files.create({requestBody:{name:stagedName,parents:[FOLDER_ID]},media:{mimeType:mime(artifact.filename),body:Readable.from(bytes)},fields:'id,name,size,md5Checksum'})
      const localMd5=createHash('md5').update(bytes).digest('hex')
      if(uploaded.data.md5Checksum!==localMd5||Number(uploaded.data.size)!==bytes.length)throw new Error(`Drive checksum mismatch: ${artifact.filename}`)
      staged.push({id:uploaded.data.id!,name:artifact.filename,md5:localMd5,size:bytes.length,data:bytes})
    }
    if(staged.length!==10)throw new Error(`Expected 10 replacements, staged ${staged.length}`)
    for(const file of old)await drive.files.update({fileId:file.id!,requestBody:{trashed:true}})
    for(const file of staged)await drive.files.update({fileId:file.id,requestBody:{name:file.name}})
  }catch(error){
    for(const file of staged)await drive.files.update({fileId:file.id,requestBody:{trashed:true}}).catch(()=>undefined)
    throw error
  }
  const after=await drive.files.list({q:`'${FOLDER_ID}' in parents and trashed=false`,fields:'files(id,name,size,md5Checksum)',pageSize:1000,orderBy:'name'})
  const files=after.data.files||[]
  if(files.length!==10)throw new Error(`Final Drive inventory has ${files.length} files, expected 10`)
  for(const expected of staged){const actual=files.find(file=>file.name===expected.name);if(!actual||actual.md5Checksum!==expected.md5||Number(actual.size)!==expected.size)throw new Error(`Final verification failed: ${expected.name}`)}
  for(const expected of staged){const metadata=(await drive.files.get({fileId:expected.id,fields:'id,size,modifiedTime'})).data,media=await drive.files.get({fileId:expected.id,alt:'media'},{responseType:'arraybuffer'}),served=Buffer.from(media.data as ArrayBuffer),previous=old.find(file=>file.name===expected.name);assertDeliveryContract(checkUploadedObject(expected.data,{fileId:metadata.id!,sizeBytes:Number(metadata.size),modifiedTime:metadata.modifiedTime||undefined,checksum:createHash('sha256').update(served).digest('hex')},previous?.id?{fileId:previous.id,sizeBytes:Number(previous.size),modifiedTime:previous.modifiedTime||undefined}:undefined),`Castor Drive ${expected.name}`)}
  console.log(JSON.stringify({folderId:FOLDER_ID,buildId,oldFilesTrashed:old.length,newFilesVerified:files.length,files:files.map(file=>({name:file.name,size:Number(file.size),md5:file.md5Checksum}))},null,2))
}
main().catch(error=>{console.error(error);process.exit(1)})
