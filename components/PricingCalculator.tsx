'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { trackEvent } from '@/lib/analytics'
import { bundleDiscountPercent } from '@/lib/bundle-pricing'
import { CORE_LANGUAGES } from '@/lib/languages'
import { calculateTranslationPrice, pricingTierForWordCount, PricingTierKey } from '@/lib/pricing'

export type PricingCalculatorSelection = {
  wordCount: number
  languages: string[]
  tier: PricingTierKey
  discountPercent: number
  total: number
}

type Props = { onStart: (selection: PricingCalculatorSelection) => void }

export function parseWordCount(value: string): number | null {
  const normalized = value.replace(/[\s,]/g, '')
  if (!normalized || !/^\d+$/.test(normalized)) return null
  const parsed = Number(normalized)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })

export default function PricingCalculator({ onStart }: Props) {
  const [wordCountInput, setWordCountInput] = useState('')
  const [touched, setTouched] = useState(false)
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([])
  const [reviewOpen, setReviewOpen] = useState(false)
  const viewed = useRef(false)
  const calculatorRef = useRef<HTMLDivElement>(null)
  const validWordCount = parseWordCount(wordCountInput)
  const overLimit = validWordCount !== null && validWordCount > 150_000
  const tier = validWordCount ? pricingTierForWordCount(validWordCount) : null
  const result = useMemo(
    () => validWordCount ? calculateTranslationPrice(validWordCount, selectedLanguages.length) : null,
    [validWordCount, selectedLanguages.length],
  )

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const compactEstimate = params.get('pricingEstimate')?.split(':')
    const words = compactEstimate?.[0] || params.get('estimateWords')
    const languages = (compactEstimate?.[1] || params.get('languages') || '').split(',').filter(code => CORE_LANGUAGES.some(language => language.code === code))
    if (words && parseWordCount(words)) setWordCountInput(Number(parseWordCount(words)).toLocaleString('en-US'))
    if (languages.length) setSelectedLanguages(languages)
  }, [])

  useEffect(() => {
    const node = calculatorRef.current
    if (!node) return
    const observer = new IntersectionObserver(entries => {
      if (!viewed.current && entries.some(entry => entry.isIntersecting)) {
        viewed.current = true
        trackEvent('pricing_calculator_viewed')
      }
    }, { threshold: 0.25 })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!result) return
    trackEvent('pricing_result_displayed', {
        word_count: validWordCount!,
      language_count: result.languageCount,
      discount_percent: result.discountPercent,
      total: result.total,
    })
  }, [result?.tier.key, result?.languageCount])

  const validationMessage = touched && !validWordCount
    ? (!wordCountInput.trim() ? 'Enter your manuscript word count to see your price.' : 'Enter a whole number greater than zero, using numbers only.')
    : ''

  const toggleLanguage = (code: string) => {
    setSelectedLanguages(current => {
      const selecting = !current.includes(code)
      const next = selecting ? [...current, code] : current.filter(item => item !== code)
      trackEvent('pricing_language_selected', { language: code, selected: selecting, language_count: next.length })
      if (selecting && next.length === 2) trackEvent('pricing_multiple_languages_selected', { language_count: next.length })
      return next
    })
  }

  return (
    <div ref={calculatorRef} id="pricing-calculator" className="mt-12 scroll-mt-8 rounded-3xl border border-[#E4DDEE] bg-white p-5 shadow-xl shadow-violet-900/5 sm:p-8 lg:p-10">
      <div className="mx-auto max-w-3xl text-center">
        <h3 className="text-3xl font-bold text-gray-900 sm:text-4xl" style={{ fontFamily: "'EB Garamond', Georgia, serif" }}>Calculate the cost of translating your book</h3>
        <p className="mt-3 text-lg text-gray-600">Enter your manuscript’s word count and choose your languages to see your price, including any multi-language discount.</p>
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(300px,.85fr)]">
        <div className="min-w-0 space-y-8">
          <fieldset>
            <legend className="flex items-center gap-3 text-xl font-bold text-gray-900"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-sm text-white">1</span>Enter manuscript word count</legend>
            <label htmlFor="pricing-word-count" className="mt-5 block font-semibold text-gray-800">How many words are in your manuscript?</label>
            <input
              id="pricing-word-count"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="e.g. 72,000"
              value={wordCountInput}
              aria-invalid={Boolean(validationMessage)}
              aria-describedby={validationMessage ? 'pricing-word-error' : tier ? 'pricing-word-band' : undefined}
              onBlur={() => { setTouched(true); if (validWordCount) trackEvent('pricing_word_count_entered', { word_count: validWordCount }) }}
              onChange={event => setWordCountInput(event.target.value)}
              onKeyDown={event => { if (event.key === '-' || event.key === '+' || event.key === 'e' || event.key === 'E') event.preventDefault() }}
              className="mt-2 w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-lg text-gray-900 outline-none transition focus:border-brand focus:ring-4 focus:ring-violet-100"
            />
            {validationMessage && <p id="pricing-word-error" role="alert" className="mt-2 text-sm font-medium text-red-700">{validationMessage}</p>}
            {tier && <div id="pricing-word-band" className="mt-3 rounded-xl bg-[#F3F0F8] p-4"><p className="font-semibold text-gray-900">{tier.description}</p><p className="mt-1 font-bold text-brand">${tier.basePrice} per language</p></div>}
          </fieldset>

          <fieldset disabled={!validWordCount || overLimit} className="disabled:opacity-60">
            <legend className="flex items-center gap-3 text-xl font-bold text-gray-900"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-sm text-white">2</span>Choose target languages</legend>
            <p className="mt-5 font-semibold text-gray-800">Which languages would you like?</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {CORE_LANGUAGES.map(language => {
                const selected = selectedLanguages.includes(language.code)
                return <label key={language.code} className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 p-3 transition ${selected ? 'border-brand bg-[#F3F0F8]' : 'border-gray-200 hover:border-violet-300'}`}>
                  <input type="checkbox" checked={selected} onChange={() => toggleLanguage(language.code)} className="h-5 w-5 shrink-0 accent-violet-700" />
                  <span aria-hidden="true" className="text-2xl">{language.flag}</span>
                  <span className="min-w-0 flex-1 font-semibold text-gray-900">{language.name}</span>
                  {selected && <span className="font-bold text-brand" aria-label="Selected">✓</span>}
                </label>
              })}
            </div>
            <p className="mt-3 font-medium text-gray-700" aria-live="polite">
              {selectedLanguages.length === 0 ? 'No languages selected' : `${selectedLanguages.length} ${selectedLanguages.length === 1 ? 'language' : 'languages'} selected`}
              {' · '}{bundleDiscountPercent(selectedLanguages.length) ? `${bundleDiscountPercent(selectedLanguages.length)}% multi-language discount applied` : 'Standard price'}
            </p>
          </fieldset>
        </div>

        <aside className="min-w-0 rounded-2xl bg-gradient-to-br from-[#F3F0F8] to-amber-50 p-5 sm:p-7" aria-live="polite" aria-atomic="true">
          {overLimit ? <div>
            <h4 className="text-2xl font-bold text-gray-900">Your manuscript is over 150,000 words</h4>
            <p className="mt-3 text-gray-700">Please contact us for a tailored price.</p>
            <a href="mailto:hello@booklingua.io?subject=Tailored%20BookLingua%20translation%20quote" onClick={() => trackEvent('pricing_quote_requested', { word_count: validWordCount! })} className="mt-6 inline-flex w-full justify-center rounded-xl bg-brand px-6 py-3 font-bold text-white shadow-lg transition hover:shadow-xl">Request a quote</a>
          </div> : result ? <div>
            <h4 className="text-2xl font-bold text-gray-900">Your translation price</h4>
            <dl className="mt-5 space-y-3 text-sm sm:text-base">
              <div className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:gap-4"><dt className="text-gray-600">Manuscript</dt><dd className="font-semibold text-gray-900 sm:text-right">{validWordCount!.toLocaleString()} words</dd></div>
              <div className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:gap-4"><dt className="text-gray-600">Price band</dt><dd className="font-semibold text-gray-900 sm:text-right">{result.tier.bandLabel}</dd></div>
              <div className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:gap-4"><dt className="text-gray-600">Price per language</dt><dd className="font-semibold text-gray-900">{money.format(result.tier.basePrice)}</dd></div>
              <div className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:gap-4"><dt className="text-gray-600">{result.languageCount} languages × {money.format(result.tier.basePrice)}</dt><dd className="font-semibold text-gray-900">{money.format(result.subtotal)}</dd></div>
              <div className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:gap-4"><dt className="text-gray-600">Multi-language discount{result.discountPercent ? ` (${result.discountPercent}%)` : ''}</dt><dd className={`font-semibold ${result.discountPercent ? 'text-green-700' : 'text-gray-700'}`}>{result.discountPercent ? `−${money.format(result.discountAmount)}` : 'Not applicable'}</dd></div>
            </dl>
            <div className="mt-5 border-t border-violet-200 pt-5"><p className="text-sm font-semibold uppercase tracking-wide text-gray-600">Total</p><p className="mt-1 text-4xl font-bold text-brand sm:text-5xl">{money.format(result.total)}</p></div>
            <p className="mt-6 text-sm leading-6 text-gray-700">Your price includes BookLingua’s AI-assisted translation and editorial review, final translated files, and targeted review by a professional translator. We select passages that require particular care and ask the translator to review them for clarity, consistency, tone and readability. This is not a line-by-line proofread of the complete manuscript.</p>
            <button type="button" aria-expanded={reviewOpen} aria-controls="translator-review-details" onClick={() => { const next = !reviewOpen; setReviewOpen(next); if (next) trackEvent('translator_review_explanation_opened') }} className="mt-3 text-left font-semibold text-brand underline underline-offset-4">What does the professional translator review include?</button>
            {reviewOpen && <div id="translator-review-details" className="mt-3 space-y-3 text-sm leading-6 text-gray-700"><p>BookLingua identifies passages that are particularly difficult to translate—such as dialogue, humour, idioms, culturally specific references or sections where tone and meaning are especially important. Selected passages are reviewed by a professional translator for clarity, consistency, tone and readability.</p><p>Like any translated work, the finished book may retain some of the character and structure of its original language. Our aim is not to erase every trace of translation, but to produce a clear, consistent and enjoyable reading experience that remains faithful to the author’s original voice.</p><p>The professional translator reviews selected passages rather than proofreading the complete manuscript line by line.</p></div>}
            <button type="button" onClick={() => { trackEvent('pricing_start_translation_clicked', { word_count: validWordCount!, language_count: result.languageCount, discount_percent: result.discountPercent, total: result.total }); onStart({ wordCount: validWordCount!, languages: selectedLanguages, tier: result.tier.key, discountPercent: result.discountPercent, total: result.total }) }} className="mt-6 w-full rounded-xl bg-brand px-6 py-4 text-lg font-bold text-white shadow-lg transition hover:shadow-xl">Start your translation</button>
          </div> : <div className="flex min-h-56 flex-col items-center justify-center text-center"><span className="text-4xl" aria-hidden="true">📚</span><h4 className="mt-4 text-xl font-bold text-gray-900">Your translation price</h4><p className="mt-2 text-gray-600">Enter a valid word count and select at least one language to see the full breakdown.</p></div>}
        </aside>
      </div>
    </div>
  )
}
