'use client'

import { FormEvent, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

const genres = [
  ['romance', 'Romance'],
  ['fantasy', 'Fantasy'],
  ['thriller_crime', 'Thriller / crime'],
  ['science_fiction', 'Science fiction'],
  ['nonfiction', 'Non-fiction'],
  ['other', 'Other'],
]

export default function ScorecardSignup() {
  const router = useRouter()
  const search = useSearchParams()
  const attribution = useMemo(() => ({
    utmSource: search.get('utm_source'),
    utmMedium: search.get('utm_medium'),
    utmCampaign: search.get('utm_campaign'),
    utmContent: search.get('utm_content'),
  }), [search])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError('')
    const form = new FormData(event.currentTarget)
    try {
      const response = await fetch('/api/scorecard-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: form.get('fullName'),
          email: form.get('email'),
          genre: form.get('genre'),
          website: form.get('website'),
          marketingConsent: form.get('marketingConsent') === 'on',
          ...attribution,
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Please try again.')
      router.push('/scorecard-sent')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Please try again.')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} className="rounded-3xl border border-stone-200 bg-white p-6 shadow-xl sm:p-8">
      <h2 className="font-serif text-3xl font-bold text-gray-900">Get the free scorecard</h2>
      <p className="mt-2 leading-7 text-gray-600">We’ll email it to you and open the download page immediately.</p>

      <label className="mt-6 block text-sm font-bold text-gray-800" htmlFor="fullName">First name</label>
      <input id="fullName" name="fullName" autoComplete="given-name" maxLength={100} className="mt-2 w-full rounded-xl border border-stone-300 px-4 py-3 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand-light" />

      <label className="mt-5 block text-sm font-bold text-gray-800" htmlFor="email">Email address</label>
      <input id="email" name="email" type="email" autoComplete="email" required maxLength={250} className="mt-2 w-full rounded-xl border border-stone-300 px-4 py-3 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand-light" />

      <label className="mt-5 block text-sm font-bold text-gray-800" htmlFor="genre">Your book’s genre</label>
      <select id="genre" name="genre" required defaultValue="" className="mt-2 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand-light">
        <option value="" disabled>Select a genre</option>
        {genres.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>

      <div className="absolute -left-[10000px]" aria-hidden="true">
        <label htmlFor="website">Website</label><input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      <label className="mt-6 flex items-start gap-3 rounded-xl bg-brand-light/50 p-4 text-sm leading-6 text-gray-700">
        <input name="marketingConsent" type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-violet-700" />
        <span>Yes, send me BookLingua’s foreign-market tips, language and launch guides, and occasional subscriber offers. I can unsubscribe at any time.</span>
      </label>

      {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
      <button disabled={loading} className="mt-6 w-full rounded-xl bg-brand px-6 py-4 text-base font-bold text-white shadow-lg transition hover:bg-brand-dark disabled:cursor-wait disabled:opacity-70">
        {loading ? 'Sending your scorecard…' : 'Email me the free scorecard →'}
      </button>
      <p className="mt-4 text-center text-xs leading-5 text-gray-500">No payment or manuscript upload required. Your details are handled according to our privacy policy.</p>
    </form>
  )
}
