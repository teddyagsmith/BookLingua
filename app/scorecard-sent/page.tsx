import Link from 'next/link'

export default function ScorecardSentPage() {
  return (
    <main className="min-h-screen bg-cream px-5 py-16 text-gray-900">
      <section className="mx-auto max-w-2xl rounded-3xl border border-stone-200 bg-white p-8 text-center shadow-xl sm:p-12">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-3xl text-emerald-700" aria-hidden="true">
          ✓
        </div>
        <p className="mt-7 text-sm font-bold uppercase tracking-[0.18em] text-brand-dark">Request received</p>
        <h1 className="mt-3 font-serif text-4xl font-bold leading-tight">Your Scorecard is on its way</h1>
        <p className="mt-5 text-lg leading-8 text-gray-600">
          Check your inbox for an email from BookLingua containing your link to the Language Scorecard.
        </p>
        <div className="mt-8 rounded-2xl bg-brand-light/50 p-5 text-left text-sm leading-6 text-gray-700">
          <strong className="text-gray-900">It hasn’t arrived?</strong>
          <p className="mt-1">Please allow a few minutes and check your spam or promotions folder. The email will be sent to the address you entered.</p>
        </div>
        <Link href="/" className="mt-8 inline-block font-bold text-brand-dark underline underline-offset-4">
          Return to BookLingua
        </Link>
      </section>
    </main>
  )
}
