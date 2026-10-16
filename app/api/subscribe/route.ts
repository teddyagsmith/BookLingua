import { NextRequest, NextResponse } from 'next/server'
import { addGeneralSubscriber } from '@/lib/mailerlite'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const { email, source, utmSource, utmMedium, utmCampaign, utmContent, website } = await req.json()

    // Honeypot: bots receive a harmless success response.
    if (typeof website === 'string' && website.trim()) {
      return NextResponse.json({ success: true })
    }

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email required' }, { status: 400 })
    }

    const normalised = email.toLowerCase().trim()
    const now = new Date().toISOString()
    const clean = (value: unknown, max = 250) => typeof value === 'string' ? value.trim().slice(0, max) || null : null

    // Newsletter submission is an explicit marketing opt-in. Supabase retains
    // the consent/attribution record; MailerLite manages the email relationship.
    const { error } = await getSupabaseAdmin()
      .from('email_subscribers')
      .upsert(
        {
          email: normalised,
          source: clean(source) || 'unknown',
          subscribed_at: now,
          marketing_consent: true,
          marketing_consented_at: now,
          utm_source: clean(utmSource),
          utm_medium: clean(utmMedium),
          utm_campaign: clean(utmCampaign),
          utm_content: clean(utmContent),
          mailerlite_sync_status: 'pending',
          updated_at: now,
        },
        { onConflict: 'email' }
      )

    if (error) {
      console.error('Subscribe error:', error)
      // If the table doesn't exist yet, return a soft error
      if (error.code === '42P01') {
        return NextResponse.json({ error: 'Subscription table not set up yet' }, { status: 500 })
      }
      return NextResponse.json({ error: 'Failed to subscribe' }, { status: 500 })
    }

    try {
      await addGeneralSubscriber({
        email: normalised,
        source: clean(source) || 'Website newsletter',
        utmSource: clean(utmSource),
      })
      await getSupabaseAdmin().from('email_subscribers').update({
        mailerlite_sync_status: 'synced',
        mailerlite_synced_at: now,
        mailerlite_sync_error: null,
        updated_at: now,
      }).eq('email', normalised)
      return NextResponse.json({ success: true, marketingSynced: true })
    } catch (syncError) {
      console.error('MailerLite general subscriber sync failed:', syncError)
      await getSupabaseAdmin().from('email_subscribers').update({
        mailerlite_sync_status: 'failed',
        mailerlite_sync_error: syncError instanceof Error ? syncError.message.slice(0, 500) : 'Unknown sync error',
        updated_at: now,
      }).eq('email', normalised)

      // The local consent record is safely stored. Reconciliation can retry
      // without asking the visitor to submit the form again.
      return NextResponse.json({ success: true, marketingSynced: false })
    }
  } catch (err) {
    console.error('Subscribe route error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
