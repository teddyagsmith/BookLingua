import { SupabaseClient } from '@supabase/supabase-js'
import { OrderStatus } from './order-status'
import { HARDENED_V1_ENABLED } from './pipeline-capabilities'

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
  if (/brief.*(missing|mismatch|approved|source)/i.test(raw)) return 'TRANSLATION_BRIEF_INVALID'
  if (/source.*(missing|hash|retrieve|binary)/i.test(raw)) return 'SOURCE_INTEGRITY_FAILURE'
  if (/quality gate|refusal|too short/i.test(raw)) return 'TRANSLATION_QUALITY_FAILURE'
  if (/validation|artifact|package/i.test(raw)) return 'PACKAGE_VALIDATION_FAILURE'
  if (/timeout|timed out/i.test(raw)) return 'PROVIDER_TIMEOUT'
  return 'PIPELINE_EXECUTION_FAILURE'
}

export async function recordPipelineEvent(
  supabase: SupabaseClient,
  input: PipelineEventInput,
): Promise<void> {
  if (!HARDENED_V1_ENABLED) return
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

  const failureUpdate = HARDENED_V1_ENABLED ? {
    status: 'failed',
    failed_stage: input.stage,
    failure_message: safeMessage,
    failed_at: failedAt,
    completed_at: null,
  } : { status: 'failed', completed_at: null }
  const { error: updateError } = await input.supabase.from('orders').update(failureUpdate).eq('id', input.orderId)

  if (HARDENED_V1_ENABLED) {
    const { error: cleanupError } = await input.supabase.rpc('fail_active_order_builds', {
      p_order_id: input.orderId, p_stage: input.stage, p_safe_error: safeMessage, p_failed_at: failedAt,
    })
    if (cleanupError) throw new Error(`Terminal build cleanup/audit failed: ${cleanupError.message}`)
  } else {
    await recordPipelineEvent(input.supabase, {
      orderId: input.orderId, language: input.language, stage: input.stage,
      status: 'failed', level: 'error', safeMessage,
      details: { adminAlertRequired: true, failedAt },
    })
  }
  if (updateError) throw new Error(`Terminal failure state persistence failed: ${updateError.message}`)
  return safeMessage
}
