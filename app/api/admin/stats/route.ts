import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  // Simple password auth via header
  const auth = request.headers.get('x-admin-password')
  if (!auth || auth !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Fetch all orders (most recent first, last 90 days)
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
    const { data: orders, error } = await supabaseAdmin
      .from('orders')
      .select('id, email, book_title, word_count, languages, tier, amount_paid, status, created_at, completed_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })

    if (error) throw error

    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
    const weekStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const stuckThreshold = new Date(Date.now() - 20 * 60 * 1000).toISOString()

    const todayOrders = orders?.filter(o => o.created_at >= todayStart) || []
    const weekOrders = orders?.filter(o => o.created_at >= weekStart) || []
    const completedOrders = orders?.filter(o => o.status === 'completed') || []
    const failedOrders = orders?.filter(o => o.status === 'failed') || []
    const stuckOrders = orders?.filter(o => 
      o.status === 'processing' && o.created_at <= stuckThreshold
    ) || []

    const todayRevenue = todayOrders.reduce((s, o) => s + Number(o.amount_paid || 0), 0)
    const weekRevenue = weekOrders.reduce((s, o) => s + Number(o.amount_paid || 0), 0)
    const totalRevenue = orders?.reduce((s, o) => s + Number(o.amount_paid || 0), 0) || 0

    const avgMargin = null // api_cost/margin_pct columns not yet migrated
    const totalApiCost = 0

    return NextResponse.json({
      orders: orders || [],
      stats: {
        todayRevenue,
        todayOrders: todayOrders.length,
        weekRevenue,
        weekOrders: weekOrders.length,
        totalRevenue,
        totalOrders: orders?.length || 0,
        completedOrders: completedOrders.length,
        failedOrders: failedOrders.length,
        avgMargin,
        totalApiCost,
        alerts: [...failedOrders, ...stuckOrders],
      },
    })
  } catch (err) {
    console.error('Admin stats error:', err)
    return NextResponse.json({ error: 'Failed to load stats' }, { status: 500 })
  }
}
