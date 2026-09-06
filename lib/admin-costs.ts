export type AdminCostEvent = {
  order_id: string
  success: boolean
  estimated_cost_usd: number | string | null
  created_at: string
}

export function summarizeAdminCosts(events: AdminCostEvent[], now = new Date()) {
  const byOrder = new Map<string, number>()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const weekStart = now.getTime() - 7 * 24 * 60 * 60 * 1000
  let today = 0
  let week = 0

  for (const event of events) {
    if (!event.success || event.estimated_cost_usd == null) continue
    const cost = Number(event.estimated_cost_usd)
    if (!Number.isFinite(cost)) continue
    byOrder.set(event.order_id, (byOrder.get(event.order_id) || 0) + cost)
    const occurredAt = new Date(event.created_at).getTime()
    if (occurredAt >= weekStart) week += cost
    if (occurredAt >= todayStart) today += cost
  }

  return { byOrder, today, week }
}

export function effectiveOrderCost(storedCost: number | string | null, telemetryCost?: number) {
  const stored = storedCost == null ? null : Number(storedCost)
  if (telemetryCost == null) return { cost: stored, estimated: false }
  if (stored == null || telemetryCost > stored) return { cost: Number(telemetryCost.toFixed(4)), estimated: true }
  return { cost: stored, estimated: false }
}
