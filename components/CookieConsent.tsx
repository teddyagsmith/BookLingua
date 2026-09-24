'use client'

import Script from 'next/script'
import { useEffect, useState } from 'react'

type Consent = 'accepted' | 'essential' | null
const CONSENT_KEY = 'booklingua_cookie_consent_v1'
const GA_ID = 'G-WCQNKFL9ZH'

function disableOptionalTracking() {
  ;(window as typeof window & Record<string, boolean>)[`ga-disable-${GA_ID}`] = true
  document.cookie.split(';').forEach((item) => {
    const name = item.split('=')[0]?.trim()
    if (name === '_ga' || name?.startsWith('_ga_') || name?.startsWith('revshare_')) {
      document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax`
      document.cookie = `${name}=; Max-Age=0; path=/; domain=.booklingua.io; SameSite=Lax`
    }
  })
  Object.keys(window.localStorage).filter((key) => key.startsWith('revshare_')).forEach((key) => window.localStorage.removeItem(key))
}

export default function CookieConsent() {
  const [consent, setConsent] = useState<Consent>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const saved = window.localStorage.getItem(CONSENT_KEY)
    setConsent(saved === 'accepted' || saved === 'essential' ? saved : null)
    if (saved === 'essential') disableOptionalTracking()
    setReady(true)
    const openSettings = () => setConsent(null)
    window.addEventListener('booklingua:cookie-settings', openSettings)
    return () => window.removeEventListener('booklingua:cookie-settings', openSettings)
  }, [])

  const choose = (value: Exclude<Consent, null>) => {
    window.localStorage.setItem(CONSENT_KEY, value)
    if (value === 'essential') disableOptionalTracking()
    else (window as typeof window & Record<string, boolean>)[`ga-disable-${GA_ID}`] = false
    setConsent(value)
  }

  return (
    <>
      {consent === 'accepted' && (
        <>
          <Script src="https://www.revshare.so/tracking.js" strategy="afterInteractive" data-program-id="6a5a0eae6e5359ccacaa24b1" data-domain=".booklingua.io" data-cookie-duration="30" />
          <Script src="https://www.googletagmanager.com/gtag/js?id=G-WCQNKFL9ZH" strategy="afterInteractive" />
          <Script id="google-analytics" strategy="afterInteractive">{`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-WCQNKFL9ZH', { anonymize_ip: true });
          `}</Script>
        </>
      )}
      {ready && consent === null && (
        <div role="dialog" aria-label="Cookie preferences" className="fixed inset-x-4 bottom-4 z-[100] mx-auto max-w-3xl rounded-2xl border border-brand-light bg-white p-5 shadow-2xl sm:p-6">
          <h2 className="text-lg font-bold text-[#17233C]">Your cookie choices</h2>
          <p className="mt-2 text-sm leading-6 text-gray-600">We use optional analytics cookies to understand site use and affiliate cookies to credit referrals. You can accept them or continue with essential storage only.</p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => choose('essential')} className="rounded-full border border-brand/30 px-5 py-2.5 text-sm font-semibold text-brand-dark hover:bg-brand-light/40">Essential only</button>
            <button type="button" onClick={() => choose('accepted')} className="rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90">Accept optional cookies</button>
          </div>
          <a href="/cookies" className="mt-3 inline-block text-xs font-semibold text-brand-dark underline underline-offset-2">Read our Cookie Policy</a>
        </div>
      )}
    </>
  )
}
