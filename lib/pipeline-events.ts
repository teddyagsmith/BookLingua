import { SupabaseClient } from '@supabase/supabase-js'
import { OrderStatus } from './order-status'

export type PipelineEventLevel = 'info' | 'warning' | 'error'

export interface PipelineEventInput {
  orderId: string
  language?: string | null
  stage: string
  status: OrderStatus | 'started' | 'passed' | 'failed'
  level?: PipelineEventLevel
  safeMessage?: string | null
  details?: Record<string, unknown>
}

export function safePipelineError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error || 'Unknown pipeline failure')
  return raw
    .replace(/(sk|key|token|secret|password)[=:]\s*[^\s,;]+/gi, '$1=[REDACTED]')
    .replace(/[\r\n\t]+/g, ' ')
    .slice(0, 500)
}

export async function recordPipelineEvent(
  supabase: SupabaseClient,
  input: PipelineEventInput,
): Promise<void> {
  const { error } = await supabase.from('pipeline_events').insert({
    order_id: input.orderId,
    language: input.language || null,
    stage: input.stage,
    status: input.status,
    level: input.level || 'info',
    safe_message: input.safeMessage || null,
    details: input.details || {},
  })
  if (error) console.error('[PipelineEvent] Unable to persist event:', error.message)
}

export async function recordTerminalFailure(input: {
  supabase: SupabaseClient
  orderId: string
  stage: string
  error: unknown
  language?: string | null
}): Promise<string> {
  const safeMessage = safePipelineError(input.error)
  const failedAt = new Date().toISOString()

  const { error: updateError } = await input.supabase.from('orders').update({
    status: 'failed',
    failed_stage: input.stage,
    failure_message: safeMessage,
    failed_at: failedAt,
    completed_at: null,
  }).eq('id', input.orderId)
  if (updateError) console.error('[PipelineFailure] Unable to mark order failed:', updateError.message)

  await recordPipelineEvent(input.supabase, {
    orderId: input.orderId,
    language: input.language,
    stage: input.stage,
    status: 'failed',
    level: 'error',
    safeMessage,
    details: { adminAlertRequired: true, failedAt },
  })
  return safeMessage
}
