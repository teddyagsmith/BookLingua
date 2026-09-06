import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { effectiveOrderCost, summarizeAdminCosts } from '../lib/admin-costs'

describe('admin API cost accounting', () => {
  it('counts every successful paid call by usage date, including retranslations', () => {
    const result = summarizeAdminCosts([
      { order_id: 'order-1', success: true, estimated_cost_usd: 13.14, created_at: '2026-09-01T10:00:00Z' },
      { order_id: 'order-1', success: true, estimated_cost_usd: 14.19, created_at: '2026-09-05T12:00:00Z' },
      { order_id: 'order-1', success: false, estimated_cost_usd: 9, created_at: '2026-09-05T13:00:00Z' },
    ], new Date('2026-09-05T15:00:00Z'))
    assert.ok(Math.abs((result.byOrder.get('order-1') || 0) - 27.33) < 0.00001)
    assert.ok(Math.abs(result.today - 14.19) < 0.00001)
    assert.ok(Math.abs(result.week - 27.33) < 0.00001)
  })

  it('uses cumulative telemetry when a rebuild exceeds the stored last-run cost', () => {
    assert.deepEqual(effectiveOrderCost(14.19, 27.33), { cost: 27.33, estimated: true })
    assert.deepEqual(effectiveOrderCost(30, 27.33), { cost: 30, estimated: false })
  })
})
