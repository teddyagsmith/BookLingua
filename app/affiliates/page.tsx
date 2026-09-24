import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'

const REVSHARE_APPLICATION_URL = 'https://booklingua.revshare.so/'
const serifFont = { fontFamily: "'EB Garamond', Georgia, serif" }

export const metadata: Metadata = {
  title: 'BookLingua Affiliate Programme | Help Authors Reach New Readers',
  description: 'Join the BookLingua affiliate programme and earn commission by introducing independent authors to a faster, more affordable way to translate and launch their books internationally.',
  alternates: { canonical: '/affiliates' },
  openGraph: {
    title: 'BookLingua Affiliate Programme | Help Authors Reach New Readers',
    description: 'Earn commission by introducing independent authors to a faster, more affordable way to translate and launch their books internationally.',
    url: 'https://booklingua.io/affiliates',
    type: 'website',
  },
}
const authorBenefits = [
  'A complete translated manuscript',
  'A separate AI editorial-review pass',
  'Terminology and consistency checks',
  'Targeted review of selected passages by a professional translator',
  'An updated manuscript incorporating relevant reviewer feedback',
  'Localised descriptions, keywords, categories and pricing guidance',
  'A practical plan for launching the translated book',
]

const partnerTypes = [
  ['Independent-author educators', 'Writing coaches, course creators and consultants'],
  ['Writing communities', 'Membership groups and publishing organisations'],
  ['Book-marketing specialists', 'Consultants, agencies and author services'],
  ['Publishing creators', 'Podcasts, newsletters and YouTube channels'],
  ['Editorial professionals', 'Editors, cover designers and book formatters'],
  ['Genre-specific groups', 'Communities with a clear author audience'],
  ['Established authors', 'Authors who share trusted resources with their audience'],
]

const supportMaterials = [
  'A short, approved explanation of BookLingua and how it works',
  'Ready-to-use email, newsletter and social copy',
  'BookLingua graphics sized for common promotional channels',
  'A free pricing calculator you can share with your audience',
  'Practical publishing guides and real translation case studies',
  'Help choosing the most relevant resources for your audience',
]

function ApplyButton({ label = 'Apply to become an affiliate', inverse = false }: { label?: string; inverse?: boolean }) {
  return (
    <a href={REVSHARE_APPLICATION_URL} className={`inline-flex items-center justify-center rounded-full px-6 py-3.5 text-center font-semibold shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl ${inverse ? 'bg-white text-brand-dark' : 'bg-brand text-white'}`}>
      {label} <span className="ml-2" aria-hidden="true">→</span>
    </a>
  )
}

