export const ORDER_STATUSES = [
  'pending',
  'processing',
  'pending_review',
  'completed',
  'failed',
  'needs_review',
  'qa_blocked',
  'gate_failed',
  'ready_for_review',
  'delivery_pending',
] as const

export type OrderStatus = typeof ORDER_STATUSES[number]

export const BLOCKED_ORDER_STATUSES: ReadonlySet<OrderStatus> = new Set<OrderStatus>([
  'failed',
  'qa_blocked',
  'gate_failed',
])

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === 'string' && (ORDER_STATUSES as readonly string[]).includes(value)
}
