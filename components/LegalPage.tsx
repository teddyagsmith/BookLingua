import Image from 'next/image'
import Link from 'next/link'
import type { ReactNode } from 'react'
import SiteFooter from './SiteFooter'

const serifFont = { fontFamily: "'EB Garamond', Georgia, serif" }

export function LegalPage({ eyebrow, title, introduction, children }: { eyebrow: string; title: string; introduction: string; children: ReactNode }) {
  return (
    <main className="min-h-screen bg-cream text-gray-900">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400&display=swap');`}</style>
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
        <Link href="/" aria-label="BookLingua home">
          <Image src="/logo.png" alt="BookLingua" width={358} height={82} className="h-auto w-44 sm:w-52" priority />
        </Link>
        <Link href="/" className="text-sm font-semibold text-brand-dark hover:text-brand">Back to BookLingua</Link>
      </nav>
      <header className="border-y border-brand-light/70 bg-white/55 px-5 py-14 sm:px-8 sm:py-20">
        <div className="mx-auto max-w-4xl">
          <p className="mb-3 text-sm font-bold uppercase tracking-[0.18em] text-brand">{eyebrow}</p>
          <h1 className="text-4xl font-semibold leading-tight text-[#17233C] sm:text-6xl" style={serifFont}>{title}</h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-gray-600">{introduction}</p>
          <p className="mt-5 text-sm text-gray-500">Last updated: 24 September 2026</p>
        </div>
      </header>
      <article className="mx-auto max-w-4xl px-5 py-14 sm:px-8 sm:py-20">
        <div className="legal-copy space-y-12">{children}</div>
      </article>
      <SiteFooter />
    </main>
  )
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-4 text-3xl font-semibold text-[#17233C]" style={serifFont}>{title}</h2>
      <div className="space-y-4 text-base leading-7 text-gray-700">{children}</div>
    </section>
  )
}

export function LegalList({ children }: { children: ReactNode }) {
  return <ul className="ml-5 list-disc space-y-2 marker:text-brand">{children}</ul>
}
