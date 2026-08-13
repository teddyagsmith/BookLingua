import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'

let resend: Resend | null = null
function getResend() {
  if (!resend) {
    resend = new Resend(process.env.RESEND_API_KEY!)
  }
  return resend
}

/**
 * Send email from BookLingua
 * POST /api/send-email
 * {
 *   to: string | string[],
 *   subject: string,
 *   html: string,
 *   from?: string, // defaults to hello@booklingua.io
 *   replyTo?: string
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const { to, subject, html, from, replyTo } = await req.json()

    if (!to || !subject || !html) {
      return NextResponse.json(
        { error: 'Missing required fields: to, subject, html' },
        { status: 400 }
      )
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    const recipients = Array.isArray(to) ? to : [to]
    
    for (const email of recipients) {
      if (!emailRegex.test(email)) {
        return NextResponse.json(
          { error: `Invalid email: ${email}` },
          { status: 400 }
        )
      }
    }

    const { data, error } = await getResend().emails.send({
      from: from || 'BookLingua <hello@booklingua.io>',
      to: recipients,
      subject,
      html,
      replyTo: replyTo || 'hello@booklingua.io',
    })

    if (error) {
      console.error('Resend error:', error)
      return NextResponse.json(
        { error: 'Failed to send email', details: error },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      messageId: data?.id,
      recipients: recipients.length,
    })
  } catch (err) {
    console.error('Send email error:', err)
    return NextResponse.json(
      { error: 'Server error' },
      { status: 500 }
    )
  }
}

/**
 * Send to all subscribers
 * POST /api/send-email?broadcast=true
 * {
 *   subject: string,
 *   html: string,
 *   excludeRecent?: number // exclude subscribers from last N days (default 0)
 * }
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const broadcast = searchParams.get('broadcast')
  
  if (broadcast !== 'true') {
    return NextResponse.json(
      { error: 'Use POST to send emails. Add ?broadcast=true for subscriber list info.' },
      { status: 400 }
    )
  }

  // Return subscriber count for broadcast planning
  const { getSupabaseAdmin } = await import('@/lib/supabase')
  const supabaseAdmin = getSupabaseAdmin()
  
  const { count, error } = await supabaseAdmin
    .from('email_subscribers')
    .select('*', { count: 'exact', head: true })

  if (error) {
    return NextResponse.json(
      { error: 'Failed to fetch subscriber count' },
      { status: 500 }
    )
  }

  return NextResponse.json({
    subscriberCount: count || 0,
    note: 'Use POST with subscriber list to send broadcast'
  })
}
