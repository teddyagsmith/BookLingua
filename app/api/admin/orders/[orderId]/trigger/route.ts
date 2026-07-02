import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { inngest } from '@/lib/inngest'

export async function POST(req: NextRequest, { params }: { params: { orderId: string } }) {
  const password = req.headers.get('x-admin-password')
  if (password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { orderId } = params

  const { data: order, error } = await getSupabaseAdmin()
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .single()

  if (error || !order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  // Trigger Inngest translation
  await inngest.send({
    name: 'book/translate.requested',
    data: {
      orderId: order.id,
      heatLevel: order.heat_level || null,
      bookSetting: order.book_setting || null,
    },
  })

  return NextResponse.json({ success: true, message: 'Translation triggered' })
}
