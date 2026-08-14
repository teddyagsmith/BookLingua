import { createHash } from 'crypto'
import { NextRequest,NextResponse } from 'next/server'
import { Resend } from 'resend'
import { getSupabaseAdmin } from '@/lib/supabase'
import { assemblePackageManifest,evaluatePackageManifest } from '@/lib/package-manifest'
import { customerLanguageName,resolveCustomerDeliveryOrigin } from '@/lib/customer-delivery'
import { buildCustomerPortalUrl } from '@/lib/download-token'
import { renderCustomerPackageEmail } from '@/lib/email-templates'

export async function POST(request:NextRequest,{params}:{params:{orderId:string}}){
  if(request.headers.get('x-admin-password')!==process.env.ADMIN_PASSWORD)return NextResponse.json({error:'Unauthorized'},{status:401})
  if(process.env.BOOKLINGUA_DELIVERY_ENV!=='staging'||process.env.BOOKLINGUA_ALLOW_PREVIEW_DELIVERY!=='enabled')return NextResponse.json({error:'Preview delivery is disabled'},{status:409})
  const db=getSupabaseAdmin(),{data:order}=await db.from('orders').select('id,status,email,author_name,book_title,languages').eq('id',params.orderId).maybeSingle()
  if(!order||!['ready_for_review','completed'].includes(order.status))return NextResponse.json({error:'Validated staging order unavailable'},{status:409})
  const exactRecipient=process.env.BOOKLINGUA_STAGING_DELIVERY_RECIPIENT?.trim().toLowerCase()
  if(!exactRecipient||order.email.trim().toLowerCase()!==exactRecipient)return NextResponse.json({error:'Staging recipient mismatch'},{status:409})
  let origin:string
  try{origin=resolveCustomerDeliveryOrigin(undefined,'staging')}catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Public staging origin unavailable'},{status:409})}
  const manifests=[]
  for(const language of (order.languages as string[])||[]){
    const {data:build}=await db.from('order_language_builds').select('id').eq('order_id',order.id).eq('language',language).eq('is_current',true).maybeSingle()
    if(!build)return NextResponse.json({error:`Current build unavailable for ${language}`},{status:409})
    const manifest=await assemblePackageManifest({supabase:db,orderId:order.id,language,buildId:build.id})
    if(evaluatePackageManifest(manifest).status!=='pass')return NextResponse.json({error:`Current package unavailable for ${language}`},{status:409})
    manifests.push(manifest)
  }
  const ctaUrl=buildCustomerPortalUrl(order.id,origin)
  if(/(?:127\.0\.0\.1|localhost|0\.0\.0\.0)/i.test(ctaUrl))return NextResponse.json({error:'External preview URL is not public'},{status:409})
  const email=renderCustomerPackageEmail({authorName:order.author_name||'there',bookTitle:order.book_title,languages:manifests.map(item=>customerLanguageName(item.language)),downloadPageUrl:ctaUrl})
  const originIdentity=createHash('sha256').update(origin).digest('hex').slice(0,16)
  const {data,error}=await new Resend(process.env.RESEND_API_KEY!).emails.send({
    from:'BookLingua <orders@booklingua.io>',to:[order.email],subject:`[BOOKLINGUA STAGING TEST] ${email.subject}`,html:email.html,text:email.text,
  },{idempotencyKey:`delivery-preview-v3/${order.id}/${originIdentity}`})
  if(error)return NextResponse.json({error:'Preview customer email failed'},{status:502})
  return NextResponse.json({success:true,recipient:order.email,subject:`[BOOKLINGUA STAGING TEST] ${email.subject}`,ctaUrl,providerMessageId:data?.id||null})
}
