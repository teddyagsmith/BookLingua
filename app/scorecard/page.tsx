import Image from 'next/image'
import Link from 'next/link'

const PDF_URL = '/downloads/booklingua-language-scorecard.pdf'

export default function ScorecardPage() {
  return (
    <main className="min-h-screen bg-cream px-5 py-10 text-gray-900 sm:py-16">
      <section className="mx-auto max-w-5xl overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-xl">
        <div className="grid lg:grid-cols-[0.9fr_1.1fr]">
          <div className="relative min-h-[420px] bg-brand-light p-8 sm:p-12">
            <Image src="/logo-doc-hq.png" alt="BookLingua" width={1080} height={370} className="h-auto w-52" priority />
            <div className="mt-12 rounded-2xl border border-white/70 bg-white/80 p-7 shadow-sm backdrop-blur">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-dark">Free 3-minute scorecard</p>
              <p className="mt-4 font-serif text-3xl font-bold leading-tight text-[#1a1a1a]">Your scorecard is ready</p>
              <p className="mt-4 leading-7 text-gray-600">Compare five language markets using your genre, existing reader signals and launch readiness.</p>
            </div>
          </div>

          <div className="flex flex-col justify-center p-8 sm:p-12">
            <p className="text-sm font-semibold text-brand-dark">German · Spanish · French · Italian · Portuguese</p>
            <h1 className="mt-4 font-serif text-4xl font-bold leading-tight sm:text-5xl">Which language should you translate your book into first?</h1>
            <p className="mt-5 text-lg leading-8 text-gray-600">Download the scorecard, add up your market-match totals and identify the most promising first market for your book.</p>

            <a href={PDF_URL} download className="mt-8 inline-flex items-center justify-center rounded-xl bg-brand px-6 py-4 text-base font-bold text-white shadow-lg transition hover:bg-brand-dark focus:outline-none focus:ring-4 focus:ring-brand-light">
              Download the scorecard (PDF)
            </a>
            <a href={PDF_URL} target="_blank" rel="noreferrer" className="mt-3 text-center text-sm font-semibold text-brand-dark underline underline-offset-4">Open it in your browser instead</a>

            <div className="mt-9 border-t border-stone-200 pt-7">
              <p className="font-semibold">Already know your language?</p>
              <p className="mt-2 text-sm leading-6 text-gray-600">Get a personalised translation estimate before checkout—there’s no obligation.</p>
              <Link href="/pricing?utm_source=scorecard_download&utm_medium=lead_magnet&utm_campaign=language_scorecard" className="mt-3 inline-block font-bold text-brand-dark underline underline-offset-4">Calculate your translation price →</Link>
            </div>
          </div>
        </div>
      </section>
      <p className="mx-auto mt-6 max-w-3xl text-center text-xs leading-5 text-gray-500">This scorecard is a planning tool, not a guarantee of sales or market performance.</p>
    </main>
  )
}
