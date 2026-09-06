import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { effectiveOrderCost, summarizeAdminCosts } from '@/lib/admin-costs'

export async function GET(request: NextRequest) {
  // Simple password auth via header
  const auth = request.headers.get('x-admin-password')
  if (!auth || auth !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Fetch all orders (most recent first, last 90 days)
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
    const { data: orders, error } = await getSupabaseAdmin()
      .from('orders')
      .select('id, email, book_title, word_count, languages, tier, amount_paid, api_cost, margin_pct, status, created_at, completed_at, source_linked_at, failure_message')
      .gte('created_at', since)
      .order('created_at', { ascending: false })

    if (error) throw error
    const orderIds=(orders||[]).map(order=>order.id)
    const modelCalls:any[]=[]
    if(orderIds.length)for(let from=0;;from+=1000){
      const {data,error:modelCallsError}=await getSupabaseAdmin().from('model_call_events').select('order_id,success,estimated_cost_usd,created_at').in('order_id',orderIds).range(from,from+999)
      if(modelCallsError){console.error('Model cost query error:',modelCallsError);break}
      modelCalls.push(...(data||[]))
      if((data||[]).length<1000)break
    }
    const costSummary=summarizeAdminCosts(modelCalls)
    const {data:readerRequests}=orderIds.length
      ? await getSupabaseAdmin().from('reader_panel_requests').select('order_id,language,build_id,state,sample_filename,sample_word_count,email_state,requested_at,verdict_notes').in('order_id',orderIds)
      : {data:[] as any[]}
    const completedByEmail=new Map<string,Date>()
    for(const order of orders||[])if(order.status==='completed'){
      const date=new Date(order.completed_at||order.created_at),current=completedByEmail.get(order.email.toLowerCase())
      if(!current||date>current)completedByEmail.set(order.email.toLowerCase(),date)
    }
    const ordersWithReaderPanel=(orders||[]).map(order=>{
      const eventCost=costSummary.byOrder.get(order.id)
      const effective=effectiveOrderCost(order.api_cost,eventCost)
      const effectiveCost=effective.cost
      const newerCompleted=(completedByEmail.get(order.email.toLowerCase())?.getTime()||0)>new Date(order.created_at).getTime()
      const staleCheckout=['pending','processing'].includes(order.status)&&!order.source_linked_at&&Date.now()-new Date(order.created_at).getTime()>24*60*60*1000
      const inconsistentTerminal=['pending_review','processing'].includes(order.status)&&Boolean(order.completed_at)
      const supersededReview=['pending_review','ready_for_review'].includes(order.status)&&newerCompleted&&Boolean(order.failure_message)
      const oldSyntheticOrSupersededFailure=order.status==='failed'&&Date.now()-new Date(order.created_at).getTime()>7*24*60*60*1000&&(newerCompleted||order.email.endsWith('.invalid'))
      const admin_archived=staleCheckout||inconsistentTerminal||supersededReview||oldSyntheticOrSupersededFailure
      const effectiveMargin=order.margin_pct==null&&effectiveCost!=null&&Number(order.amount_paid)>0
        ? ((Number(order.amount_paid)-Number(effectiveCost))/Number(order.amount_paid))*100
        : order.margin_pct
      return{...order,api_cost:effectiveCost,margin_pct:effectiveMargin,api_cost_estimated:effective.estimated,admin_archived,reader_panel_requests:(readerRequests||[]).filter(row=>row.order_id===order.id)}
    })

    // Fetch abandoned uploads: temp_uploads older than 1 hour (still in checkout = not abandoned yet)
    const abandonedThreshold = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { data: abandonedUploads, error: abandonedError } = await getSupabaseAdmin()
      .from('temp_uploads')
      .select('session_id, file_name, file_format, word_count, created_at')
      .lte('created_at', abandonedThreshold)
      .order('created_at', { ascending: false })

    if (abandonedError) {
      console.error('Abandoned uploads query error:', abandonedError)
    }

    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
    const weekStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const stuckThreshold = new Date(Date.now() - 20 * 60 * 1000).toISOString()

    const visibleOrders=ordersWithReaderPanel.filter(o=>!o.admin_archived)
    const todayOrders = visibleOrders.filter(o => o.created_at >= todayStart)
    const weekOrders = visibleOrders.filter(o => o.created_at >= weekStart)
    const completedOrders = visibleOrders.filter(o => o.status === 'completed')
    const failedOrders = visibleOrders.filter(o => ['failed', 'qa_blocked', 'gate_failed'].includes(o.status))
    const pendingReviewOrders = visibleOrders.filter(o => ['pending_review', 'ready_for_review', 'reader_review_pending'].includes(o.status))
    const stuckOrders = visibleOrders.filter(o => 
      o.status === 'processing' && o.created_at <= stuckThreshold
    ) || []

    const todayRevenue = todayOrders.reduce((s, o) => s + Number(o.amount_paid || 0), 0)
    const weekRevenue = weekOrders.reduce((s, o) => s + Number(o.amount_paid || 0), 0)
    const totalRevenue = visibleOrders.reduce((s, o) => s + Number(o.amount_paid || 0), 0)

    const marginsWithData = completedOrders.filter(o => o.margin_pct != null)
    const avgMargin = marginsWithData.length > 0
      ? marginsWithData.reduce((s, o) => s + Number(o.margin_pct), 0) / marginsWithData.length
      : null
    const totalApiCost = visibleOrders.reduce((s, o) => s + Number(o.api_cost || 0), 0)

    return NextResponse.json({
      orders: ordersWithReaderPanel,
      abandonedUploads: abandonedUploads || [],
      stats: {
        todayRevenue,
        todayOrders: todayOrders.length,
        weekRevenue,
        weekOrders: weekOrders.length,
        totalRevenue,
        totalOrders: visibleOrders.length,
        completedOrders: completedOrders.length,
        failedOrders: failedOrders.length,
        pendingReview: pendingReviewOrders.length,
        avgMargin,
        totalApiCost,
        todayApiCost: costSummary.today,
        weekApiCost: costSummary.week,
        alerts: [...failedOrders, ...stuckOrders],
        abandonedCount: abandonedUploads?.length || 0,
      },
    })
  } catch (err) {
    console.error('Admin stats error:', err)
    return NextResponse.json({ error: 'Failed to load stats' }, { status: 500 })
  }
}
