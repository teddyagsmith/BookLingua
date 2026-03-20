import { createHmac } from 'crypto'

/**
 * Signs + builds a one-click feedback rating URL.
 */
export function buildFeedbackUrl(orderId: string, rating: number): string {
  const token = createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET!)
    .update(`feedback:${orderId}`)
    .digest('hex')
    .slice(0, 32)
  return `${process.env.NEXT_PUBLIC_APP_URL}/api/feedback?orderId=${orderId}&rating=${rating}&token=${token}`
}

/**
 * Signs a download token for a specific order + language.
 * Uses STRIPE_WEBHOOK_SECRET as the HMAC key (already available, strong secret).
 */
export function signDownloadToken(orderId: string, lang: string): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET!
  return createHmac('sha256', secret)
    .update(`${orderId}:${lang}`)
    .digest('hex')
}

/**
 * Validates a download token. Returns true if valid.
 */
export function verifyDownloadToken(orderId: string, lang: string, token: string): boolean {
  const expected = signDownloadToken(orderId, lang)
  // Constant-time comparison to prevent timing attacks
  if (expected.length !== token.length) return false
  let mismatch = 0
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ token.charCodeAt(i)
  }
  return mismatch === 0
}

/**
 * Builds a signed download URL.
 * type: 'review' (highlighted DOCX) | 'final' (clean, original format)
 */
export function buildDownloadUrl(orderId: string, lang: string, type: 'review' | 'final' = 'review'): string {
  const token = signDownloadToken(orderId, lang)
  return `${process.env.NEXT_PUBLIC_APP_URL}/api/download/${orderId}/${lang}?token=${token}&type=${type}`
}
