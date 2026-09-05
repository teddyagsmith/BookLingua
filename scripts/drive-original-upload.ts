import type {SupabaseClient} from '@supabase/supabase-js'
import type {drive_v3} from 'googleapis'
import {createHash} from 'node:crypto'
import {Readable} from 'node:stream'

const escapeDriveQuery=(value:string)=>value.replace(/\\/g,'\\\\').replace(/'/g,"\\'")

export async function orderFolderForLanguageFolder(drive:drive_v3.Drive,languageFolderId:string){
  const row=(await drive.files.get({fileId:languageFolderId,fields:'parents'})).data
  if(!row.parents?.length)throw new Error(`Drive language folder ${languageFolderId} has no order-folder parent`)
  return row.parents[0]
}

export async function ensureOriginalAuthorUpload(input:{
  db:SupabaseClient
  drive:drive_v3.Drive
  orderId:string
  orderFolderId:string
}){
  const {data:source,error}=await input.db.from('files').select('file_url,original_content').eq('order_id',input.orderId).eq('type','original').order('created_at',{ascending:false}).limit(1).single()
  if(error||!source?.file_url)throw new Error(error?.message||`Original upload missing for ${input.orderId}`)
  const details=typeof source.original_content==='string'?JSON.parse(source.original_content):source.original_content||{}
  const sourceName=String(details.filename||source.file_url.split('/').pop()||'original-upload')
  const filename=`Original Author Upload - ${sourceName}`
  const bucket=String(details.storageBucket||'booklingua-private-sources')
  const downloaded=await input.db.storage.from(bucket).download(source.file_url)
  if(downloaded.error||!downloaded.data)throw new Error(downloaded.error?.message||`Could not download ${sourceName}`)
  const bytes=Buffer.from(await downloaded.data.arrayBuffer())
  const sha256=createHash('sha256').update(bytes).digest('hex')
  if(details.sha256&&details.sha256!==sha256)throw new Error(`Original source checksum mismatch for ${sourceName}`)
  const md5=createHash('md5').update(bytes).digest('hex')
  const existing=(await input.drive.files.list({q:`'${input.orderFolderId}' in parents and trashed=false and name='${escapeDriveQuery(filename)}'`,fields:'files(id,name,size,modifiedTime,md5Checksum)',pageSize:10})).data.files||[]
  const exact=existing.find(file=>file.md5Checksum===md5&&Number(file.size)===bytes.length)
  if(exact?.id)return{fileId:exact.id,filename,sizeBytes:bytes.length,sha256,modifiedTime:exact.modifiedTime,created:false}
  const mimeType=sourceName.toLowerCase().endsWith('.epub')?'application/epub+zip':sourceName.toLowerCase().endsWith('.docx')?'application/vnd.openxmlformats-officedocument.wordprocessingml.document':'application/octet-stream'
  const uploaded=await input.drive.files.create({requestBody:{name:filename,parents:[input.orderFolderId],description:'Internal BookLingua archive: original file supplied by the author. Not part of the customer delivery package.'},media:{mimeType,body:Readable.from(bytes)},fields:'id,name,size,modifiedTime,md5Checksum'})
  if(!uploaded.data.id||uploaded.data.md5Checksum!==md5||Number(uploaded.data.size)!==bytes.length)throw new Error(`Drive upload mismatch for ${filename}`)
  for(const stale of existing)if(stale.id&&stale.id!==uploaded.data.id)await input.drive.files.update({fileId:stale.id,requestBody:{trashed:true}})
  const media=await input.drive.files.get({fileId:uploaded.data.id,alt:'media'},{responseType:'arraybuffer'})
  const served=Buffer.from(media.data as ArrayBuffer)
  if(createHash('sha256').update(served).digest('hex')!==sha256)throw new Error(`Drive read-back mismatch for ${filename}`)
  return{fileId:uploaded.data.id,filename,sizeBytes:bytes.length,sha256,modifiedTime:uploaded.data.modifiedTime,created:true}
}
