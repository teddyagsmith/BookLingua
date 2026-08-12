import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { verifyUploadIdentity } from '@/lib/upload-identity'
import { HARDENED_V1_ENABLED } from '@/lib/pipeline-capabilities'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { sessionId, uploadToken, decisions } = body

    if (!sessionId || !Array.isArray(decisions)) {
      return NextResponse.json({ error: 'sessionId and decisions array required' }, { status: 400 })
    }
    if (HARDENED_V1_ENABLED && !verifyUploadIdentity(sessionId, uploadToken)) return NextResponse.json({ error: 'Invalid upload identity' }, { status: 403 })

    const update = HARDENED_V1_ENABLED ? {
      glossary_decisions: decisions,
      glossary_saved_at: new Date().toISOString(),
    } : { glossary_decisions: JSON.stringify(decisions) }
    const { error } = await getSupabaseAdmin()
      .from('temp_uploads')
      .update(update)
      .eq('session_id', sessionId)
      .select('session_id')
      .maybeSingle()

    if (error) {
      console.error('[save-glossary] Failed to save decisions:', error)
      return NextResponse.json({ error: 'Failed to save decisions' }, { status: 500 })
    }

    if (!HARDENED_V1_ENABLED) return NextResponse.json({ success: true, mode: 'legacy' })
    const { data: saved } = await getSupabaseAdmin()
      .from('temp_uploads')
      .select('glossary_saved_at')
      .eq('session_id', sessionId)
      .maybeSingle()
    if (!saved?.glossary_saved_at) {
      return NextResponse.json({ error: 'Upload session not found; decisions were not saved' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Save glossary error:', error)
    return NextResponse.json({ error: 'Save failed' }, { status: 500 })
  }
}
