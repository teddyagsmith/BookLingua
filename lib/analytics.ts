export function trackEvent(name: string, parameters: Record<string, string | number | boolean> = {}) {
  if (typeof window === 'undefined') return
  const gtag = (window as Window & { gtag?: (...args: unknown[]) => void }).gtag
  gtag?.('event', name, parameters)
}

export function trackMetaEvent(name: string, parameters: Record<string, string | number | boolean> = {}, eventId?: string) {
  if (typeof window === 'undefined') return
  const fbq = (window as Window & { fbq?: (...args: unknown[]) => void }).fbq
  if (!fbq) return
  if (eventId) fbq('track', name, parameters, { eventID: eventId })
  else fbq('track', name, parameters)
}

export function trackMetaCustomEvent(name: string, parameters: Record<string, string | number | boolean> = {}) {
  if (typeof window === 'undefined') return
  const fbq = (window as Window & { fbq?: (...args: unknown[]) => void }).fbq
  fbq?.('trackCustom', name, parameters)
}
