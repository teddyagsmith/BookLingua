'use client'

import Image from 'next/image'
import { FormEvent, useState } from 'react'

export default function ThanksPage() {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!email.trim()) return

    setState('loading')
    try {
      const response = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source: 'thanks-page' }),
      })
      if (!response.ok) throw new Error('Subscription failed')
      setState('done')
    } catch {
      setState('error')
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-cream px-5 py-8">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=EB+Garamond:wght@500;600&display=swap');`}</style>

      <div className="absolute left-[-8rem] top-[-8rem] h-80 w-80 rounded-full bg-amber-200/40 blur-3xl" />
      <div className="absolute bottom-[-8rem] right-[-8rem] h-96 w-96 rounded-full bg-brand-light/80 blur-3xl" />

      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl flex-col items-center justify-center text-center">
        <Image
          src="/logo.png"
          alt="BookLingua"
          width={260}
          height={90}
          priority
          className="mb-8 h-auto w-[210px] object-contain sm:w-[260px]"
        />

        <section className="w-full rounded-3xl border border-white/80 bg-white/85 px-6 py-10 shadow-xl backdrop-blur-sm sm:px-12 sm:py-14">
          {state === 'done' ? (
            <div aria-live="polite">
              <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-2xl text-green-700">✓</div>
              <h1 className="font-serif text-4xl font-semibold text-gray-900 sm:text-5xl">You’re on the list.</h1>
              <p className="mx-auto mt-4 max-w-lg text-lg leading-relaxed text-gray-600">
                Thanks — we’ll send useful tips for translating, publishing and reaching readers around the world.
              </p>
            </div>
          ) : (
            <>
              <p className="mb-4 text-sm font-bold uppercase tracking-[0.18em] text-brand-dark">For independent authors</p>
              <h1 className="font-serif text-4xl font-semibold leading-tight text-gray-900 sm:text-6xl">
                Take your book<br />to readers worldwide.
              </h1>
              <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-gray-600">
                Get practical advice on book translation, international publishing and launching in new markets.
              </p>

              <form onSubmit={handleSubmit} className="mx-auto mt-8 flex max-w-xl flex-col gap-3 sm:flex-row">
                <label htmlFor="email" className="sr-only">Email address</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="Your email address"
                  className="min-w-0 flex-1 rounded-2xl border border-gray-200 bg-white px-5 py-4 text-base text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-brand focus:ring-4 focus:ring-brand-light"
                />
                <button
                  type="submit"
                  disabled={state === 'loading'}
                  className="rounded-2xl bg-brand px-7 py-4 text-base font-bold text-white shadow-lg transition hover:bg-brand-dark hover:shadow-xl disabled:cursor-wait disabled:opacity-60"
                >
                  {state === 'loading' ? 'Joining…' : 'Keep me updated →'}
                </button>
              </form>

              {state === 'error' && (
                <p role="alert" className="mt-3 text-sm font-medium text-red-600">
                  Something went wrong. Please try again.
                </p>
              )}

              <p className="mt-5 text-xs text-gray-400">Useful emails only. Unsubscribe at any time.</p>
            </>
          )}
        </section>
      </div>
    </main>
  )
}
