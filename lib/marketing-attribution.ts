export const ATTRIBUTION_STORAGE_KEY = 'booklingua_marketing_attribution_v1'

export const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const

export type MarketingAttribution = {
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_term: string | null
  utm_content: string | null
  fbclid: string | null
  landing_page: string | null
  referrer: string | null
  captured_at: string | null
}

const clean = (value: unknown, max = 1000) => typeof value === 'string' ? value.trim().slice(0, max) || null : null

export function sanitizeAttribution(value: unknown): MarketingAttribution {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  return {
    utm_source: clean(input.utm_source, 250),
    utm_medium: clean(input.utm_medium, 250),
    utm_campaign: clean(input.utm_campaign, 250),
    utm_term: clean(input.utm_term, 250),
    utm_content: clean(input.utm_content, 250),
    fbclid: clean(input.fbclid, 500),
    landing_page: clean(input.landing_page, 1000),
    referrer: clean(input.referrer, 1000),
    captured_at: clean(input.captured_at, 50),
  }
}

export function hasCampaignAttribution(value: MarketingAttribution) {
  return Boolean(value.fbclid || UTM_KEYS.some(key => value[key]))
}

export function attributionFromLocation(url: string, referrer: string, capturedAt = new Date().toISOString()): MarketingAttribution {
  const parsed = new URL(url)
  return sanitizeAttribution({
    ...Object.fromEntries(UTM_KEYS.map(key => [key, parsed.searchParams.get(key)])),
    fbclid: parsed.searchParams.get('fbclid'),
    landing_page: parsed.toString(),
    referrer,
    captured_at: capturedAt,
  })
}

export function captureFirstTouchAttribution(): MarketingAttribution {
  if (typeof window === 'undefined') return sanitizeAttribution(null)
  const current = attributionFromLocation(window.location.href, document.referrer || '')
  let stored = sanitizeAttribution(null)
  try {
    stored = sanitizeAttribution(JSON.parse(window.localStorage.getItem(ATTRIBUTION_STORAGE_KEY) || 'null'))
  } catch {
    // Ignore malformed or unavailable browser storage and recapture safely.
  }

  // Preserve the first attributable visit. A tagged visit may replace an older
  // direct visit, but later campaigns cannot overwrite an established source.
  const selected = hasCampaignAttribution(stored) ? stored : hasCampaignAttribution(current) ? current : stored.captured_at ? stored : current
  try { window.localStorage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(selected)) } catch {}
  return selected
}

