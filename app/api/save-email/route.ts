import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const { email, sessionId } = await request.json()

    if (!email || !sessionId) {
      return NextResponse.json({ error: 'Missing email or sessionId' }, { status: 400 })
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
    }

    // Save email to temp_uploads row for this session
    // NOTE: temp_uploads table needs an 'email' column for this to work
    const { error } = await getSupabaseAdmin()
      .from('temp_uploads')
      .update({ email })
      .eq('session_id', sessionId)

    if (error) {
      // If column doesn't exist, log but don't fail the request
      if (error.message?.includes('column') && error.message?.includes('email')) {
        console.warn('[save-email] temp_uploads.email column does not exist — run: ALTER TABLE temp_uploads ADD COLUMN email TEXT;')
        return NextResponse.json({ success: true, warning: 'Email column missing in database' })
      }
      console.error('save-email error:', error)
      return NextResponse.json({ error: 'Failed to save email' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('save-email error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
