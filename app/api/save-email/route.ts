import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

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
    const { error } = await supabaseAdmin
      .from('temp_uploads')
      .update({ email })
      .eq('session_id', sessionId)

    if (error) {
      console.error('save-email error:', error)
      return NextResponse.json({ error: 'Failed to save email' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('save-email error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
