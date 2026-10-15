const steps = [
  ['1', 'Your instructions', 'Complete a translation brief explaining your book’s style, terminology and preferences.'],
  ['2', 'Cultural scan', 'Flag measurements, references, names and expressions that may need a decision.'],
  ['3', 'AI translation', 'Translate the full manuscript using its structure, your brief and consistent terminology.'],
  ['4', 'Editorial review', 'A separate AI pass checks voice, natural phrasing, consistency and completeness.'],
  ['5', 'Professional check', 'A professional translator reviews selected passages where human judgement adds most value.'],
  ['6', 'Your finished files', 'Receive the translated book, review evidence and the materials included in your order.'],
]

export default function BookLinguaProcess() {
  return (
    <figure className="not-prose my-10 rounded-3xl border border-[#DDD6EC] bg-gradient-to-br from-[#F8F5EE] to-[#F3F0F8] p-5 shadow-sm sm:p-8">
      <figcaption className="mb-6 text-center font-serif text-2xl font-bold text-gray-900 sm:text-3xl">
        How your book moves through BookLingua
      </figcaption>
      <ol className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {steps.map(([number, title, description], index) => (
          <li key={title} className="relative rounded-2xl border border-white/80 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#7B6CA8] font-bold text-white">{number}</span>
              <h3 className="text-base font-bold text-gray-900">{title}</h3>
            </div>
            <p className="text-sm leading-relaxed text-gray-600">{description}</p>
            {index < steps.length - 1 && <span className="absolute -bottom-3 left-1/2 z-10 text-lg text-[#7B6CA8] md:hidden" aria-hidden="true">↓</span>}
          </li>
        ))}
      </ol>
      <p className="mt-5 text-center text-xs leading-relaxed text-gray-500">
        The professional translator review covers selected passages, not a full line-by-line proofread of the manuscript.
      </p>
    </figure>
  )
}
