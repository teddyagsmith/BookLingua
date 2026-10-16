import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { addScorecardSubscriber } from '@/lib/mailerlite'
import { getSupabaseAdmin } from '@/lib/supabase'
import { scorecardEmailHtml } from '@/lib/emails/scorecard'

const GENRES = new Set(['romance', 'fantasy', 'thriller_crime', 'science_fiction', 'nonfiction', 'other'])
let resend: Resend | null = null
const getResend = () => resend ||= new Resend(process.env.RESEND_API_KEY!)
const text = (value: unknown, max = 250) => typeof value === 'string' ? value.trim().slice(0, max) || null : null
const validEmail = (value: unknown) => typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    // Quietly accept bot submissions without storing or emailing them.
    if (text(body.website)) return NextResponse.json({ success: true })
    if (!validEmail(body.email)) return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 })

    const email = body.email.trim().toLowerCase()
    const fullName = text(body.fullName)
    const genre = GENRES.has(body.genre) ? body.genre : 'other'
    const marketingConsent = body.marketingConsent === true
    const now = new Date().toISOString()
    const db = getSupabaseAdmin()

    const { data: existing, error: lookupError } = await db
      .from('scorecard_leads')
      .select('id, submission_count, marketing_consent')
      .ilike('email', email)
      .maybeSingle()
    if (lookupError) throw lookupError

    const shared = {
      email,
      full_name: fullName,
      genre,
      source: 'website_scorecard',
      marketing_consent: Boolean(existing?.marketing_consent || marketingConsent),
      marketing_consented_at: existing?.marketing_consent ? undefined : marketingConsent ? now : null,
      utm_source: text(body.utmSource) || 'direct',
      utm_medium: text(body.utmMedium) || 'website',
      utm_campaign: text(body.utmCampaign) || 'language_scorecard',
      utm_content: text(body.utmContent),
      last_submitted_at: now,
      updated_at: now,
      email_status: 'pending',
    }

    let leadId: string
    if (existing) {
      const { data, error } = await db.from('scorecard_leads').update({
        ...shared,
        submission_count: Number(existing.submission_count || 1) + 1,
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

    let marketingSynced = false
    try {
      await addScorecardSubscriber({
        email,
        name: fullName,
        genre,
        source: 'Website – Language Scorecard',
        marketingConsent: Boolean(existing?.marketing_consent || marketingConsent),
        utmSource: text(body.utmSource) || 'direct',
      })
      marketingSynced = true
    } catch (error) {
      // The requested resource must still be delivered if the MailerLite sync is temporarily unavailable.
      console.error('MailerLite scorecard sync failed:', error)
    }

    const firstName = fullName?.split(/\s+/)[0]
    const { data: sent, error: emailError } = await getResend().emails.send({
      from: 'BookLingua <hello@booklingua.io>',
      to: email,
      subject: 'Your free BookLingua language scorecard',
      html: scorecardEmailHtml(firstName, marketingConsent),
    })
    if (emailError) {
      await db.from('scorecard_leads').update({ email_status: 'failed', updated_at: now }).eq('id', leadId)
      throw emailError
    }

    await db.from('scorecard_leads').update({
      email_status: 'sent', email_sent_at: now, provider_message_id: sent?.id || null, updated_at: now,
    }).eq('id', leadId)

    return NextResponse.json({ success: true, marketingSynced })
  } catch (error) {
    console.error('Website scorecard lead capture failed:', error)
    return NextResponse.json({ error: 'We could not send the scorecard. Please try again.' }, { status: 500 })
  }
}
