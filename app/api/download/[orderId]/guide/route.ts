import { NextRequest,NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { verifyCustomerPortalToken,verifyReviewPortalToken } from '@/lib/download-token'
import { customerContentDisposition } from '@/lib/customer-delivery'
import { renderCustomerUploadGuideDocx } from '@/lib/customer-delivery-docx'

export async function GET(request:NextRequest,{params}:{params:{orderId:string}}){
  const token=request.nextUrl.searchParams.get('token')||''
  const reviewScope=request.nextUrl.searchParams.get('scope')==='review'
  if(reviewScope?!verifyReviewPortalToken(params.orderId,token):!verifyCustomerPortalToken(params.orderId,token))return NextResponse.json({error:'Invalid or missing download token'},{status:403})
  const {data:order}=await getSupabaseAdmin().from('orders').select('status').eq('id',params.orderId).maybeSingle()
  const allowedStatuses=reviewScope?['ready_for_review','reader_review_pending','delivery_pending','completed']:['delivery_pending','completed']
  if(!order||!allowedStatuses.includes(order.status))return NextResponse.json({error:reviewScope?'Files are not ready for internal review':'Files are not approved for customer delivery'},{status:403})
  const bytes=await renderCustomerUploadGuideDocx()
  return new NextResponse(new Uint8Array(bytes),{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','Content-Disposition':customerContentDisposition('BookLingua - How to Use Your Translations + Upload Guide.docx'),'Cache-Control':'private, no-store','X-BookLingua-Artifact':'customer-guide-v3'}})
}
