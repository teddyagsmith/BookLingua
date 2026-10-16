import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { addScorecardSubscriber } from '@/lib/mailerlite'
import { getSupabaseAdmin } from '@/lib/supabase'

const SCORECARD_URL = 'https://booklingua.io/scorecard'
const GENRES = new Set(['romance', 'fantasy', 'thriller_crime', 'science_fiction', 'nonfiction', 'other'])
let resend: Resend | null = null
const getResend = () => resend ||= new Resend(process.env.RESEND_API_KEY!)
const text = (value: unknown, max = 250) => typeof value === 'string' ? value.trim().slice(0, max) || null : null
const validEmail = (value: unknown) => typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
}[character] || character))

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
      await db.from('scorecard_leads').update({
        mailerlite_sync_status: 'synced',
        mailerlite_synced_at: now,
        mailerlite_sync_error: null,
        updated_at: now,
      }).eq('id', leadId)
    } catch (error) {
      // The requested resource must still be delivered if the MailerLite sync is temporarily unavailable.
      console.error('MailerLite scorecard sync failed:', error)
      await db.from('scorecard_leads').update({
        mailerlite_sync_status: 'failed',
        mailerlite_sync_error: error instanceof Error ? error.message.slice(0, 500) : 'Unknown sync error',
        updated_at: now,
      }).eq('id', leadId)
    }

    const firstName = fullName?.split(/\s+/)[0]
    const greeting = firstName ? `Hi ${escapeHtml(firstName)},` : 'Hello,'
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
        <p style="font-size:13px;color:#6b7280">You received this service email because you requested the BookLingua scorecard. ${marketingConsent ? 'You also opted in to BookLingua publishing tips and subscriber offers.' : 'You were not added to our marketing list.'}</p>
      </div>`,
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
