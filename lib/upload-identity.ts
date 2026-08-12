import { createHmac, randomUUID, timingSafeEqual } from 'crypto'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function secret(): string {
  const value = process.env.STRIPE_WEBHOOK_SECRET
  if (!value) throw new Error('Upload identity secret is unavailable')
  return value
}

function signature(uploadId: string): string {
  return createHmac('sha256', secret()).update(`booklingua-upload:${uploadId}`).digest('base64url')
}

export function issueUploadIdentity(): { uploadId: string; uploadToken: string } {
  const uploadId = randomUUID()
  return { uploadId, uploadToken: signature(uploadId) }
}

export function verifyUploadIdentity(uploadId: unknown, token: unknown): uploadId is string {
  if (typeof uploadId !== 'string' || typeof token !== 'string' || !UUID.test(uploadId)) return false
  const expected = Buffer.from(signature(uploadId))
  const actual = Buffer.from(token)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}
