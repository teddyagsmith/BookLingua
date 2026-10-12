import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { getSupabaseAdmin } from '@/lib/supabase'

const SCORECARD_URL = 'https://booklingua.io/scorecard'
const GENRES = new Set(['romance', 'fantasy', 'thriller_crime', 'science_fiction', 'nonfiction', 'other'])
let resend: Resend | null = null
const getResend = () => resend ||= new Resend(process.env.RESEND_API_KEY!)

const text = (value: unknown, max = 250) => typeof value === 'string' ? value.trim().slice(0, max) || null : null
const validEmail = (value: unknown) => typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())

export async function POST(request: NextRequest) {
  const configuredSecret = process.env.SCORECARD_LEAD_SECRET
  const suppliedSecret = request.headers.get('x-booklingua-lead-secret')
  if (!configuredSecret || suppliedSecret !== configuredSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    if (!validEmail(body.email)) return NextResponse.json({ error: 'A valid email is required' }, { status: 400 })

    const email = body.email.trim().toLowerCase()
    const now = new Date().toISOString()
    const genre = GENRES.has(body.genre) ? body.genre : 'other'
    const marketingConsent = body.marketingConsent === true
    const db = getSupabaseAdmin()

    const { data: existing, error: lookupError } = await db
      .from('scorecard_leads')
      .select('id, submission_count, marketing_consent, email_status')
      .ilike('email', email)
      .maybeSingle()
    if (lookupError) throw lookupError

    const shared = {
      email,
      full_name: text(body.fullName),
      genre,
      source: text(body.source) || 'meta_instant_form',
      marketing_consent: Boolean(existing?.marketing_consent || marketingConsent),
      marketing_consented_at: existing?.marketing_consent ? undefined : marketingConsent ? now : null,
      meta_lead_id: text(body.metaLeadId),
      meta_form_id: text(body.metaFormId),
      meta_campaign_id: text(body.metaCampaignId),
      meta_adset_id: text(body.metaAdsetId),
      meta_ad_id: text(body.metaAdId),
      utm_source: text(body.utmSource) || 'meta',
      utm_medium: text(body.utmMedium) || 'paid_social',
      utm_campaign: text(body.utmCampaign) || 'language_scorecard',
      utm_content: text(body.utmContent),
      last_submitted_at: now,
      updated_at: now,
    }

    let leadId: string
    if (existing) {
      const { data, error } = await db.from('scorecard_leads').update({
        ...shared,
        submission_count: Number(existing.submission_count || 1) + 1,
        email_status: 'pending',
      }).eq('id', existing.id).select('id').single()
      if (error) throw error
      leadId = data.id
    } else {
      const { data, error } = await db.from('scorecard_leads').insert({
        ...shared,
        first_submitted_at: now,
      }).select('id').single()
      if (error) throw error
      leadId = data.id
    }

    if (marketingConsent) {
      const { error } = await db.from('email_subscribers').upsert(
        { email, source: 'language_scorecard', subscribed_at: now },
        { onConflict: 'email' },
      )
      if (error) console.error('Scorecard marketing consent save failed:', error)
    }

    const firstName = text(body.fullName)?.split(/\s+/)[0]
    const greeting = firstName ? `Hi ${firstName},` : 'Hello,'
    const { data: sent, error: emailError } = await getResend().emails.send({
      from: 'BookLingua <hello@booklingua.io>',
      to: email,
      subject: 'Your free BookLingua language scorecard',
      html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#272136;line-height:1.6">
        <p>${greeting}</p>
        <h1 style="color:#4a3f6b">Which language should you translate your book into first?</h1>
        <p>Your free three-minute market-match scorecard is ready.</p>
        <p><a href="${SCORECARD_URL}?utm_source=scorecard_email&utm_medium=email&utm_campaign=language_scorecard" style="display:inline-block;background:#4a3f6b;color:white;padding:14px 22px;border-radius:10px;text-decoration:none;font-weight:bold">Open your scorecard →</a></p>
        <p>It compares German, Spanish, French, Italian and Portuguese using your genre, existing reader signals and launch readiness.</p>
        <p style="font-size:13px;color:#6b7280">You received this service email because you requested the BookLingua scorecard through our Meta form. ${marketingConsent ? 'You also opted in to BookLingua news and translation tips.' : 'You were not added to our marketing list.'}</p>
      </div>`,
    })
    if (emailError) {
      await db.from('scorecard_leads').update({ email_status: 'failed', updated_at: now }).eq('id', leadId)
      throw emailError
    }
    await db.from('scorecard_leads').update({
      email_status: 'sent', email_sent_at: now, provider_message_id: sent?.id || null, updated_at: now,
    }).eq('id', leadId)

    return NextResponse.json({ success: true, duplicate: Boolean(existing), leadId })
  } catch (error) {
    console.error('Scorecard lead capture failed:', error)
    return NextResponse.json({ error: 'Could not process this scorecard request' }, { status: 500 })
  }
}

