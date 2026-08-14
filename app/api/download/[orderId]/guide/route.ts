import { NextRequest,NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { verifyCustomerPortalToken } from '@/lib/download-token'
import { customerContentDisposition } from '@/lib/customer-delivery'
import { renderCustomerUploadGuideDocx } from '@/lib/customer-delivery-docx'

export async function GET(request:NextRequest,{params}:{params:{orderId:string}}){
  const token=request.nextUrl.searchParams.get('token')||''
  if(!verifyCustomerPortalToken(params.orderId,token))return NextResponse.json({error:'Invalid or missing download token'},{status:403})
  const {data:order}=await getSupabaseAdmin().from('orders').select('status').eq('id',params.orderId).maybeSingle()
  if(!order||!['delivery_pending','completed'].includes(order.status))return NextResponse.json({error:'Files are not approved for customer delivery'},{status:403})
  const bytes=await renderCustomerUploadGuideDocx()
  return new NextResponse(new Uint8Array(bytes),{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','Content-Disposition':customerContentDisposition('BookLingua - How to Use Your Translations + Upload Guide.docx'),'Cache-Control':'private, no-store','X-BookLingua-Artifact':'customer-guide-v3'}})
}
