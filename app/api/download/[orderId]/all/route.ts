import {NextRequest,NextResponse} from 'next/server'
import JSZip from 'jszip'
import {getSupabaseAdmin} from '@/lib/supabase'
import {verifyCustomerPortalToken} from '@/lib/download-token'
import {customerBundleFilename,customerContentDisposition,customerLanguageName,customerVisibleArtifacts} from '@/lib/customer-delivery'
import {extractAuthoritativeTranslatedTitle,renderCustomerLaunchPackDocx,renderCustomerTranslationNotesDocx,renderCustomerUploadGuideDocx} from '@/lib/customer-delivery-docx'
import {selectManifestArtifact,verifyStoredArtifact} from '@/lib/hardened-artifact'
import type {ArtifactType,PackageArtifact,PackageManifestV1} from '@/lib/package-manifest'

export const runtime='nodejs'
export const maxDuration=60

type StoredArtifact={
  id:string;order_id:string;language:string;build_id:string;artifact_type:string;storage_bucket:string;storage_path:string;
  filename:string;sha256:string;size_bytes:number|string;validation_status:string;validation_reports?:unknown
}

async function loadVerifiedArtifact(orderId:string,language:string,buildId:string,manifest:PackageManifestV1,artifact:PackageArtifact):Promise<Buffer>{
  const db=getSupabaseAdmin()
  const {data}=await db.from('artifacts')
    .select('id, order_id, language, build_id, artifact_type, storage_bucket, storage_path, filename, sha256, size_bytes, validation_status, validation_report_id, validation_reports(passed)')
    .eq('id',artifact.id).eq('order_id',orderId).eq('language',language).eq('build_id',buildId)
    .eq('artifact_type',artifact.type).eq('validation_status','pass').maybeSingle()
  if(!data)throw new Error('Validated artifact unavailable')
  const record=data as StoredArtifact
  const {data:blob,error}=await db.storage.from(record.storage_bucket).download(record.storage_path)
  if(error||!blob)throw new Error('Validated artifact bytes unavailable')
  const bytes=Buffer.from(await blob.arrayBuffer())
  verifyStoredArtifact({manifestArtifact:artifact,record,orderId,language,buildId,type:artifact.type as ArtifactType,bytes})
  return bytes
}

export async function GET(request:NextRequest,{params}:{params:{orderId:string}}){
  const token=request.nextUrl.searchParams.get('token')||''
  if(!verifyCustomerPortalToken(params.orderId,token))return NextResponse.json({error:'Invalid or missing download token'},{status:403})
  const db=getSupabaseAdmin()
  const {data:order}=await db.from('orders').select('id,book_title,languages,status').eq('id',params.orderId).maybeSingle()
  if(!order||!['delivery_pending','completed'].includes(order.status))return NextResponse.json({error:'Files are not approved for customer delivery'},{status:403})
  try{
    const zip=new JSZip()
    zip.file('BookLingua - How to Use Your Translations + Upload Guide.docx',await renderCustomerUploadGuideDocx())
    for(const language of ((order.languages as string[])||[])){
      const {data:build}=await db.from('order_language_builds').select('id').eq('order_id',order.id).eq('language',language).eq('is_current',true).maybeSingle()
      const {data:row}=build?await db.from('package_manifests').select('manifest').eq('order_id',order.id).eq('language',language).eq('build_id',build.id).eq('status','pass').maybeSingle():{data:null}
      if(!build||!row?.manifest)throw new Error('Current validated package unavailable')
      const manifest=row.manifest as PackageManifestV1
      const visible=customerVisibleArtifacts(order.book_title,manifest)
      let notesBytes:Buffer|undefined
      if(visible.some(item=>item.type==='launch_pack')){
        const notesArtifact=selectManifestArtifact(manifest,'translation_notes')
        notesBytes=await loadVerifiedArtifact(order.id,language,build.id,manifest,notesArtifact)
      }
      for(const item of visible){
        let bytes=await loadVerifiedArtifact(order.id,language,build.id,manifest,item.artifact)
        if(item.type==='translation_notes')bytes=await renderCustomerTranslationNotesDocx(bytes,order.book_title,customerLanguageName(language))
        if(item.type==='launch_pack'){
          const translatedTitle=notesBytes?extractAuthoritativeTranslatedTitle(notesBytes,order.book_title)||undefined:undefined
          bytes=await renderCustomerLaunchPackDocx(bytes,order.book_title,translatedTitle)
        }
        zip.file(item.filename,bytes)
      }
    }
    const bytes=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE',compressionOptions:{level:6}})
    return new NextResponse(new Uint8Array(bytes),{headers:{'Content-Type':'application/zip','Content-Disposition':customerContentDisposition(customerBundleFilename(order.book_title)),'Cache-Control':'private, no-store','X-BookLingua-Artifact':'customer-bundle-v1'}})
  }catch(error){
    console.error('Customer bundle generation failed',error)
    return NextResponse.json({error:'Unable to build the download bundle'},{status:409})
  }
}
