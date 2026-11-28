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
  if (/target explanatory addition absent|explanatory.note.*(absent|unrequested|contract)/i.test(raw)) return 'EXPLANATORY_NOTE_CONTRACT_FAILURE'
  if (/validation|artifact|package/i.test(raw)) return 'PACKAGE_VALIDATION_FAILURE'
  if (/timeout|timed out|deadline exceeded|function execution exceeded/i.test(raw)) return 'PIPELINE_TIMEOUT'
  if (/max_tokens|maximum tokens|output truncated|model_output_truncated/i.test(raw)) return 'MODEL_OUTPUT_TRUNCATED'
  if (/model_json_invalid|invalid json|unexpected end of json|json.*(invalid|truncated)/i.test(raw)) return 'MODEL_JSON_INVALID'
  return 'PIPELINE_EXECUTION_FAILURE'
}

/** Keep a useful operator diagnostic without persisting credentials or a stack. */
export function safePipelineErrorDetail(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error || 'Unknown pipeline failure')
  return raw.replace(/[\r\n\t]+/g, ' ')
    .replace(/((?:token|secret|api[_-]?key|authorization|password)\s*[=:]\s*)([^\s,;]+)/gi, '$1[REDACTED]')
    .replace(/\s+/g, ' ').trim().slice(0, 2000)
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

/**
 * The hosted RPC uses a deterministic terminal-event id. Older hosted copies
 * of that RPC keep the first row on conflict, leaving the dashboard with a
 * stale timestamp and reason after a retry. Refresh the durable terminal row
 * from the application too, so every terminal failure is observable even
 * before the database migration has caught up.
 */
export async function refreshTerminalFailureEvent(input: {
  supabase: SupabaseClient
  orderId: string
  stage: string
  safeMessage: string
  errorDetail: string
  failedAt: string
}): Promise<void> {
  const { data: event, error: lookupError } = await input.supabase.from('pipeline_events')
    .select('id')
    .eq('order_id', input.orderId)
    .eq('stage', input.stage)
    .eq('status', 'failed')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (lookupError || !event) throw new Error(`Terminal failure event lookup failed: ${lookupError?.message || 'no event recorded'}`)

  const { error: refreshError } = await input.supabase.from('pipeline_events').update({
    safe_message: input.safeMessage,
    details: { adminAlertRequired: true, failedAt: input.failedAt, errorDetail: input.errorDetail },
    created_at: input.failedAt,
  }).eq('id', event.id)
  if (refreshError) throw new Error(`Terminal failure event refresh failed: ${refreshError.message}`)
}

export async function recordTerminalFailure(input: {
  supabase: SupabaseClient
  orderId: string
  stage: string
  error: unknown
  language?: string | null
}): Promise<string> {
  const safeMessage = safePipelineError(input.error)
  const errorDetail = safePipelineErrorDetail(input.error)
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
    await refreshTerminalFailureEvent({
      supabase: input.supabase,
      orderId: input.orderId,
      stage: input.stage,
      safeMessage,
      errorDetail,
      failedAt,
    })
  } else {
    await recordPipelineEvent(input.supabase, {
      orderId: input.orderId, language: input.language, stage: input.stage,
      status: 'failed', level: 'error', safeMessage,
      details: { adminAlertRequired: true, failedAt, errorDetail },
    })
  }
  if (updateError) throw new Error(`Terminal failure state persistence failed: ${updateError.message}`)
  return safeMessage
}
