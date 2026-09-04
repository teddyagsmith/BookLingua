import { Metadata } from 'next'
import SiteFooter from '@/components/SiteFooter'

export const metadata: Metadata = {
  title: 'Affiliate Program - BookLingua',
  description: 'Earn 20% commission promoting BookLingua. Help authors translate their books and get paid.',
}

export default function AffiliatesPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-violet-50">
      <div className="max-w-3xl mx-auto px-8 py-20">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-gray-900 mb-4" style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}>
            BookLingua Affiliate Program
          </h1>
          <p className="text-xl text-gray-600">
            Help authors reach global readers. Earn 20% on every translation order.
          </p>
        </div>

        <div className="bg-white rounded-3xl shadow-xl p-8 border border-blue-100 mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6" style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}>
            How It Works
          </h2>
          <div className="space-y-4">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-violet-100 rounded-full flex items-center justify-center text-violet-700 font-bold flex-shrink-0">1</div>
              <div>
                <p className="font-semibold text-gray-900">Get your unique link</p>
                <p className="text-gray-600">We give you a custom URL like <code className="bg-gray-100 px-2 py-0.5 rounded text-sm">booklingua.io?ref=YOURCODE</code></p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-violet-100 rounded-full flex items-center justify-center text-violet-700 font-bold flex-shrink-0">2</div>
              <div>
                <p className="font-semibold text-gray-900">Share with your audience</p>
                <p className="text-gray-600">Newsletter, social media, podcast, blog — wherever authors hang out.</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-violet-100 rounded-full flex items-center justify-center text-violet-700 font-bold flex-shrink-0">3</div>
              <div>
                <p className="font-semibold text-gray-900">Earn 20% on every sale</p>
                <p className="text-gray-600">Average order is $149–$300. You earn $30–$60 per conversion. 60-day cookie.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-violet-50 to-blue-50 rounded-3xl p-8 border border-violet-200 mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4" style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}>
            Who This Is For
          </h2>
          <ul className="space-y-3">
            <li className="flex items-center gap-3">
              <span className="text-violet-600">✓</span>
              <span className="text-gray-700">Author communities and newsletter writers</span>
            </li>
            <li className="flex items-center gap-3">
              <span className="text-violet-600">✓</span>
              <span className="text-gray-700">Book marketing and KDP course creators</span>
            </li>
            <li className="flex items-center gap-3">
              <span className="text-violet-600">✓</span>
              <span className="text-gray-700">Podcasters who interview indie authors</span>
            </li>
            <li className="flex items-center gap-3">
              <span className="text-violet-600">✓</span>
              <span className="text-gray-700">Writing tools, plotters, and formatting services</span>
            </li>
            <li className="flex items-center gap-3">
              <span className="text-violet-600">✓</span>
              <span className="text-gray-700">Anyone who knows authors going global</span>
            </li>
          </ul>
        </div>

        <div className="bg-white rounded-3xl shadow-xl p-8 border border-blue-100 mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6" style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}>
            Commission Breakdown
          </h2>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="bg-gradient-to-br from-blue-50 to-white rounded-2xl p-6 border border-blue-100 text-center">
              <p className="text-sm text-gray-500 mb-1">Novella (40k words)</p>
              <p className="text-3xl font-bold text-gray-900">$99</p>
              <p className="text-violet-600 font-semibold mt-2">You earn $19.80</p>
            </div>
            <div className="bg-gradient-to-br from-violet-50 to-white rounded-2xl p-6 border border-violet-100 text-center">
              <p className="text-sm text-gray-500 mb-1">Novel (80k words)</p>
              <p className="text-3xl font-bold text-gray-900">$149</p>
              <p className="text-violet-600 font-semibold mt-2">You earn $29.80</p>
            </div>
            <div className="bg-gradient-to-br from-amber-50 to-white rounded-2xl p-6 border border-amber-100 text-center">
              <p className="text-sm text-gray-500 mb-1">Big book (150k words)</p>
              <p className="text-3xl font-bold text-gray-900">$199</p>
              <p className="text-violet-600 font-semibold mt-2">You earn $39.80</p>
            </div>
          </div>
          <p className="text-center text-gray-500 mt-4 text-sm">
            Bundle discounts apply too. 6 languages × $149 with 20% off = $715. You earn $143.
          </p>
        </div>

        <div className="bg-gradient-to-r from-blue-600 to-violet-600 rounded-3xl p-8 text-white text-center">
          <h2 className="text-3xl font-bold mb-4" style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}>
            Ready to get started?
          </h2>
          <p className="text-white/80 mb-6 text-lg">
            Email us with your audience size and where you plan to promote BookLingua.
          </p>
          <a
            href="mailto:hello@booklingua.io?subject=Affiliate%20Application"
            className="inline-block px-8 py-4 bg-white text-violet-700 rounded-2xl font-bold text-lg shadow-xl hover:shadow-2xl transition-all"
          >
            Apply Now →
          </a>
          <p className="text-white/60 mt-4 text-sm">
            or email hello@booklingua.io with "Affiliate Application" in the subject
          </p>
        </div>

        <div className="mt-12 text-center">
          <a href="/" className="text-gray-500 hover:text-violet-700 transition-colors">
            ← Back to BookLingua
          </a>
        </div>
      </div>
      <SiteFooter />
    </div>
  )
}
