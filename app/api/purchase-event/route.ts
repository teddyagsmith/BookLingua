import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getSupabaseAdmin } from '@/lib/supabase'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' })

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get('session_id')
  const orderId = request.nextUrl.searchParams.get('order_id')
  try {
    if (sessionId === 'FREE' && orderId) {
      const { data } = await getSupabaseAdmin().from('orders').select('id, amount_paid').eq('id', orderId).maybeSingle()
      if (!data) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
      return NextResponse.json({ eventId: `purchase-${data.id}`, value: Number(data.amount_paid), currency: 'USD' })
    }
    if (!sessionId?.startsWith('cs_')) return NextResponse.json({ error: 'Invalid checkout session' }, { status: 400 })
    const session = await stripe.checkout.sessions.retrieve(sessionId)
    if (session.payment_status !== 'paid') return NextResponse.json({ error: 'Payment is not complete' }, { status: 409 })
    return NextResponse.json({ eventId: `purchase-${session.id}`, value: Number(session.amount_total || 0) / 100, currency: (session.currency || 'usd').toUpperCase() })
  } catch (error) {
    console.error('Purchase event lookup failed:', error)
    return NextResponse.json({ error: 'Purchase could not be verified' }, { status: 500 })
  }
}
