import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(
  request: NextRequest,
  { params }: { params: { orderId: string } }
) {
  const auth = request.headers.get('x-admin-password')
  if (!auth || auth !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    await supabaseAdmin
      .from('orders')
      .update({ status: 'needs_review' })
      .eq('id', params.orderId)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Flag order error:', err)
    return NextResponse.json({ error: 'Failed to flag order' }, { status: 500 })
  }
}
