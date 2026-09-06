import Link from 'next/link'

export default function ResourcesMenu({ className = '' }: { className?: string }) {
  return (
    <details className={`group relative hidden sm:block ${className}`}>
      <summary className="cursor-pointer list-none text-gray-600 hover:text-brand-dark font-medium transition-colors [&::-webkit-details-marker]:hidden">
        Resources <span aria-hidden="true" className="text-xs">▾</span>
      </summary>
      <div className="absolute left-1/2 top-full z-50 mt-3 w-56 -translate-x-1/2 rounded-2xl border border-[#EBE6F4] bg-white p-2 shadow-xl">
        <Link href="/blog?category=translation-advice" className="block rounded-xl px-4 py-3 text-sm font-medium text-gray-700 hover:bg-brand-light hover:text-brand-dark">
          Translation Advice
        </Link>
        <Link href="/blog?category=using-booklingua" className="block rounded-xl px-4 py-3 text-sm font-medium text-gray-700 hover:bg-brand-light hover:text-brand-dark">
          Using BookLingua
        </Link>
        <Link href="/pricing#calculator" className="block rounded-xl px-4 py-3 text-sm font-medium text-gray-700 hover:bg-brand-light hover:text-brand-dark">
          Price Calculator
        </Link>
      </div>
    </details>
  )
}
