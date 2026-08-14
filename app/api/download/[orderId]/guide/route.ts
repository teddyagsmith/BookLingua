import { createHash } from 'crypto'
import { readFile } from 'fs/promises'
import path from 'path'
import { NextRequest,NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { verifyCustomerPortalToken } from '@/lib/download-token'
import { customerContentDisposition } from '@/lib/customer-delivery'
import { UPLOAD_GUIDE_ASSET_PATH,UPLOAD_GUIDE_SHA256 } from '@/lib/upload-guide'

export async function GET(request:NextRequest,{params}:{params:{orderId:string}}){
  const token=request.nextUrl.searchParams.get('token')||''
  if(!verifyCustomerPortalToken(params.orderId,token))return NextResponse.json({error:'Invalid or missing download token'},{status:403})
  const {data:order}=await getSupabaseAdmin().from('orders').select('status').eq('id',params.orderId).maybeSingle()
  if(!order||!['delivery_pending','completed'].includes(order.status))return NextResponse.json({error:'Files are not approved for customer delivery'},{status:403})
  const bytes=await readFile(path.join(process.cwd(),'public',UPLOAD_GUIDE_ASSET_PATH.replace(/^\//,'')))
  if(createHash('sha256').update(bytes).digest('hex')!==UPLOAD_GUIDE_SHA256)return NextResponse.json({error:'Upload Guide integrity check failed'},{status:409})
  return new NextResponse(bytes,{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','Content-Disposition':customerContentDisposition('BookLingua Author Upload Guide.docx'),'Cache-Control':'private, no-store','X-BookLingua-Artifact':'pinned-upload-guide'}})
}
