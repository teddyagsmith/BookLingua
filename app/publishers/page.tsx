import Image from 'next/image'
import Link from 'next/link'
import ResourcesMenu from '@/components/ResourcesMenu'
import SiteFooter from '@/components/SiteFooter'

const serifFont = { fontFamily: "'EB Garamond', Georgia, serif" }

const Logo = ({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) => {
  const sizes = { sm: 120, md: 200, lg: 300 }
  return (
    <Image
      src="/logo.png"
      alt="BookLingua"
      width={sizes[size]}
      height={sizes[size]}
      className="object-contain"
    />
  )
}

export default function PublishersPage() {
  return (
    <div className="min-h-screen bg-cream">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400&display=swap');`}</style>

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-4 sm:px-8 py-6 max-w-7xl mx-auto">
        <Link href="/" className="flex items-center gap-3">
          <Logo size="lg" />
        </Link>
        <div className="flex items-center gap-3 sm:gap-6">
          <ResourcesMenu />
          <Link href="/pricing" className="text-gray-600 hover:text-brand-dark font-medium transition-colors hidden sm:block">
            Pricing
          </Link>
          <Link href="/examples" className="text-gray-600 hover:text-brand-dark font-medium transition-colors hidden sm:block">
            Examples
          </Link>
          <Link
            href="/"
            className="px-4 py-2 sm:px-6 sm:py-2.5 bg-brand text-white rounded-full text-sm sm:text-base font-semibold shadow-lg hover:shadow-xl transition-all whitespace-nowrap"
          >
            Start Translating
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <header className="relative overflow-hidden">
        <div className="absolute inset-0 opacity-30 pointer-events-none">
          <div className="absolute top-20 left-10 w-72 h-72 bg-amber-200 rounded-full blur-3xl" />
          <div className="absolute top-40 right-20 w-96 h-96 bg-brand-light rounded-full blur-3xl" />
        </div>

        <div className="relative z-10 max-w-4xl mx-auto px-8 pt-20 pb-24 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/80 rounded-full text-sm font-medium text-brand-dark mb-8">
            <span className="w-2 h-2 bg-brand rounded-full" />
            For Publishers &amp; Small Presses
          </div>

          <h1 className="text-6xl font-bold text-gray-900 leading-tight mb-6" style={serifFont}>
            Translate Your
            <span className="block bg-gradient-to-r from-brand to-brand-dark bg-clip-text text-transparent">
              Entire Backlist
            </span>
          </h1>

          <p className="text-xl text-gray-600 leading-relaxed max-w-2xl mx-auto mb-10">
            Publishers and small presses with 10+ books get dedicated support, bulk pricing, and a hands-off workflow. We handle the entire translation pipeline — you get polished, publish-ready files.
          </p>

          <a
            href="mailto:hello@booklingua.io?subject=Publisher%20Enquiry"
            className="inline-flex items-center gap-3 px-10 py-4 bg-brand text-white rounded-2xl font-bold text-lg shadow-xl hover:shadow-2xl transition-all hover:-translate-y-1"
          >
            Get in Touch →
          </a>

          <p className="mt-4 text-sm text-gray-400">
            No commitment required — we&apos;ll scope your project for free.
          </p>
        </div>
      </header>

      {/* Feature Cards */}
      <section className="py-20 bg-white">
        <div className="max-w-6xl mx-auto px-8">
          <div className="text-center mb-14">
            <h2 className="text-4xl font-bold text-gray-900 mb-4" style={serifFont}>
              Built for publishing at scale
            </h2>
            <p className="text-xl text-gray-600">
              Everything a publisher needs to localise a full catalogue — without the agency overhead.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Card 1 */}
            <div className="bg-cream rounded-3xl p-8 border border-[#EBE6F4]">
              <div className="w-14 h-14 bg-brand rounded-2xl flex items-center justify-center text-white text-2xl shadow-lg mb-6">
                📚
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3" style={serifFont}>Bulk Processing</h3>
              <p className="text-gray-600 leading-relaxed">
                Queue your entire catalogue and translate multiple books simultaneously. No waiting for one to finish before the next begins.
              </p>
            </div>

            {/* Card 2 */}
            <div className="bg-brand-light rounded-3xl p-8 border border-[#EBE6F4]">
              <div className="w-14 h-14 bg-brand rounded-2xl flex items-center justify-center text-white text-2xl shadow-lg mb-6">
                🤝
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3" style={serifFont}>Dedicated Account Manager</h3>
              <p className="text-gray-600 leading-relaxed">
                White-glove setup and delivery. Your account manager handles onboarding, quality checks, and delivers files in whatever format you specify.
              </p>
            </div>

            {/* Card 3 */}
            <div className="bg-cream rounded-3xl p-8 border border-[#EBE6F4]">
              <div className="w-14 h-14 bg-brand rounded-2xl flex items-center justify-center text-white text-2xl shadow-lg mb-6">
                💰
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3" style={serifFont}>Custom Pricing</h3>
              <p className="text-gray-600 leading-relaxed">
                Volume discounts that scale with your catalogue. The more you translate, the lower the per-book cost — with predictable, upfront quotes.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 bg-cream">
        <div className="max-w-4xl mx-auto px-8">
          <div className="text-center mb-14">
            <h2 className="text-4xl font-bold text-gray-900 mb-4" style={serifFont}>
              How it works for publishers
            </h2>
            <p className="text-xl text-gray-600">
              Three steps from catalogue to translated files — we handle everything in between.
            </p>
          </div>

          <div className="space-y-6">
            {[
              {
                step: 1,
                title: 'Share your catalogue',
                desc: 'Send us your book list — titles, word counts, genres, and any style guides or glossaries. We scope the project and provide a quote within 24 hours.',
              },
              {
                step: 2,
                title: 'We set up your pipeline',
                desc: 'Your account manager configures language settings, terminology rules, and output formats. We run a test translation on a sample chapter for your approval.',
              },
              {
                step: 3,
                title: 'Translations delivered to your spec',
                desc: 'Books are translated in batches with our two-pass AI + editorial system. Files arrive in your preferred format (EPUB, DOCX or TXT) with all changes highlighted for easy review.',
              },
            ].map(({ step, title, desc }) => (
              <div key={step} className="bg-white rounded-3xl p-8 border-2 border-[#EBE6F4] shadow-sm flex items-start gap-6">
                <div className="w-14 h-14 flex-shrink-0 bg-brand rounded-2xl flex items-center justify-center text-white text-2xl font-bold shadow-lg">
                  {step}
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2" style={serifFont}>{title}</h3>
                  <p className="text-gray-600 leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust Section */}
      <section className="py-16 bg-white border-y border-gray-100">
        <div className="max-w-4xl mx-auto px-8">
          <div className="flex flex-col md:flex-row items-center justify-center gap-8 md:gap-16 text-center">
            <div>
              <div className="text-3xl mb-2">🤖</div>
              <p className="font-semibold text-gray-800">Proprietary two-pass AI translation</p>
              <p className="text-sm text-gray-500 mt-1">State-of-the-art literary AI</p>
            </div>
            <div className="hidden md:block w-px h-12 bg-gray-200" />
            <div>
              <div className="text-3xl mb-2">✏️</div>
              <p className="font-semibold text-gray-800">Editorial review on every book</p>
              <p className="text-sm text-gray-500 mt-1">Two-pass quality system</p>
            </div>
            <div className="hidden md:block w-px h-12 bg-gray-200" />
            <div>
              <div className="text-3xl mb-2">📁</div>
              <p className="font-semibold text-gray-800">All major formats supported</p>
              <p className="text-sm text-gray-500 mt-1">EPUB · DOCX · TXT</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-28 bg-brand relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 pointer-events-none">
          <div className="absolute bottom-10 left-20 w-80 h-80 bg-white rounded-full blur-3xl" />
          <div className="absolute top-10 right-10 w-72 h-72 bg-amber-200 rounded-full blur-3xl" />
        </div>

        <div className="relative z-10 max-w-3xl mx-auto px-8 text-center">
          <h2 className="text-5xl font-bold text-white mb-6" style={serifFont}>
            Ready to translate your backlist?
          </h2>
          <p className="text-xl text-white/80 mb-10 leading-relaxed">
            Drop us a line and tell us about your catalogue. We&apos;ll put together a custom plan — no pushy sales, just a straightforward quote.
          </p>

          <a
            href="mailto:hello@booklingua.io?subject=Publisher%20Enquiry"
            className="inline-flex items-center gap-3 px-12 py-5 bg-white text-brand-dark rounded-2xl font-bold text-xl shadow-2xl hover:shadow-3xl transition-all hover:-translate-y-1"
          >
            Get in Touch
            <span className="text-2xl">→</span>
          </a>

          <p className="mt-6 text-white/70 text-sm">
            hello@booklingua.io · We reply within one business day.
          </p>
        </div>
      </section>

      {/* Footer */}
      <SiteFooter />
    </div>
  )
}
