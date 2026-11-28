import test from 'node:test'
import assert from 'node:assert/strict'
import { BLOCKED_ORDER_STATUSES, isOrderStatus } from '../lib/order-status'
import { refreshTerminalFailureEvent, safePipelineError, safePipelineErrorDetail } from '../lib/pipeline-events'

test('qa and gate failures are represented as blocked order states', () => {
  assert.equal(isOrderStatus('qa_blocked'), true)
  assert.equal(isOrderStatus('gate_failed'), true)
  assert.equal(BLOCKED_ORDER_STATUSES.has('qa_blocked'), true)
  assert.equal(BLOCKED_ORDER_STATUSES.has('gate_failed'), true)
})

test('safe failure messages are concise and redact inline credentials', () => {
  const message = safePipelineError(new Error('request failed token=super-secret-value\nstack detail'))
  assert.equal(message.includes('super-secret-value'), false)
  assert.equal(message.includes('\n'), false)
  assert.ok(message.length <= 500)
})

test('terminal diagnostics retain actionable error text but redact credentials', () => {
  const detail = safePipelineErrorDetail(new Error('Notes validation failed token=super-secret-value\nwith useful context'))
  assert.match(detail, /Notes validation failed/)
  assert.match(detail, /useful context/)
  assert.doesNotMatch(detail, /super-secret-value/)
  assert.doesNotMatch(detail, /\n/)
})

test('timeouts and model truncation retain actionable safe causes', () => {
  assert.equal(safePipelineError(new Error('Function execution exceeded its timeout')), 'PIPELINE_TIMEOUT')
  assert.equal(safePipelineError(new Error('MODEL_OUTPUT_TRUNCATED: provider stopped at max_tokens')), 'MODEL_OUTPUT_TRUNCATED')
  assert.equal(safePipelineError(new SyntaxError('Unexpected end of JSON input')), 'MODEL_JSON_INVALID')
})

test('terminal failure refresh replaces the stale event timestamp and reason', async () => {
  const calls: Array<{ table: string; action: string; value?: unknown }> = []
  const supabase: any = {
    from(table: string) {
      return {
        select() { calls.push({ table, action: 'select' }); return this },
        eq() { return this },
        order() { return this },
        limit() { return this },
        maybeSingle: async () => ({ data: { id: 'terminal-event' }, error: null }),
        update(value: unknown) { calls.push({ table, action: 'update', value }); return this },
      }
    },
  }
  await refreshTerminalFailureEvent({
    supabase,
    orderId: 'order',
    stage: 'translation_job',
    safeMessage: 'PIPELINE_EXECUTION_FAILURE',
    errorDetail: 'Translation Notes validation failed: useful context',
    failedAt: '2026-11-27T18:02:00.000Z',
  })
  assert.deepEqual(calls.find(call => call.action === 'update'), {
    table: 'pipeline_events', action: 'update', value: {
      safe_message: 'PIPELINE_EXECUTION_FAILURE',
      details: { adminAlertRequired: true, failedAt: '2026-11-27T18:02:00.000Z', errorDetail: 'Translation Notes validation failed: useful context' },
      created_at: '2026-11-27T18:02:00.000Z',
    },
  })
})
