'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import PricingCalculator, { PricingCalculatorSelection } from '@/components/PricingCalculator'
import ResourcesMenu from '@/components/ResourcesMenu'
import SiteFooter from '@/components/SiteFooter'
import { WORD_TIERS } from '@/lib/pricing'

const discounts = [
  ['1 Language', 'Standard price'], ['2 Languages', 'Save 7%'], ['3 Languages', 'Save 10%'],
  ['4 Languages', 'Save 12%'], ['5 Languages', 'Save 15%'], ['6+ Languages', 'Save 20%'],
]

const faqs = [
  ['How much does AI book translation cost?', 'Pricing is based on manuscript length: $99 per language for up to 40,000 words, $149 for up to 80,000 words, and $199 for up to 150,000 words. Multi-language discounts are applied automatically.'],
  ['What does the professional translator review include?', 'BookLingua selects passages that are particularly difficult to translate or where small choices could significantly affect tone, meaning or readability. These might include dialogue, humour, idioms, culturally specific references or emotionally important scenes. A professional translator reviews these passages as an additional human quality check. This is not a full line-by-line proofread of the complete manuscript.'],
  ['Is every translation checked by a human?', 'Selected passages are checked by a professional translator after the translation and AI editorial-review stages. The translator focuses on passages where professional judgement is most valuable rather than proofreading the complete manuscript line by line.'],
  ['What happens if my manuscript is over 150,000 words?', 'Books over 150,000 words need a tailored quote. Enter the word count in the calculator and use the request-a-quote button to contact us.'],
]

export default function PricingPage() {
  const router = useRouter()
  const start = (selection: PricingCalculatorSelection) => {
    const params = new URLSearchParams({ start: '1', estimateWords: String(selection.wordCount), languages: selection.languages.join(',') })
    router.push(`/?${params.toString()}`)
  }

  return <div className="min-h-screen bg-cream">
    <style>{`@import url('https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400&display=swap');`}</style>
    <nav className="sticky top-0 z-50 border-b border-[#EBE6F4] bg-cream/95 px-4 py-3 backdrop-blur sm:px-8">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
        <Link href="/">
          <Image src="/logo.png" alt="BookLingua" width={300} height={300} className="h-auto w-[130px] object-contain sm:w-[220px]" />
        </Link>
        <div className="flex items-center gap-3 sm:gap-6">
          <ResourcesMenu />
          <Link href="/examples" className="hidden font-medium text-gray-600 hover:text-brand-dark sm:block">Examples</Link>
          <Link href="/?start=1" className="whitespace-nowrap rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white shadow-lg sm:px-6 sm:text-base">Start Translating</Link>
        </div>
      </div>
    </nav>

    <main>
      <section className="px-5 pb-10 pt-14 text-center sm:pt-16">
        <h1 className="text-5xl font-bold text-gray-900 sm:text-6xl" style={{fontFamily:"'EB Garamond', Georgia, serif"}}>Clear pricing for every book</h1>
        <p className="mx-auto mt-5 max-w-3xl text-lg leading-8 text-gray-600">Enter your manuscript’s word count and choose your target languages to calculate your price. Every translation includes BookLingua’s AI editorial review and targeted review by a professional translator.</p>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-20 sm:px-8"><PricingCalculator onStart={start} /></section>

      <section className="bg-white px-5 py-20 sm:px-8">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-4xl font-bold text-gray-900" style={{fontFamily:"'EB Garamond', Georgia, serif"}}>Simple word-count pricing</h2>
          <div className="mt-10 grid gap-5 md:grid-cols-3">{Object.entries(WORD_TIERS).map(([key, tier]) => <div key={key} className={`rounded-3xl border-2 bg-white p-7 text-center ${key === 'medium' ? 'border-brand shadow-lg' : 'border-gray-100'}`}><p className="text-gray-500">{tier.label}</p><p className="mt-2 text-4xl font-bold text-gray-900">${tier.basePrice}</p><p className="text-gray-500">per language</p></div>)}</div>
          <h3 className="mt-14 text-center text-3xl font-bold text-gray-900" style={{fontFamily:"'EB Garamond', Georgia, serif"}}>Multi-language discounts</h3>
          <div className="mt-7 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">{discounts.map(([label, saving]) => <div key={label} className="rounded-xl bg-[#F3F0F8] p-4 text-center"><p className="font-bold text-gray-900">{label}</p><p className={saving === 'Standard price' ? 'text-gray-500' : 'font-semibold text-green-700'}>{saving}</p></div>)}</div>
        </div>
      </section>

      <section id="professional-review" className="scroll-mt-24 px-5 py-20 sm:px-8"><div className="mx-auto max-w-3xl rounded-3xl border border-[#E4DDEE] bg-white p-7 shadow-lg sm:p-10"><h2 className="text-4xl font-bold text-gray-900" style={{fontFamily:"'EB Garamond', Georgia, serif"}}>Targeted review by a professional translator</h2><div className="mt-5 space-y-4 text-lg leading-8 text-gray-700"><p>BookLingua identifies passages where professional judgement is particularly valuable, such as dialogue, humour, idioms, culturally specific references and emotionally important scenes.</p><p>A professional translator reviews those selected passages for clarity, consistency, tone and readability after our AI-assisted translation and editorial-review stages.</p><p className="font-semibold text-gray-900">This targeted review is not a full-manuscript human proofread or a line-by-line review of the complete book.</p></div></div></section>

      <section id="faqs" className="scroll-mt-24 bg-white px-5 py-20 sm:px-8"><div className="mx-auto max-w-3xl"><h2 className="text-center text-4xl font-bold text-gray-900" style={{fontFamily:"'EB Garamond', Georgia, serif"}}>Pricing FAQs</h2><div className="mt-10 space-y-5">{faqs.map(([q,a]) => <div key={q} className="rounded-2xl border border-[#EBE6F4] bg-gradient-to-br from-cream to-[#F3F0F8] p-6"><h3 className="text-xl font-bold text-gray-900">{q}</h3><p className="mt-3 leading-7 text-gray-600">{a}</p></div>)}</div></div></section>

      <section className="px-5 py-20 text-center"><h2 className="text-4xl font-bold text-gray-900" style={{fontFamily:"'EB Garamond', Georgia, serif"}}>Ready to translate your book?</h2><p className="mt-3 text-lg text-gray-600">Upload your manuscript and we’ll confirm the word count before payment.</p><Link href="/?start=1" className="mt-7 inline-flex rounded-2xl bg-brand px-10 py-4 text-lg font-bold text-white shadow-xl">Start your translation</Link></section>
    </main>
    <SiteFooter />
  </div>
}
