'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'

const serifFont = { fontFamily: "'EB Garamond', Georgia, serif" }

const excerpts = {
  English: 'I woke beneath a canopy of thorns, with the taste of blood on my tongue and the feeling that I had been running from something I could no longer remember.',
  Français: 'Je me suis réveillée sous une voûte d’épines, le goût du sang sur la langue et le sentiment d’avoir fui quelque chose dont je ne me souvenais plus.',
  Deutsch: 'Ich erwachte unter einem Baldachin aus Dornen, mit dem Geschmack von Blut auf der Zunge und dem Gefühl, vor etwas geflohen zu sein, an das ich mich nicht mehr erinnern konnte.',
}

type ExcerptLanguage = keyof typeof excerpts

const reviewerFindings = [
  {
    flag: '🇫🇷',
    title: 'French reviewer',
    scope: 'Chapters 1–3 reviewed',
    scores: [
      ['Overall', '4/5'],
      ['Genre feel', '4/5'],
      ['Voice', '4/5'],
    ],
    quote: 'The translation reads smoothly overall and establishes the dark fantasy atmosphere very well.',
    verdict: 'Would keep reading',
    strengths: 'Immersive atmosphere, consistent character voices, strong momentum and cohesive fantasy imagery across all three chapters.',
    refinement: 'The reviewer recommended a light stylistic pass for isolated phrases and metaphors that followed English structures too closely.',
  },
  {
    flag: '🇩🇪',
    title: 'German reviewer',
    scope: 'Chapters 1–3 reviewed',
    scores: [
      ['Overall', '4/5'],
      ['Genre feel', '5/5'],
      ['Voice', '4/5'],
    ],
    quote: 'The German reads fluently overall and has the atmosphere expected from a dark romantic/fantasy novel.',
    verdict: 'Would keep reading without hesitation',
    strengths: 'Strong pacing, emotional weight and language that feels at home in the romantasy genre.',
    refinement: 'The reviewer identified a small number of literal image descriptions and collocations to smooth before publication.',
  },
]

