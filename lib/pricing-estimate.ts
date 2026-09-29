import { CORE_LANGUAGES, CORE_LANGUAGE_CODES } from './languages'
import { calculateTranslationPrice } from './pricing'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const

export type EstimateRequest = {
  email: string
  wordCount: number
  languages: string[]
  marketingConsent: boolean
  source: string
  pageUrl: string | null
  referrer: string | null
  utm: Record<(typeof UTM_KEYS)[number], string | null>
}

const cleanText = (value: unknown, max = 500) => typeof value === 'string' ? value.trim().slice(0, max) || null : null

export function parseEstimateRequest(body: unknown): EstimateRequest | null {
  if (!body || typeof body !== 'object') return null
  const input = body as Record<string, unknown>
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : ''
  const wordCount = Number(input.wordCount)
  const languages = Array.isArray(input.languages) ? input.languages.filter((item): item is string => typeof item === 'string') : []
  if (!EMAIL_RE.test(email) || !Number.isInteger(wordCount) || wordCount < 1 || wordCount > 150_000) return null
  if (!languages.length || new Set(languages).size !== languages.length || languages.some(code => !CORE_LANGUAGE_CODES.has(code))) return null
  if (!calculateTranslationPrice(wordCount, languages.length)) return null

  const rawUtm = input.utm && typeof input.utm === 'object' ? input.utm as Record<string, unknown> : {}
  return {
    email,
    wordCount,
    languages,
    marketingConsent: input.marketingConsent === true,
    source: cleanText(input.source, 100) || 'pricing_calculator',
    pageUrl: cleanText(input.pageUrl, 1000),
    referrer: cleanText(input.referrer, 1000),
    utm: Object.fromEntries(UTM_KEYS.map(key => [key, cleanText(rawUtm[key], 250)])) as EstimateRequest['utm'],
  }
}

export function estimateDetails(request: EstimateRequest) {
  const price = calculateTranslationPrice(request.wordCount, request.languages.length)!
  const languageNames = request.languages.map(code => CORE_LANGUAGES.find(language => language.code === code)!.name)
  const startUrl = new URL('https://booklingua.io/')
  startUrl.searchParams.set('start', '1')
  startUrl.searchParams.set('estimateWords', String(request.wordCount))
  startUrl.searchParams.set('languages', request.languages.join(','))
  startUrl.searchParams.set('utm_source', 'estimate_email')
  startUrl.searchParams.set('utm_medium', 'email')
  return { price, languageNames, startUrl: startUrl.toString() }
}

export function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]!)
}
