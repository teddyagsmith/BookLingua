import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { addGeneralSubscriber } from '@/lib/mailerlite'
import { getSupabaseAdmin } from '@/lib/supabase'

const DOWNLOAD_URL = 'https://booklingua.io/downloads/translated-book-launch-checklist.pdf'
let resend: Resend | null = null
const getResend = () => resend ||= new Resend(process.env.RESEND_API_KEY!)
const clean = (value: unknown, max = 250) => typeof value === 'string' ? value.trim().slice(0, max) || null : null
const validEmail = (value: unknown) => typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
}[character] || character))

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    if (clean(body.website)) return NextResponse.json({ success: true })
    if (!validEmail(body.email)) return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 })

    const email = body.email.trim().toLowerCase()
    const firstName = clean(body.firstName, 100)
    const marketingConsent = body.marketingConsent === true
    const attribution = [clean(body.utmSource), clean(body.utmMedium), clean(body.utmCampaign), clean(body.utmContent)].filter(Boolean).join(' / ')
    const now = new Date().toISOString()

    if (marketingConsent) {
      const { error } = await getSupabaseAdmin().from('email_subscribers').upsert({
        email,
        source: ['translated_book_launch_checklist', attribution].filter(Boolean).join(' | ').slice(0, 500),
        subscribed_at: now,
      }, { onConflict: 'email' })
      if (error) throw error

      try {
        await addGeneralSubscriber({
          email,
          source: 'Website – Translated-Book Launch Checklist',
          utmSource: attribution || clean(body.utmSource),
        })
      } catch (error) {
        console.error('MailerLite launch checklist sync failed:', error)
      }
    }

    const greeting = firstName ? `Hi ${escapeHtml(firstName)},` : 'Hello,'
    const { error: emailError } = await getResend().emails.send({
      from: 'BookLingua <hello@booklingua.io>',
      to: email,
      subject: 'Your translated-book launch checklist',
      html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#272136;line-height:1.6">
        <p>${greeting}</p>
        <h1 style="color:#4a3f6b">Your translated-book launch checklist is ready</h1>
        <p>Use it to track the essential steps between receiving your translated files and launching the finished edition.</p>
        <p><a href="${DOWNLOAD_URL}?utm_source=checklist_email&utm_medium=email&utm_campaign=translated_book_launch_checklist" style="display:inline-block;background:#4a3f6b;color:white;padding:14px 22px;border-radius:10px;text-decoration:none;font-weight:bold">Download your checklist →</a></p>
        <p>You’ll cover file checks, metadata, covers, keywords, categories, pricing, publishing and promotion.</p>
        <p style="font-size:13px;color:#6b7280">You received this service email because you requested the BookLingua checklist. ${marketingConsent ? 'You also opted in to BookLingua publishing tips.' : 'You were not added to our marketing list.'}</p>
      </div>`,
    })
    if (emailError) throw emailError

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Launch checklist lead capture failed:', error)
    return NextResponse.json({ error: 'We could not send the checklist. Please try again.' }, { status: 500 })
  }
}