export default function CaseStudyMockup() {
  const [language, setLanguage] = useState<ExcerptLanguage>('English')

  return (
    <div className="min-h-screen bg-cream text-gray-900">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400&display=swap');`}</style>

      <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
        <Link href="/" className="font-bold text-brand-dark">← BookLingua</Link>
        <span className="rounded-full bg-brand-light px-4 py-2 text-xs font-bold uppercase tracking-wider text-brand-dark">Case study preview</span>
      </nav>

      <header className="relative overflow-hidden pb-20 pt-8">
        <div className="absolute left-0 top-10 h-72 w-72 rounded-full bg-amber-200/40 blur-3xl" />
        <div className="absolute right-0 top-20 h-96 w-96 rounded-full bg-brand-light/70 blur-3xl" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-6 lg:grid-cols-[1.15fr_.85fr]">
          <div>
            <p className="mb-4 text-sm font-bold uppercase tracking-[.2em] text-brand">Case study</p>
            <h1 className="mb-6 text-5xl font-bold leading-tight md:text-6xl" style={serifFont}>
              How we translated a complete romantasy manuscript into French and German
            </h1>
            <p className="max-w-2xl text-xl leading-relaxed text-gray-600">
              <em>Bride of the Hollow King</em> is a published gothic fae romance of approximately 38,000 words. We used BookLingua to prepare complete French and German manuscripts while preserving its invented world, atmosphere and romantic tension.
            </p>
            <dl className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                ['Original', 'English edition published'],
                ['Length', '≈38,000 words'],
                ['Languages', 'French + German'],
                ['Outputs', 'Manuscripts + launch packs'],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-brand-light bg-white/80 p-4 shadow-sm">
                  <dt className="text-xs font-bold uppercase tracking-wider text-gray-400">{label}</dt>
                  <dd className="mt-1 font-semibold text-gray-800">{value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="relative mx-auto h-[430px] w-full max-w-md">
            <div className="absolute left-0 top-16 h-80 w-56 -rotate-6 overflow-hidden rounded-2xl border border-blue-200 bg-blue-50 shadow-xl">
              <Image
                src="/images/case-studies/hollow-king/cover-fr.jpg"
                alt="French cover of L’Épouse du Roi Vide by T.S. Everly"
                fill
                className="object-cover"
                sizes="224px"
              />
            </div>
            <div className="absolute right-0 top-20 h-80 w-56 rotate-6 overflow-hidden rounded-2xl border border-amber-200 bg-amber-50 shadow-xl">
              <Image
                src="/images/case-studies/hollow-king/cover-de.jpg"
                alt="German cover of Braut des Höhlenkönigs by T.S. Everly"
                fill
                className="object-cover"
                sizes="224px"
              />
            </div>
            <div className="absolute left-1/2 top-0 h-96 w-64 -translate-x-1/2 overflow-hidden rounded-2xl bg-gray-950 shadow-2xl ring-4 ring-white">
              <Image
                src="/images/case-studies/hollow-king/cover-en.jpg"
                alt="English cover of Bride of the Hollow King by T.S. Everly"
                fill
                className="object-cover"
                sizes="256px"
                priority
              />
            </div>
          </div>
        </div>
      </header>

      <main>
        <section className="bg-white py-20">
          <div className="mx-auto max-w-6xl px-6">
            <div className="mx-auto mb-12 max-w-3xl text-center">
              <h2 className="text-4xl font-bold" style={serifFont}>Why this book was a useful test</h2>
              <p className="mt-4 text-lg leading-relaxed text-gray-600">Romantasy demands accuracy, a coherent invented world, natural dialogue and romantic scenes that still feel romantic.</p>
            </div>
            <div className="grid gap-6 md:grid-cols-3">
              {[
                ['♜', 'Invented world', 'Hollow Court, Hollow King, Blackthorn Wood and Thorn Throne need distinct, consistent translations.'],
                ['◐', 'Atmosphere and pace', 'The gothic imagery must remain vivid without making the prose heavy or overly literal.'],
                ['✦', 'Romantic tension', 'Character voice, rhythm and implication matter as much as the dictionary meaning.'],
              ].map(([icon, title, copy]) => (
                <article key={title} className="rounded-3xl border border-brand-light bg-cream p-8">
                  <span className="text-4xl text-brand">{icon}</span>
                  <h3 className="mt-5 text-2xl font-bold" style={serifFont}>{title}</h3>
                  <p className="mt-3 leading-relaxed text-gray-600">{copy}</p>
                </article>
              ))}
            </div>
            <p className="mt-7 text-center text-sm italic text-gray-500">Nobody wants a love scene that reads like a science experiment.</p>
          </div>
        </section>

        <section className="py-20">
          <div className="mx-auto max-w-6xl px-6">
            <h2 className="text-center text-4xl font-bold" style={serifFont}>From manuscript to translated editions</h2>
            <div className="mt-12 grid gap-5 md:grid-cols-4">
              {[
                ['1', 'Prepare', 'The English manuscript became the authoritative source.'],
                ['2', 'Translate and edit', 'Complete French and German manuscripts received a separate AI editorial pass.'],
                ['3', 'Review visibly', 'Review Documents showed proposed changes instead of applying them invisibly.'],
                ['4', 'Prepare to launch', 'Each market received copy, keywords, category suggestions and an upload checklist.'],
              ].map(([number, title, copy]) => (
                <div key={number} className="relative rounded-3xl bg-white p-7 shadow-sm ring-1 ring-brand-light">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand font-bold text-white">{number}</span>
                  <h3 className="mt-5 text-xl font-bold" style={serifFont}>{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-gray-600">{copy}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-white py-20">
          <div className="mx-auto max-w-4xl px-6">
            <div className="text-center">
              <p className="text-sm font-bold uppercase tracking-wider text-brand">Real opening excerpt</p>
              <h2 className="mt-2 text-4xl font-bold" style={serifFont}>Show the translation</h2>
              <p className="mt-4 text-gray-600">The opening had to establish the same danger, mystery and missing memory in all three languages.</p>
            </div>
            <div className="mt-10 overflow-hidden rounded-3xl border border-brand-light shadow-xl">
              <div role="tablist" aria-label="Excerpt language" className="flex border-b border-brand-light bg-[#F3F0F8] p-2">
                {(Object.keys(excerpts) as ExcerptLanguage[]).map((item) => (
                  <button
                    key={item}
                    type="button"
                    role="tab"
                    aria-selected={language === item}
                    onClick={() => setLanguage(item)}
                    className={`flex-1 rounded-xl px-4 py-3 text-sm font-bold transition ${language === item ? 'bg-white text-brand-dark shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
                  >
                    {item}
                  </button>
                ))}
              </div>
              <div className="bg-white p-8 md:p-12">
                {(Object.entries(excerpts) as [ExcerptLanguage, string][]).map(([item, text]) => (
                  <blockquote key={item} role="tabpanel" hidden={language !== item} className="text-2xl leading-relaxed text-gray-800" style={serifFont}>
                    “{text}”
                  </blockquote>
                ))}
                <p className="mt-8 border-t border-gray-100 pt-5 text-sm text-gray-500">The thorns, blood, flight and missing memory all arrive in the same opening beat.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="py-20">
          <div className="mx-auto max-w-6xl px-6">
            <div className="text-center">
              <h2 className="text-4xl font-bold" style={serifFont}>What the author receives</h2>
              <p className="mx-auto mt-4 max-w-2xl text-gray-600">Supporting files make it possible to review the work and prepare each manuscript for its market.</p>
              <div className="mt-4 flex justify-center gap-2"><span>🇫🇷</span><span>🇩🇪</span></div>
            </div>
            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ['/images/case-studies/hollow-king/final-manuscript-fr.png', 'Final manuscript', 'A clean French or German manuscript.'],
                ['/images/case-studies/hollow-king/review-document-fr.png', 'Review Document', 'AI editorial changes shown in context.'],
                ['/images/case-studies/hollow-king/translation-notes-fr.png', 'Translation notes', 'Selected terminology and language decisions.'],
                ['/images/case-studies/hollow-king/final-manuscript-fr.png', 'Launch Pack', 'Description, keywords, categories, pricing and upload checklist.'],
              ].map(([image, title, copy]) => (
                <article key={title} className="overflow-hidden rounded-3xl border border-brand-light bg-white shadow-sm">
                  <div className="relative h-44 overflow-hidden bg-gray-100">
                    <Image src={image} alt="" fill className="object-cover object-top" sizes="(max-width: 768px) 100vw, 25vw" />
                    <div className="absolute inset-0 bg-gradient-to-t from-white/60 to-transparent" />
                  </div>
                  <div className="p-6">
                    <h3 className="text-xl font-bold" style={serifFont}>{title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-gray-600">{copy}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-white py-20">
          <div className="mx-auto max-w-5xl px-6">
            <div className="text-center">
              <p className="text-sm font-bold uppercase tracking-wider text-emerald-700">Native-language review</p>
              <h2 className="mt-2 text-4xl font-bold" style={serifFont}>Human reviewer findings</h2>
              <p className="mx-auto mt-4 max-w-3xl text-gray-600">Native French and German reviewers assessed whether the manuscripts read naturally, preserved the atmosphere and used fantasy terminology consistently. Both said they would keep reading.</p>
            </div>
            <div className="mt-12 grid gap-6 md:grid-cols-2">
              {reviewerFindings.map((review) => (
                <article key={review.title} className="rounded-3xl border border-emerald-200 bg-emerald-50 p-8 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">{review.flag}</span>
                      <div>
                        <h3 className="text-2xl font-bold" style={serifFont}>{review.title}</h3>
                        <p className="mt-1 text-sm text-gray-500">{review.scope}</p>
                      </div>
                    </div>
                    <span className="rounded-full bg-emerald-700 px-3 py-1 text-xs font-bold text-white">Keep reading</span>
                  </div>
                  <dl className="mt-7 grid grid-cols-3 gap-3">
                    {review.scores.map(([label, score]) => (
                      <div key={label} className="rounded-2xl bg-white p-3 text-center ring-1 ring-emerald-100">
                        <dt className="text-xs font-semibold text-gray-500">{label}</dt>
                        <dd className="mt-1 text-xl font-bold text-emerald-800">{score}</dd>
                      </div>
                    ))}
                  </dl>
                  <blockquote className="mt-7 border-l-4 border-emerald-500 pl-5 text-xl leading-relaxed text-gray-800" style={serifFont}>
                    “{review.quote}”
                  </blockquote>
                  <p className="mt-5 font-semibold text-emerald-900">✓ {review.verdict}</p>
                  <div className="mt-6 space-y-4 text-sm leading-relaxed text-gray-600">
                    <p><strong className="text-gray-800">What worked:</strong> {review.strengths}</p>
                    <p><strong className="text-gray-800">What to refine:</strong> {review.refinement}</p>
                  </div>
                </article>
              ))}
            </div>
            <p className="mx-auto mt-8 max-w-3xl text-center text-sm leading-relaxed text-gray-500">The scores and quotations above come from independent native-language reader-panel feedback. The reviewers also flagged specific phrases for final editorial refinement rather than giving an unqualified pass.</p>
          </div>
        </section>

        <section className="bg-[#F3F0F8] py-20">
          <div className="mx-auto max-w-4xl px-6 text-center">
            <p className="text-lg font-semibold text-brand-dark">One published English novella. Two complete translated manuscripts.</p>
            <h2 className="mt-4 text-4xl font-bold md:text-5xl" style={serifFont}>Could your book reach readers in another language?</h2>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-gray-600">Upload your manuscript to see exactly what it would cost to translate with BookLingua.</p>
            <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link href="/" className="rounded-2xl bg-brand px-8 py-4 font-bold text-white shadow-lg">Upload your book</Link>
              <Link href="/examples" className="font-semibold text-brand-dark underline underline-offset-4">See more translation examples</Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
