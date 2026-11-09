import type { Metadata } from 'next'
import Link from 'next/link'
import LaunchChecklistSignup from '@/components/LaunchChecklistSignup'
import SiteFooter from '@/components/SiteFooter'

export const metadata: Metadata = {
  title: 'Free Translated-Book Launch Checklist | BookLingua',
  description: 'Download a practical checklist covering files, metadata, covers, keywords, pricing, publishing and promotion for your translated book.',
  alternates: { canonical: '/launch-checklist' },
}

export default function LaunchChecklistPage() {
  return (
    <div className="min-h-screen bg-cream">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Link href="/" className="text-xl font-bold text-brand-dark">BookLingua</Link>
        <Link href="/pricing" className="rounded-full bg-brand px-5 py-2.5 font-semibold text-white">See pricing</Link>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-12 sm:py-20">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-bold uppercase tracking-wider text-brand-dark">Free author resource</p>
          <h1 className="mt-3 font-serif text-4xl font-bold leading-tight text-gray-900 sm:text-5xl">Launch your translated book without missing a step</h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-gray-600">Download the printable checklist for everything from your final files and localised metadata to pricing, publication and promotion.</p>
        </div>
        <LaunchChecklistSignup />
      </main>
      <SiteFooter />
    </div>
  )
}
