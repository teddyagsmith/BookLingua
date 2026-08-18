import { NextRequest,NextResponse } from 'next/server'
import {createHash} from 'crypto'
import {getSupabaseAdmin} from '@/lib/supabase'
import {verifyReaderPanelToken} from '@/lib/download-token'

export async function GET(request:NextRequest,{params}:{params:{requestIdentity:string}}){
 const token=request.nextUrl.searchParams.get('token')||''
 if(!verifyReaderPanelToken(params.requestIdentity,token))return NextResponse.json({error:'Invalid reader-panel token'},{status:403})
 const db=getSupabaseAdmin(),{data:row}=await db.from('reader_panel_requests').select('sample_storage_bucket,sample_storage_path,sample_filename,sample_sha256').eq('request_identity',params.requestIdentity).maybeSingle()
 if(!row)return NextResponse.json({error:'Reader sample unavailable'},{status:404})
 const {data,error}=await db.storage.from(row.sample_storage_bucket).download(row.sample_storage_path)
 if(error||!data)return NextResponse.json({error:'Reader sample unavailable'},{status:503})
 const bytes=Buffer.from(await data.arrayBuffer())
 if(createHash('sha256').update(bytes).digest('hex')!==row.sample_sha256)return NextResponse.json({error:'Reader sample integrity check failed'},{status:409})
 return new NextResponse(new Uint8Array(bytes),{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','Content-Disposition':`attachment; filename="${String(row.sample_filename).replace(/"/g,'')}"`,'Cache-Control':'private, no-store'}})
}
