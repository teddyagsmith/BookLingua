import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

const FOLLOW_UP_STATUSES = new Set(['new', 'contacted', 'qualified', 'converted', 'not_interested'])

export async function PATCH(request: NextRequest, { params }: { params: { leadId: string } }) {
  const auth = request.headers.get('x-admin-password')
  if (!auth || auth !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { followUpStatus } = await request.json()
    if (!FOLLOW_UP_STATUSES.has(followUpStatus)) {
      return NextResponse.json({ error: 'Invalid follow-up status' }, { status: 400 })
    }

    const { data, error } = await getSupabaseAdmin()
      .from('pricing_estimate_leads')
      .update({
        follow_up_status: followUpStatus,
        followed_up_at: followUpStatus === 'new' ? null : new Date().toISOString(),
      })
      .eq('id', params.leadId)
      .select('id, follow_up_status, followed_up_at')
      .single()

    if (error) throw error
    return NextResponse.json({ lead: data })
  } catch (error) {
    console.error('Pricing lead follow-up update failed:', error)
    return NextResponse.json({ error: 'Could not update this lead' }, { status: 500 })
  }
}
