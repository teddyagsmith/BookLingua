import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const { email, source } = await req.json()

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email required' }, { status: 400 })
    }

    const normalised = email.toLowerCase().trim()

    // Upsert so duplicate emails don't throw
    const { error } = await supabaseAdmin
      .from('email_subscribers')
      .upsert(
        { email: normalised, source: source || 'unknown', subscribed_at: new Date().toISOString() },
        { onConflict: 'email', ignoreDuplicates: true }
      )

    if (error) {
      console.error('Subscribe error:', error)
      // If the table doesn't exist yet, return a soft error
      if (error.code === '42P01') {
        return NextResponse.json({ error: 'Subscription table not set up yet' }, { status: 500 })
      }
      return NextResponse.json({ error: 'Failed to subscribe' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Subscribe route error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
