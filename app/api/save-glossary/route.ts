import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { sessionId, decisions } = body

    if (!sessionId || !Array.isArray(decisions)) {
      return NextResponse.json({ error: 'sessionId and decisions array required' }, { status: 400 })
    }

    const { error } = await getSupabaseAdmin()
      .from('temp_uploads')
      .update({ glossary_decisions: JSON.stringify(decisions) })
      .eq('session_id', sessionId)

    if (error) {
      console.error('[save-glossary] Failed to save decisions:', error)
      return NextResponse.json({ error: 'Failed to save decisions' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Save glossary error:', error)
    return NextResponse.json({ error: 'Save failed' }, { status: 500 })
  }
}
