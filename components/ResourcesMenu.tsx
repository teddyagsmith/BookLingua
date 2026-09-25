import Link from 'next/link'

export default function ResourcesMenu({ className = '' }: { className?: string }) {
  return (
    <details className={`group relative z-[100] ${className}`}>
      <summary className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700 shadow-sm transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 sm:h-auto sm:w-auto sm:rounded-none sm:border-0 sm:bg-transparent sm:shadow-none sm:hover:bg-transparent sm:focus:ring-0 sm:focus:ring-offset-0 [&::-webkit-details-marker]:hidden">
        <span className="sr-only sm:not-sr-only">Resources</span>
        <span aria-hidden="true" className="hidden text-xs sm:ml-1 sm:inline">▾</span>
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 sm:hidden" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </summary>
      <div className="absolute right-0 top-full z-[100] mt-3 w-56 rounded-2xl border border-[#EBE6F4] bg-white p-2 shadow-xl sm:left-1/2 sm:right-auto sm:-translate-x-1/2">
        <Link href="/blog?category=translation-advice" className="block rounded-xl px-4 py-3 text-sm font-medium text-gray-700 hover:bg-brand-light hover:text-brand-dark">
          Translation Advice
        </Link>
        <Link href="/blog?category=using-booklingua" className="block rounded-xl px-4 py-3 text-sm font-medium text-gray-700 hover:bg-brand-light hover:text-brand-dark">
          Using BookLingua
        </Link>
        <Link href="/case-studies/ai-book-translation-hollow-king" className="block rounded-xl px-4 py-3 text-sm font-medium text-gray-700 hover:bg-brand-light hover:text-brand-dark">
          Case Studies
        </Link>
        <div className="my-1 border-t border-gray-100 sm:hidden" />
        <Link href="/pricing" className="block rounded-xl px-4 py-3 text-sm font-medium text-gray-700 hover:bg-brand-light hover:text-brand-dark sm:hidden">
          Pricing
        </Link>
        <Link href="/examples" className="block rounded-xl px-4 py-3 text-sm font-medium text-gray-700 hover:bg-brand-light hover:text-brand-dark sm:hidden">
          Examples
        </Link>
        <Link href="/publishers" className="block rounded-xl px-4 py-3 text-sm font-medium text-gray-700 hover:bg-brand-light hover:text-brand-dark sm:hidden">
          Publishers
        </Link>
      </div>
    </details>
  )
}
