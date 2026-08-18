import { createHash } from 'crypto'
import { NextRequest,NextResponse } from 'next/server'
import { Resend } from 'resend'
import { getSupabaseAdmin } from '@/lib/supabase'
import { assemblePackageManifest,evaluatePackageManifest } from '@/lib/package-manifest'
import { customerLanguageName,resolveCustomerDeliveryOrigin } from '@/lib/customer-delivery'
import { buildCustomerPortalUrl,buildReviewPortalUrl } from '@/lib/download-token'
import { renderCustomerPackageEmail } from '@/lib/email-templates'

export async function POST(request:NextRequest,{params}:{params:{orderId:string}}){
  if(request.headers.get('x-admin-password')!==process.env.ADMIN_PASSWORD)return NextResponse.json({error:'Unauthorized'},{status:401})
  const internalReview=request.nextUrl.searchParams.get('scope')==='review'
  if(!internalReview&&(process.env.BOOKLINGUA_DELIVERY_ENV!=='staging'||process.env.BOOKLINGUA_ALLOW_PREVIEW_DELIVERY!=='enabled'))return NextResponse.json({error:'Preview delivery is disabled'},{status:409})
  const db=getSupabaseAdmin(),{data:order}=await db.from('orders').select('id,status,email,author_name,book_title,languages').eq('id',params.orderId).maybeSingle()
  const allowedStatuses=internalReview?['ready_for_review','reader_review_pending','delivery_pending','completed']:['ready_for_review','completed']
  if(!order||!allowedStatuses.includes(order.status))return NextResponse.json({error:'Validated order unavailable'},{status:409})
  const exactRecipient=internalReview?'gilly@myromancereads.com':process.env.BOOKLINGUA_STAGING_DELIVERY_RECIPIENT?.trim().toLowerCase()
  if(!exactRecipient||(!internalReview&&order.email.trim().toLowerCase()!==exactRecipient))return NextResponse.json({error:'Preview recipient mismatch'},{status:409})
  let origin:string
  try{origin=resolveCustomerDeliveryOrigin(undefined,internalReview?'production':'staging')}catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Public preview origin unavailable'},{status:409})}
  const manifests=[]
  for(const language of (order.languages as string[])||[]){
    const {data:build}=await db.from('order_language_builds').select('id').eq('order_id',order.id).eq('language',language).eq('is_current',true).maybeSingle()
    if(!build)return NextResponse.json({error:`Current build unavailable for ${language}`},{status:409})
    const manifest=await assemblePackageManifest({supabase:db,orderId:order.id,language,buildId:build.id})
    if(evaluatePackageManifest(manifest).status!=='pass')return NextResponse.json({error:`Current package unavailable for ${language}`},{status:409})
    manifests.push(manifest)
  }
  const ctaUrl=internalReview?buildReviewPortalUrl(order.id,origin):buildCustomerPortalUrl(order.id,origin)
  if(/(?:127\.0\.0\.1|localhost|0\.0\.0\.0)/i.test(ctaUrl))return NextResponse.json({error:'External preview URL is not public'},{status:409})
  const email=renderCustomerPackageEmail({authorName:order.author_name||'there',bookTitle:order.book_title,languages:manifests.map(item=>customerLanguageName(item.language)),downloadPageUrl:ctaUrl})
  const buildIdentity=manifests.map(item=>`${item.language}:${item.buildId}`).sort().join('|')
  const originIdentity=createHash('sha256').update(`${origin}:${buildIdentity}`).digest('hex').slice(0,16)
  const subject=internalReview?`[CUSTOMER EMAIL PREVIEW — APPROVAL] ${email.subject}`:`[BOOKLINGUA STAGING TEST] ${email.subject}`
  const {data,error}=await new Resend(process.env.RESEND_API_KEY!).emails.send({
    from:'BookLingua <orders@booklingua.io>',to:[exactRecipient],subject,html:email.html,text:email.text,
  },{idempotencyKey:`${internalReview?'internal-customer-preview-v1':'delivery-preview-v3'}/${order.id}/${originIdentity}`})
  if(error)return NextResponse.json({error:'Preview customer email failed'},{status:502})
  return NextResponse.json({success:true,recipient:exactRecipient,subject,ctaUrl,providerMessageId:data?.id||null})
}
