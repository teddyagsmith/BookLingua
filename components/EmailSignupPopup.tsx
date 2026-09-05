'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'

export default function EmailSignupPopup() {
  const [visible, setVisible] = useState(false)
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    // Do not interrupt visitors using a shared/direct pricing-calculator link.
    if (window.location.hash === '#pricing-calculator' || new URLSearchParams(window.location.search).has('pricingEstimate')) return
    // Don't show if already dismissed or subscribed
    const dismissed = sessionStorage.getItem('bl_popup_dismissed')
    if (dismissed) return

    // Show after 6 seconds
    const timer = setTimeout(() => setVisible(true), 6000)
    return () => clearTimeout(timer)
  }, [])

  const dismiss = () => {
    setVisible(false)
    sessionStorage.setItem('bl_popup_dismissed', '1')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source: 'popup' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setSubmitted(true)
      sessionStorage.setItem('bl_popup_dismissed', '1')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  if (!visible) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 transition-opacity"
        onClick={dismiss}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="relative bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close button */}
          <button
            onClick={dismiss}
            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all z-10"
            aria-label="Close"
          >
            ✕
          </button>

          {/* Header gradient strip */}
          <div className="bg-brand px-8 pt-8 pb-10">
            <div className="flex items-center gap-3 mb-4">
              <Image src="/logo.png" alt="BookLingua" width={36} height={36} className="object-contain" />
              <span className="text-white font-bold text-lg" style={{ fontFamily: "'EB Garamond', Georgia, serif" }}>
                BookLingua
              </span>
            </div>
            <h2
              className="text-2xl font-bold text-white mb-2 leading-snug"
              style={{ fontFamily: "'EB Garamond', Georgia, serif" }}
            >
              Reach readers in<br />6 new languages 🌍
            </h2>
            <p className="text-white/80 text-sm">
              Join 500+ indie authors publishing globally. Get tips on launching your book abroad — plus exclusive discounts.
            </p>
          </div>

          {/* Body */}
          <div className="px-8 py-6 -mt-4">
            <div className="bg-white rounded-2xl shadow-sm border border-brand-light p-4 mb-5">
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <span className="text-brand font-bold">✓</span>
                Tips for selling your book in foreign markets
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-700 mt-1.5">
                <span className="text-brand font-bold">✓</span>
                Language + launch guides for self-published authors
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-700 mt-1.5">
                <span className="text-brand font-bold">✓</span>
                Exclusive subscriber discounts (we never spam)
              </div>
            </div>

            {!submitted ? (
              <form onSubmit={handleSubmit}>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-brand focus:ring-2 focus:ring-brand-light outline-none mb-3 text-sm"
                />
                {error && <p className="text-red-500 text-xs mb-2">{error}</p>}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-brand text-white rounded-xl font-bold text-sm shadow-lg hover:shadow-xl transition-all disabled:opacity-60"
                >
                  {loading ? 'Subscribing…' : 'Subscribe — it\'s free'}
                </button>
                <p className="text-center text-xs text-gray-400 mt-3">
                  No spam. Unsubscribe any time.
                </p>
              </form>
            ) : (
              <div className="text-center py-4">
                <div className="text-4xl mb-3">🎉</div>
                <h3 className="font-bold text-gray-900 mb-1" style={{ fontFamily: "'EB Garamond', Georgia, serif" }}>
                  You're in!
                </h3>
                <p className="text-sm text-gray-500">
                  We'll be in touch with tips and exclusive offers.
                </p>
                <button
                  onClick={dismiss}
                  className="mt-4 px-6 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200 transition-all"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
