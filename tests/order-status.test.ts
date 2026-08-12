import test from 'node:test'
import assert from 'node:assert/strict'
import { BLOCKED_ORDER_STATUSES, isOrderStatus } from '../lib/order-status'
import { safePipelineError } from '../lib/pipeline-events'

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