export default function AffiliatesPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-cream text-gray-900">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400&display=swap');`}</style>

      <nav className="relative z-20 mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
        <Link href="/" aria-label="BookLingua home">
          <Image src="/logo.png" alt="BookLingua" width={358} height={82} className="h-auto w-44 sm:w-52" priority />
        </Link>
        <ApplyButton label="Apply now" />
      </nav>

      <section className="relative px-5 pb-20 pt-12 sm:px-8 sm:pb-28 sm:pt-20">
        <div className="absolute -left-32 top-4 h-72 w-72 rounded-full bg-[#DCEAD8]/70 blur-3xl" />
        <div className="absolute -right-28 top-24 h-80 w-80 rounded-full bg-brand-light/80 blur-3xl" />
        <div className="relative mx-auto max-w-5xl text-center">
          <p className="mb-5 text-sm font-bold uppercase tracking-[0.2em] text-brand-dark">BookLingua Affiliate Programme</p>
          <h1 className="mx-auto max-w-4xl text-5xl font-semibold leading-[0.98] text-[#17233C] sm:text-6xl lg:text-7xl" style={serifFont}>Help authors reach readers around the world</h1>
          <div className="mx-auto mt-7 max-w-3xl space-y-4 text-lg leading-8 text-gray-600 sm:text-xl">
            <p>Earn commission by introducing independent authors to a faster, more affordable alternative to traditional book translation.</p>
            <p>BookLingua combines AI translation with a separate editorial-review pass, consistency checks and targeted review by a professional translator. Authors also receive localised launch materials to help them publish and start selling their translated books on Amazon.</p>
          </div>
          <div className="mt-9 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <ApplyButton />
            <Link href="/#how-it-works" className="inline-flex items-center justify-center rounded-full border border-brand/30 bg-white/70 px-6 py-3.5 font-semibold text-brand-dark transition hover:border-brand hover:bg-white">See how BookLingua works</Link>
          </div>
          <p className="mx-auto mt-7 max-w-3xl text-sm leading-6 text-gray-600">Ideal for author educators, publishing professionals, writing communities, book marketers and creators with an audience of independent authors.</p>
        </div>
      </section>

      <section className="bg-white px-5 py-20 sm:px-8 sm:py-24">
        <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
          <div className="lg:sticky lg:top-12">
            <p className="mb-3 text-sm font-bold uppercase tracking-[0.18em] text-brand">Why promote BookLingua?</p>
            <h2 className="text-4xl font-semibold leading-tight text-[#17233C] sm:text-5xl" style={serifFont}>Give authors a more accessible route into international publishing</h2>
            <p className="mt-6 text-lg leading-8 text-gray-600">Traditional book translation can cost thousands of dollars and take months, putting international publishing beyond the reach of many independent authors.</p>
            <p className="mt-4 text-lg leading-8 text-gray-600">BookLingua gives authors a practical way to test another market without making such a large upfront investment. Pricing starts at $99 per language, and every order includes more than a direct AI translation.</p>
            <Link href="/#how-it-works" className="mt-6 inline-flex font-semibold text-brand-dark underline decoration-brand/30 underline-offset-4 hover:decoration-brand">Explore the translation process →</Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {authorBenefits.map((benefit, index) => (
              <div key={benefit} className={`rounded-2xl border p-5 ${index === authorBenefits.length - 1 ? 'border-[#C9DDC4] bg-[#F2F7F0]' : 'border-brand-light bg-[#FBF9FD]'}`}>
                <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-white text-sm font-bold text-brand-dark shadow-sm">✓</div>
                <p className="font-semibold leading-6 text-[#273149]">{benefit}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 py-20 sm:px-8 sm:py-24">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-3xl text-center">
            <p className="mb-3 text-sm font-bold uppercase tracking-[0.18em] text-brand">Who it is for</p>
            <h2 className="text-4xl font-semibold text-[#17233C] sm:text-5xl" style={serifFont}>A strong fit for people who already help authors succeed</h2>
          </div>
          <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {partnerTypes.map(([title, description], index) => (
              <div key={title} className={`rounded-2xl border p-6 ${index % 3 === 1 ? 'border-[#C9DDC4] bg-[#F2F7F0]' : 'border-brand-light bg-white'}`}>
                <div className="mb-4 text-xl text-brand" aria-hidden="true">✦</div>
                <h3 className="text-lg font-bold text-[#17233C]">{title}</h3>
                <p className="mt-2 leading-6 text-gray-600">{description}</p>
              </div>
            ))}
          </div>
          <p className="mx-auto mt-8 max-w-3xl text-center text-lg leading-8 text-gray-600">You do not need to be a translation expert. We provide clear explanations, case studies and promotional materials to help you introduce BookLingua accurately.</p>
        </div>
      </section>

      <section className="bg-[#17233C] px-5 py-20 text-white sm:px-8 sm:py-24">
        <div className="mx-auto max-w-7xl">
          <p className="mb-3 text-sm font-bold uppercase tracking-[0.18em] text-[#CFC5EB]">Simple and transparent</p>
          <h2 className="max-w-3xl text-4xl font-semibold sm:text-5xl" style={serifFont}>How the BookLingua affiliate programme works</h2>
          <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {[
              ['Apply', 'Tell us briefly about your audience and how you plan to introduce BookLingua.'],
              ['Receive your link', 'Once approved, RevShare provides your unique BookLingua tracking link and affiliate dashboard.'],
              ['Share useful resources', 'Promote the free pricing calculator, practical publishing guides, real case studies or BookLingua itself. We provide ready-to-use copy and graphics.'],
              ['Earn commission', 'Earn commission when an eligible customer purchases BookLingua through your tracked link.'],
            ].map(([title, copy], index) => (
              <div key={title} className="rounded-2xl border border-white/15 bg-white/5 p-6">
                <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-full bg-[#CFC5EB] font-bold text-[#17233C]">{index + 1}</div>
                <h3 className="text-xl font-bold">{title}</h3>
                <p className="mt-3 leading-7 text-slate-300">{copy}</p>
                {index === 3 && (
                  <ul className="mt-5 space-y-2 border-t border-white/15 pt-5 text-sm text-slate-200">
                    <li><strong className="text-white">20%</strong> commission per eligible sale</li>
                    <li><strong className="text-white">30-day</strong> attribution window</li>
                    <li><strong className="text-white">30-day</strong> payout validation period</li>
                    <li><strong className="text-white">No minimum</strong> payout threshold</li>
                  </ul>
                )}
              </div>
            ))}
          </div>
          <p className="mt-6 text-sm text-slate-400">Programme administration, attribution, dashboards and payouts are managed securely through RevShare.</p>
        </div>
      </section>

      <section className="bg-white px-5 py-20 sm:px-8 sm:py-24">
        <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="mb-3 text-sm font-bold uppercase tracking-[0.18em] text-brand">Promotional support</p>
            <h2 className="text-4xl font-semibold text-[#17233C] sm:text-5xl" style={serifFont}>We make BookLingua easy to promote</h2>
            <p className="mt-6 text-lg leading-8 text-gray-600">Approved affiliates receive practical materials they can use immediately, rather than being left to create a campaign from scratch.</p>
          </div>
          <div className="rounded-3xl border border-brand-light bg-[#FBF9FD] p-6 sm:p-8">
            <ul className="space-y-5">
              {supportMaterials.map((item) => (
                <li key={item} className="flex gap-4">
                  <span className="mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-full bg-[#DCEAD8] text-sm font-bold text-[#315B36]">✓</span>
                  <span className="leading-7 text-gray-700">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="px-5 py-20 sm:px-8 sm:py-24">
        <div className="relative mx-auto max-w-5xl overflow-hidden rounded-[2rem] bg-brand px-6 py-14 text-center text-white shadow-xl sm:px-12 sm:py-16">
          <div className="absolute -left-8 -top-10 text-8xl text-white/10" aria-hidden="true">✦</div>
          <div className="absolute -bottom-12 -right-5 text-9xl text-white/10" aria-hidden="true">✦</div>
          <div className="relative">
            <h2 className="text-4xl font-semibold sm:text-5xl" style={serifFont}>Help more authors publish internationally</h2>
            <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-white/85">If your audience includes independent authors looking for practical ways to reach new readers, we would love to hear from you.</p>
            <div className="mt-8"><ApplyButton inverse /></div>
            <p className="mt-5 text-sm text-white/65">Applications, tracking links and affiliate dashboards are hosted by RevShare.</p>
          </div>
        </div>
      </section>

      <footer className="bg-gray-900 px-5 py-10 text-gray-400 sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-7 text-center md:flex-row md:text-left">
          <Link href="/" aria-label="BookLingua home"><Image src="/logo-dark-bg.png" alt="BookLingua" width={358} height={82} className="h-auto w-48" /></Link>
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-3 text-sm">
            <Link href="/examples" className="hover:text-white">Examples</Link>
            <Link href="/publishers" className="hover:text-white">Publishers</Link>
            <Link href="/blog" className="hover:text-white">Guides</Link>
            <Link href="/affiliates" className="text-white">Affiliates</Link>
            <a href="mailto:hello@booklingua.io" className="hover:text-white">Contact</a>
          </div>
          <p className="text-sm">© 2026 BookLingua</p>
        </div>
      </footer>
    </main>
  )
}
