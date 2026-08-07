'use client'

import { useState, useEffect } from 'react'

interface NewsletterPopupProps {
  source?: string
  title?: string
  description?: string
}

export default function NewsletterPopup({
  source = 'blog-popup',
  title = 'Get more BookLingua guides',
  description = 'Translation tips, launch strategies, and book marketing ideas. One email when it matters.',
}: NewsletterPopupProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    // Don't show if already subscribed/dismissed this session
    if (typeof window === 'undefined') return
    const dismissed = sessionStorage.getItem('newsletter-popup-dismissed')
    if (dismissed) return

    const handleScroll = () => {
      const scrollTop = window.scrollY
      const docHeight = document.documentElement.scrollHeight - window.innerHeight
      const scrollPercent = docHeight > 0 ? scrollTop / docHeight : 0

      if (scrollPercent >= 0.5) {
        setIsOpen(true)
        window.removeEventListener('scroll', handleScroll)
      }
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const handleClose = () => {
    setIsOpen(false)
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('newsletter-popup-dismissed', 'true')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.includes('@')) {
      setStatus('error')
      setErrorMessage('Please enter a valid email')
      return
    }

    setStatus('loading')
    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source }),
      })

      if (res.ok) {
        setStatus('success')
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('newsletter-popup-dismissed', 'true')
        }
        setTimeout(() => setIsOpen(false), 2500)
      } else {
        const data = await res.json()
        setStatus('error')
        setErrorMessage(data.error || 'Something went wrong')
      }
    } catch (err) {
      setStatus('error')
      setErrorMessage('Network error')
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={handleClose}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl p-8 border border-[#EBE6F4]">
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Close"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>

        <div className="text-center mb-6">
          <div className="w-12 h-12 bg-brand rounded-full flex items-center justify-center mx-auto mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
              <polyline points="22,6 12,13 2,6"></polyline>
            </svg>
          </div>
          <h3 className="text-2xl font-bold text-gray-900 mb-2" style={{ fontFamily: "'EB Garamond', Georgia, serif" }}>
            {title}
          </h3>
          <p className="text-gray-600">{description}</p>
        </div>

        {status === 'success' ? (
          <div className="text-center py-4">
            <p className="text-green-600 font-medium text-lg">✓ You're in — thanks for subscribing!</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-brand focus:outline-none text-gray-900 placeholder:text-gray-400"
                required
              />
            </div>
            <button
              type="submit"
              disabled={status === 'loading'}
              className="w-full px-6 py-3 bg-brand text-white rounded-xl font-semibold shadow-lg hover:bg-brand-dark transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {status === 'loading' ? 'Subscribing...' : 'Subscribe'}
            </button>
            {status === 'error' && (
              <p className="text-red-600 text-sm text-center">{errorMessage}</p>
            )}
            <p className="text-xs text-gray-400 text-center">
              No spam. Unsubscribe anytime.
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
