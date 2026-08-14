import { createHmac, timingSafeEqual } from 'crypto'

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
 * Returns a short base64url token (22 chars) that won't trigger WAF rules.
 * Uses STRIPE_WEBHOOK_SECRET as the HMAC key.
 */
export function signDownloadToken(orderId: string, lang: string): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET!
  return createHmac('sha256', secret)
    .update(`${orderId}:${lang}`)
    .digest('base64url')
    .slice(0, 22)
}

/**
 * Validates a download token. Returns true if valid.
 * Accepts both the new short base64url tokens (22 chars)
 * and old long hex tokens (64 chars) for backward compatibility.
 */
export function verifyDownloadToken(orderId: string, lang: string, token: string): boolean {
  const secret = process.env.STRIPE_WEBHOOK_SECRET!
  const hmac = createHmac('sha256', secret).update(`${orderId}:${lang}`)

  if (token.length === 22) {
    // New format: short base64url
    const expected = hmac.digest('base64url').slice(0, 22)
    if (expected.length !== token.length) return false
    let mismatch = 0
    for (let i = 0; i < expected.length; i++) {
      mismatch |= expected.charCodeAt(i) ^ token.charCodeAt(i)
    }
    return mismatch === 0
  }

  if (token.length === 64) {
    // Legacy format: full hex (backward compat for already-sent emails)
    const expected = hmac.digest('hex')
    let mismatch = 0
    for (let i = 0; i < expected.length; i++) {
      mismatch |= expected.charCodeAt(i) ^ token.charCodeAt(i)
    }
    return mismatch === 0
  }

  return false
}

/**
 * Builds a signed download URL with a short token that won't trigger WAF.
 * type: 'review' (highlighted DOCX) | 'final' (clean, original format)
 */
export function buildDownloadUrl(orderId: string, lang: string, type: 'review' | 'final' = 'review'): string {
  const token = signDownloadToken(orderId, lang)
  return `${process.env.NEXT_PUBLIC_APP_URL}/api/download/${orderId}/${lang}?token=${token}&type=${type}`
}

export function buildArtifactDownloadUrl(orderId: string, lang: string, artifact: string, appUrl = process.env.NEXT_PUBLIC_APP_URL!): string {
  const token = signDownloadToken(orderId, lang)
  return `${appUrl}/api/download/${orderId}/${lang}?token=${token}&artifact=${encodeURIComponent(artifact)}`
}

function scopedToken(material:string):string{
  const secret=process.env.STRIPE_WEBHOOK_SECRET
  if(!secret)throw new Error('Download signing secret is not configured')
  return createHmac('sha256',secret).update(material).digest('base64url').slice(0,32)
}

function verifyScopedToken(token:string,expected:string):boolean{
  if(token.length!==expected.length)return false
  return timingSafeEqual(Buffer.from(token),Buffer.from(expected))
}

export function signCustomerPortalToken(orderId:string):string{return scopedToken(`customer-portal:${orderId}`)}
export function verifyCustomerPortalToken(orderId:string,token:string):boolean{return verifyScopedToken(token,signCustomerPortalToken(orderId))}
export function signCustomerArtifactToken(orderId:string,lang:string,artifact:string):string{return scopedToken(`customer-artifact:${orderId}:${lang}:${artifact}`)}
export function verifyCustomerArtifactToken(orderId:string,lang:string,artifact:string,token:string):boolean{return verifyScopedToken(token,signCustomerArtifactToken(orderId,lang,artifact))}
export function buildCustomerPortalUrl(orderId:string,origin:string):string{return `${origin}/download/${orderId}?token=${signCustomerPortalToken(orderId)}`}
export function buildCustomerArtifactDownloadUrl(orderId:string,lang:string,artifact:string,origin:string):string{return `${origin}/api/download/${orderId}/${lang}?scope=customer&artifact=${encodeURIComponent(artifact)}&token=${signCustomerArtifactToken(orderId,lang,artifact)}`}
