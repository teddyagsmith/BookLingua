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
    reportHref: '/files/case-studies/hollow-king/french-human-review.pdf',
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
    reportHref: '/files/case-studies/hollow-king/german-human-review.pdf',
  },
]

const deliveryItems = [
  {
    icon: 'DOCX',
    title: 'Final DOCX',
    copy: 'The clean, editable translation used for personal edits, print formatting or importing into Atticus or Vellum.',
  },
  {
    icon: 'EPUB',
    title: 'Final EPUB',
    copy: 'The ready-made ebook file, with chapter structure and navigation preserved for previewing and publication.',
  },
  {
    icon: 'EDIT',
    title: 'Review DOCX',
    copy: 'The AI editorial changes shown visibly in context, including the wording considered and the accepted replacement.',
  },
  {
    icon: 'MAP',
    title: 'Chapter Map',
    copy: 'A section-by-section map connecting the original headings with the translated edition.',
  },
  {
    icon: 'NOTES',
    title: 'Translation Notes',
    copy: 'Selected explanations covering terminology, voice, localisation and important language decisions.',
  },
  {
    icon: 'HUMAN',
    title: 'Professional translator reports',
    copy: 'Independent native-language feedback on selected passages, including scores, strengths and specific refinements.',
    links: [
      ['View French report', '/files/case-studies/hollow-king/french-human-review.pdf'],
      ['View German report', '/files/case-studies/hollow-king/german-human-review.pdf'],
    ],
  },
  {
    icon: 'LAUNCH',
    title: 'Launch Packs',
    copy: 'Market-specific descriptions, keywords, categories, pricing guidance and practical 30-day launch plans.',
    links: [
      ['View French Launch Pack', '/files/case-studies/hollow-king/french-launch-pack.pdf'],
      ['View German Launch Pack', '/files/case-studies/hollow-king/german-launch-pack.pdf'],
    ],
  },
  {
    icon: 'GUIDE',
    title: 'Upload Guide',
    copy: 'Step-by-step guidance for reviewing the files, formatting the book and publishing through platforms such as Amazon KDP.',
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
              AI Book Translation Case Study: A Romantasy Novel in French and German
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
            <p className="text-sm font-bold uppercase tracking-wider text-brand">The complete-book test</p>
            <h2 className="mt-2 text-4xl font-bold" style={serifFont}>Can AI translate a complete novel?</h2>
            <div className="mt-7 space-y-5 text-lg leading-relaxed text-gray-600">
              <p>
                AI can translate a complete novel, but generating a first draft is not the same as producing a manuscript that is ready for readers. A novel has to remain coherent across tens of thousands of words: names, invented places, recurring imagery, character voices and romantic tension all need to survive from the opening chapter to the final scene.
              </p>
              <p>
                For this 38,000-word romantasy novel, BookLingua treated the English edition as the authoritative source and produced full French and German translations. The system carried the same terminology and stylistic instructions through the manuscript rather than translating isolated pages without context. This was particularly important for terms such as Hollow Court, Hollow King, Blackthorn Wood and Thorn Throne, which needed deliberate and consistent treatment in each language.
              </p>
              <p>
                The result demonstrates what AI book translation can do well: process an entire manuscript efficiently while preserving plot, atmosphere and momentum. It also demonstrates why editorial review still matters. The first translation was the beginning of the process, not the finished product.
              </p>
            </div>
          </div>
        </section>

        <section className="py-20">
          <div className="mx-auto max-w-5xl px-6">
            <div className="text-center">
              <p className="text-sm font-bold uppercase tracking-wider text-brand">Translation and refinement</p>
              <h2 className="mt-2 text-4xl font-bold" style={serifFont}>How the two-pass editing process worked</h2>
            </div>
            <div className="mt-12 grid gap-6 md:grid-cols-2">
              <article className="rounded-3xl border border-brand-light bg-white p-8 shadow-sm">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand font-bold text-white">1</span>
                <h3 className="mt-5 text-2xl font-bold" style={serifFont}>Complete manuscript translation</h3>
                <p className="mt-3 leading-relaxed text-gray-600">
                  The first pass translated the complete English manuscript into French and German using genre-aware instructions. It prioritised meaning, continuity and the dark romantic tone while keeping names and invented-world terminology consistent.
                </p>
              </article>
              <article className="rounded-3xl border border-brand-light bg-white p-8 shadow-sm">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand font-bold text-white">2</span>
                <h3 className="mt-5 text-2xl font-bold" style={serifFont}>Separate editorial pass</h3>
                <p className="mt-3 leading-relaxed text-gray-600">
                  A second pass reviewed the translations as fiction, looking for prose that was accurate but too literal, awkward collocations, inconsistent terminology and dialogue or imagery that did not sound natural in the target language. Suggested changes were shown visibly in Review Documents.
                </p>
              </article>
            </div>
            <div className="mt-8 rounded-3xl border border-amber-200 bg-amber-50 p-8">
              <h3 className="text-2xl font-bold" style={serifFont}>What the professional reviewers changed</h3>
              <div className="mt-4 space-y-4 leading-relaxed text-gray-700">
                <p>
                  Native French and German professionals then reviewed the opening three chapters. The French reviewer found that some isolated phrases and metaphors followed English sentence structures too closely. The German reviewer highlighted a small number of literal image descriptions and unnatural word combinations. These were not plot errors; they were the kinds of details that distinguish understandable prose from natural genre fiction.
                </p>
                <p>
                  BookLingua acted on that feedback before producing the final manuscripts. Literal constructions were recast to sound natural in French or German, awkward combinations were smoothed, and recurring fantasy terms were checked for consistency. The corrections were applied beyond the sampled passages wherever the same pattern appeared, then incorporated into the clean final files. This feedback loop—translate, edit, obtain native-language review and correct—is the important difference between accepting raw AI output and preparing a book for publication.
                </p>
              </div>
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

        <section className="py-20" id="delivery-package">
          <div className="mx-auto max-w-6xl px-6">
            <div className="text-center">
              <h2 className="text-4xl font-bold" style={serifFont}>What the author receives</h2>
              <p className="mx-auto mt-4 max-w-3xl text-gray-600">Each language comes with a complete delivery package—not just a translated manuscript. The supporting files make the work transparent and help the author prepare the new edition for publication.</p>
              <div className="mt-4 flex justify-center gap-2"><span>🇫🇷</span><span>🇩🇪</span></div>
            </div>
            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {deliveryItems.map((item) => (
                <article key={item.title} className="flex flex-col rounded-3xl border border-brand-light bg-white p-6 shadow-sm">
                  <span className="inline-flex w-fit rounded-lg bg-brand-light px-3 py-1.5 text-[11px] font-bold tracking-wider text-brand-dark">{item.icon}</span>
                  <h3 className="mt-5 text-xl font-bold" style={serifFont}>{item.title}</h3>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-gray-600">{item.copy}</p>
                  {item.links && (
                    <div className="mt-5 space-y-2 border-t border-brand-light pt-4">
                      {item.links.map(([label, href]) => (
                        <a key={href} href={href} target="_blank" rel="noreferrer" className="block text-sm font-bold text-brand-dark underline underline-offset-4">
                          {label} ↗
                        </a>
                      ))}
                    </div>
                  )}
                </article>
              ))}
            </div>
            <p className="mx-auto mt-10 max-w-3xl text-center text-gray-600">
              Read the <Link href="/blog/understanding-your-booklingua-delivery-package" className="font-semibold text-brand-dark underline underline-offset-4">complete delivery-package guide</Link> for a detailed explanation of every file and how to use it.
            </p>
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
                    <p><strong className="text-gray-800">Targeted refinements:</strong> {review.refinement}</p>
                  </div>
                  <a href={review.reportHref} target="_blank" rel="noreferrer" className="mt-7 inline-flex rounded-xl bg-emerald-700 px-5 py-3 text-sm font-bold text-white shadow-sm">
                    View the full {review.title.toLowerCase()} report ↗
                  </a>
                </article>
              ))}
            </div>
            <p className="mx-auto mt-8 max-w-3xl text-center text-sm leading-relaxed text-gray-500">The scores and quotations above come from independent native-language feedback. Both reviewers found the translations enjoyable and suitable for the genre while identifying a limited number of phrases for targeted refinement. BookLingua reviewed those findings and incorporated the relevant corrections into the final manuscripts.</p>
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

        <section className="bg-white py-20">
          <div className="mx-auto max-w-4xl px-6">
            <div className="text-center">
              <p className="text-sm font-bold uppercase tracking-wider text-brand">Frequently asked questions</p>
              <h2 className="mt-2 text-4xl font-bold" style={serifFont}>AI book translation FAQ</h2>
            </div>
            <div className="mt-10 space-y-5">
              {[
                ['Can AI translate a whole book?', 'Yes. AI can translate a complete manuscript, but a book-length project needs consistent terminology, genre-aware instructions and a separate editorial review. Raw machine output should not be treated as a publication-ready novel.'],
                ['How accurate is AI book translation?', 'It can be highly accurate for meaning and plot, but literary quality also depends on voice, rhythm, dialogue and cultural context. In this case, both native-language reviewers scored the translations 4/5 overall and said they would keep reading, while still identifying phrases that benefited from refinement.'],
                ['Does an AI-translated novel still need human review?', 'Yes. Professional native-language review helps identify literal phrasing and stylistic issues that an automated process may miss. BookLingua used the reviewers’ feedback to correct the final French and German manuscripts.'],
                ['How much does it cost to translate a 38,000-word book?', 'BookLingua’s current small-book tier covers manuscripts up to 40,000 words from $99 per language. The exact total depends on the number of languages and any optional extras; use the pricing calculator for a current quote.'],
              ].map(([question, answer]) => (
                <article key={question} className="rounded-2xl border border-brand-light bg-cream p-6">
                  <h3 className="text-xl font-bold" style={serifFont}>{question}</h3>
                  <p className="mt-2 leading-relaxed text-gray-600">{answer}</p>
                </article>
              ))}
            </div>
            <p className="mt-8 text-center text-gray-600">
              Read our <Link href="/blog/how-to-translate-a-book-with-ai" className="font-semibold text-brand-dark underline">complete AI book translation guide</Link> or <Link href="/pricing" className="font-semibold text-brand-dark underline">calculate the cost of your manuscript</Link>.
            </p>
            <p className="mt-4 text-center text-gray-600">
              You can also read the <Link href="/blog/can-ai-translate-a-novel" className="font-semibold text-brand-dark underline">full analysis of what this novel test taught us</Link>, explore the challenges of <Link href="/blog/can-ai-translate-romance-novels" className="font-semibold text-brand-dark underline">translating romance and romantasy</Link>, or follow the <Link href="/blog/how-to-publish-translated-book-amazon-kdp" className="font-semibold text-brand-dark underline">Amazon KDP publishing guide</Link> used for the German edition.
            </p>
          </div>
        </section>
      </main>
    </div>
  )
}
