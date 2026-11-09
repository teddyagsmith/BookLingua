'use client'

import { FormEvent, useState } from 'react'

const DOWNLOAD_URL = '/downloads/translated-book-launch-checklist.pdf'

export default function LaunchChecklistSignup() {
  const [loading, setLoading] = useState(false)
  const [complete, setComplete] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError('')
    const form = new FormData(event.currentTarget)
    const search = new URLSearchParams(window.location.search)

    try {
      const response = await fetch('/api/launch-checklist-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: form.get('firstName'),
          email: form.get('email'),
          website: form.get('website'),
          marketingConsent: form.get('marketingConsent') === 'on',
          utmSource: search.get('utm_source'),
          utmMedium: search.get('utm_medium'),
          utmCampaign: search.get('utm_campaign'),
          utmContent: search.get('utm_content'),
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Please try again.')

      const fbq = (window as Window & { fbq?: (...args: unknown[]) => void }).fbq
      fbq?.('track', 'Lead', { content_name: 'Translated-book launch checklist' })
      setComplete(true)
      window.location.assign(DOWNLOAD_URL)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (complete) {
    return (
      <aside className="not-prose my-10 rounded-3xl border border-brand-light bg-white p-6 text-center shadow-lg sm:p-8">
        <h2 className="font-serif text-3xl font-bold text-gray-900">Your checklist is ready</h2>
        <p className="mt-3 text-gray-600">The download should begin automatically. We’ve also emailed you a backup link.</p>
        <a href={DOWNLOAD_URL} download className="mt-6 inline-flex rounded-xl bg-brand px-6 py-3 font-bold text-white hover:bg-brand-dark">
          Download the checklist →
        </a>
      </aside>
    )
  }

  return (
    <aside className="not-prose my-10 rounded-3xl border border-brand-light bg-white p-6 shadow-lg sm:p-8">
      <div className="max-w-2xl">
        <p className="text-sm font-bold uppercase tracking-wider text-brand-dark">Free printable PDF</p>
        <h2 className="mt-2 font-serif text-3xl font-bold text-gray-900">Download the Translated-Book Launch Checklist</h2>
        <p className="mt-3 leading-7 text-gray-600">Keep every step in one place—from checking your files and localising your metadata to pricing, publishing and promotion.</p>
      </div>

      <form onSubmit={submit} className="mt-6 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-bold text-gray-800" htmlFor="launch-checklist-first-name">First name <span className="font-normal text-gray-500">(optional)</span></label>
          <input id="launch-checklist-first-name" name="firstName" autoComplete="given-name" maxLength={100} className="mt-2 w-full rounded-xl border border-stone-300 px-4 py-3 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand-light" />
        </div>
        <div>
          <label className="block text-sm font-bold text-gray-800" htmlFor="launch-checklist-email">Email address</label>
          <input id="launch-checklist-email" name="email" type="email" autoComplete="email" required maxLength={250} className="mt-2 w-full rounded-xl border border-stone-300 px-4 py-3 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand-light" />
        </div>

        <div className="absolute -left-[10000px]" aria-hidden="true">
          <label htmlFor="launch-checklist-website">Website</label>
          <input id="launch-checklist-website" name="website" tabIndex={-1} autoComplete="off" />
        </div>

        <label className="sm:col-span-2 flex items-start gap-3 rounded-xl bg-brand-light/50 p-4 text-sm leading-6 text-gray-700">
          <input name="marketingConsent" type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-violet-700" />
          <span>Yes, send me BookLingua’s practical translation and international book-launch tips. I can unsubscribe at any time.</span>
        </label>

        {error && <p role="alert" className="sm:col-span-2 rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
        <button disabled={loading} className="sm:col-span-2 rounded-xl bg-brand px-6 py-4 text-base font-bold text-white shadow-lg transition hover:bg-brand-dark disabled:cursor-wait disabled:opacity-70">
          {loading ? 'Preparing your checklist…' : 'Email me the free checklist →'}
        </button>
        <p className="sm:col-span-2 text-center text-xs leading-5 text-gray-500">The checklist email is sent whether or not you join the newsletter. See our privacy policy for details.</p>
      </form>
    </aside>
  )
}
