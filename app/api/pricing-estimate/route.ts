import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { getSupabaseAdmin } from '@/lib/supabase'
import { escapeHtml, estimateDetails, parseEstimateRequest } from '@/lib/pricing-estimate'
import { FACEBOOK_FOLLOW_EMAIL_HTML } from '@/lib/social-links'

let resend: Resend | null = null
const getResend = () => resend ||= new Resend(process.env.RESEND_API_KEY!)
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

export async function POST(req: NextRequest) {
  try {
    const request = parseEstimateRequest(await req.json())
    if (!request) return NextResponse.json({ error: 'Please provide a valid email and estimate.' }, { status: 400 })

    const { price, languageNames, startUrl } = estimateDetails(request)
    const db = getSupabaseAdmin()
    const { data: lead, error: insertError } = await db.from('pricing_estimate_leads').insert({
      email: request.email,
      word_count: request.wordCount,
      languages: request.languages,
      price_tier: price.tier.key,
      base_price: price.tier.basePrice,
      subtotal: price.subtotal,
      discount_percent: price.discountPercent,
      discount_amount: price.discountAmount,
      total: price.total,
      source: request.source,
      page_url: request.pageUrl,
      referrer: request.referrer,
      utm_source: request.utm.utm_source,
      utm_medium: request.utm.utm_medium,
      utm_campaign: request.utm.utm_campaign,
      utm_term: request.utm.utm_term,
      utm_content: request.utm.utm_content,
      marketing_consent: request.marketingConsent,
      marketing_consented_at: request.marketingConsent ? new Date().toISOString() : null,
    }).select('id').single()
    if (insertError) throw insertError

    if (request.marketingConsent) {
      const { error } = await db.from('email_subscribers').upsert(
        { email: request.email, source: 'pricing_estimate', subscribed_at: new Date().toISOString() },
        { onConflict: 'email' },
      )
      if (error) console.error('Pricing estimate marketing consent save failed:', error)
    }

    const languageRows = languageNames.map((name, index) => `<li style="margin:6px 0">${escapeHtml(name)} — ${money.format(price.tier.basePrice)}</li>`).join('')
    const { data: sent, error: emailError } = await getResend().emails.send({
      from: 'BookLingua <hello@booklingua.io>',
      to: request.email,
      subject: `Your BookLingua translation estimate: ${money.format(price.total)}`,
      html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#272136;line-height:1.6">
        <h1 style="color:#6d28d9">Your BookLingua estimate</h1>
        <p>Here is the translation estimate you requested.</p>
        <div style="background:#f5f3ff;border-radius:14px;padding:22px">
          <p><strong>Manuscript:</strong> ${request.wordCount.toLocaleString('en-US')} words</p>
          <p><strong>Selected languages:</strong></p><ul>${languageRows}</ul>
          <p><strong>Subtotal:</strong> ${money.format(price.subtotal)}</p>
          <p><strong>Multi-language discount${price.discountPercent ? ` (${price.discountPercent}%)` : ''}:</strong> ${price.discountPercent ? `−${money.format(price.discountAmount)}` : 'Not applicable'}</p>
          <p style="font-size:22px"><strong>Estimated total: ${money.format(price.total)}</strong></p>
        </div>
        <p style="font-size:13px;color:#6b7280">This estimate is based on the word count entered and will be confirmed after your manuscript is uploaded.</p>
        <p><a href="${escapeHtml(startUrl)}" style="display:inline-block;background:#6d28d9;color:white;padding:13px 22px;border-radius:10px;text-decoration:none;font-weight:bold">Start your translation →</a></p>
        ${request.marketingConsent ? FACEBOOK_FOLLOW_EMAIL_HTML : ''}
        <p style="font-size:12px;color:#6b7280">You received this transactional email because you requested a pricing estimate. ${request.marketingConsent ? 'You also opted in to BookLingua marketing emails.' : 'You did not opt in to marketing emails.'}</p>
      </div>`,
    })
    if (emailError) {
      await db.from('pricing_estimate_leads').update({ email_status: 'failed' }).eq('id', lead.id)
      throw emailError
    }
    await db.from('pricing_estimate_leads').update({ email_status: 'sent', email_sent_at: new Date().toISOString(), provider_message_id: sent?.id || null }).eq('id', lead.id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Pricing estimate request failed:', error)
    return NextResponse.json({ error: 'We could not send your estimate. Please try again.' }, { status: 500 })
  }
}
