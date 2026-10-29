import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('the full-book Inngest route has enough runtime for semantic translation', () => {
  const route = readFileSync('app/api/inngest/route.ts', 'utf8')
  assert.match(route, /export const maxDuration = 800/)
})
