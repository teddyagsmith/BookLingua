import {createClient} from '@supabase/supabase-js'
import {google} from 'googleapis'
import {createHash} from 'node:crypto'
import {Readable} from 'node:stream'
import {readFile} from 'node:fs/promises'
import {assertDeliveryContract,checkUploadedObject} from '../lib/delivery-contract'
import {ensureOriginalAuthorUpload} from './drive-original-upload'

const ORDER='a3341608-0fd7-4341-b74f-3f2905d1ce72',LANGUAGE='es-es',BUILD='c9b3e93e-8552-54d5-81c4-1652a8778130'
const ORDER_FOLDER='1c80lwdsvjOi8ZfX1ibKhnWTv8Ueq1sQJ',LANGUAGE_FOLDER='1JXY3zEF0wMruj7SDSU5UweZHWucKOGlo'
const TOKEN='/Users/gilbert/.openclaw/workspace/gilly_token.json'
const mime=(name:string)=>name.endsWith('.docx')?'application/vnd.openxmlformats-officedocument.wordprocessingml.document':name.endsWith('.epub')?'application/epub+zip':name.endsWith('.csv')?'text/csv':name.endsWith('.json')?'application/json':'text/plain'

async function main(){
  const token=JSON.parse(await readFile(TOKEN,'utf8')),auth=new google.auth.OAuth2(token.client_id,token.client_secret);auth.setCredentials({refresh_token:token.refresh_token})
  const drive=google.drive({version:'v3',auth}),db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}})
  const original=await ensureOriginalAuthorUpload({db,drive,orderId:ORDER,orderFolderId:ORDER_FOLDER})
  const {data:manifest,error}=await db.from('package_manifests').select('manifest').eq('order_id',ORDER).eq('language',LANGUAGE).eq('build_id',BUILD).eq('status','pass').single()
  if(error||!manifest)throw new Error(error?.message||'Passed manifest missing')
  const old=(await drive.files.list({q:`'${LANGUAGE_FOLDER}' in parents and trashed=false`,fields:'files(id,name,size,modifiedTime,md5Checksum)',pageSize:1000})).data.files||[]
  const staged:Array<{id:string;name:string;size:number;md5:string;data:Buffer}>=[]
  try{
    for(const artifact of manifest.manifest.artifacts){
      const blob=await db.storage.from(artifact.storageBucket).download(artifact.storagePath);if(blob.error||!blob.data)throw new Error(blob.error?.message||`Download failed: ${artifact.filename}`)
      const data=Buffer.from(await blob.data.arrayBuffer()),sha=createHash('sha256').update(data).digest('hex');if(sha!==artifact.sha256)throw new Error(`Supabase checksum mismatch: ${artifact.filename}`)
      const upload=await drive.files.create({requestBody:{name:`.replacement-${BUILD}-${artifact.filename}`,parents:[LANGUAGE_FOLDER]},media:{mimeType:mime(artifact.filename),body:Readable.from(data)},fields:'id,size,md5Checksum'}),md5=createHash('md5').update(data).digest('hex')
      if(!upload.data.id||upload.data.md5Checksum!==md5||Number(upload.data.size)!==data.length)throw new Error(`Drive upload mismatch: ${artifact.filename}`)
      staged.push({id:upload.data.id,name:artifact.filename,size:data.length,md5,data})
    }
    if(staged.length!==10)throw new Error(`Expected 10 current artifacts, staged ${staged.length}`)
    for(const file of old)if(file.id)await drive.files.update({fileId:file.id,requestBody:{trashed:true}})
    for(const file of staged)await drive.files.update({fileId:file.id,requestBody:{name:file.name}})
  }catch(error){for(const file of staged)await drive.files.update({fileId:file.id,requestBody:{trashed:true}}).catch(()=>undefined);throw error}
  const results=[]
  for(const expected of staged){
    const metadata=(await drive.files.get({fileId:expected.id,fields:'id,name,size,modifiedTime,md5Checksum,parents,trashed'})).data
    const media=await drive.files.get({fileId:expected.id,alt:'media'},{responseType:'arraybuffer'}),served=Buffer.from(media.data as ArrayBuffer),previous=old.find(file=>file.name===expected.name)
    assertDeliveryContract(checkUploadedObject(expected.data,{fileId:metadata.id!,sizeBytes:Number(metadata.size),modifiedTime:metadata.modifiedTime||undefined,checksum:createHash('sha256').update(served).digest('hex')},previous?.id?{fileId:previous.id,sizeBytes:Number(previous.size),modifiedTime:previous.modifiedTime||undefined}:undefined),`Going the Wrong Way Drive ${expected.name}`)
    results.push({name:metadata.name,fileId:metadata.id,modifiedTime:metadata.modifiedTime,sizeBytes:Number(metadata.size),sha256:createHash('sha256').update(served).digest('hex')})
  }
  const inventory=(await drive.files.list({q:`'${LANGUAGE_FOLDER}' in parents and trashed=false`,fields:'files(id,name,size,modifiedTime)',pageSize:1000,orderBy:'name'})).data.files||[]
  if(inventory.length!==10)throw new Error(`Drive inventory has ${inventory.length} files, expected 10`)
  console.log(JSON.stringify({orderId:ORDER,buildId:BUILD,original,inventoryCount:inventory.length,files:results},null,2))
}
main().catch(error=>{console.error(error);process.exit(1)})
