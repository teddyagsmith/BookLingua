import { timingSafeEqual } from 'crypto'

export function epubcheckWorkerAuthorized(header: string | null): boolean {
  const expected = process.env.EPUBCHECK_WORKER_TOKEN
  const received = header?.replace(/^Bearer\s+/i, '') || ''
  if (!expected || !received) return false
  const left = Buffer.from(expected)
  const right = Buffer.from(received)
  return left.length === right.length && timingSafeEqual(left, right)
}
