import Image from 'next/image'
import { Suspense } from 'react'
import ScorecardSignup from './ScorecardSignup'

export default function LanguageScorecardLandingPage() {
  return (
    <main className="min-h-screen bg-cream px-5 py-10 text-gray-900 sm:py-16">
      <section className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[1.08fr_0.92fr] lg:gap-16">
        <div>
          <Image src="/logo-doc-hq.png" alt="BookLingua" width={1080} height={370} className="h-auto w-48" priority />
          <p className="mt-10 text-sm font-bold uppercase tracking-[0.18em] text-brand-dark">Free three-minute scorecard</p>
          <h1 className="mt-4 font-serif text-5xl font-bold leading-[1.05] text-[#1a1a1a] sm:text-6xl">Which language should you translate your book into first?</h1>
          <p className="mt-6 max-w-2xl text-xl leading-8 text-gray-600">Compare five major language markets using your genre, existing reader signals and launch readiness—before spending anything on translation.</p>
          <ul className="mt-8 space-y-4 text-lg text-gray-700">
            <li className="flex gap-3"><span className="font-bold text-emerald-700">✓</span><span>Score German, Spanish, French, Italian and Portuguese</span></li>
            <li className="flex gap-3"><span className="font-bold text-emerald-700">✓</span><span>Identify your strongest first-market opportunity</span></li>
            <li className="flex gap-3"><span className="font-bold text-emerald-700">✓</span><span>See what to validate before committing to translation</span></li>
          </ul>
          <div className="mt-9 rounded-2xl border border-stone-200 bg-white/75 p-5 text-sm leading-6 text-gray-600">
            <strong className="text-gray-900">Made for self-published authors.</strong> This is a planning tool—not a promise of sales—and you don’t need to upload your manuscript.
          </div>
        </div>
        <Suspense fallback={<div className="min-h-[560px] rounded-3xl bg-white shadow-xl" />}>
          <ScorecardSignup />
        </Suspense>
      </section>
    </main>
  )
}
