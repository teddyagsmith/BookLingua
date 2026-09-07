'use client'

import Link from 'next/link'
import { MouseEvent, useRef } from 'react'

export default function ResourcesMenu({ className = '', priceCalculatorHref = '/pricing' }: { className?: string; priceCalculatorHref?: string }) {
  const menuRef = useRef<HTMLDetailsElement>(null)

  const openPriceCalculator = (event: MouseEvent<HTMLAnchorElement>) => {
    menuRef.current?.removeAttribute('open')

    if (priceCalculatorHref === '#calculator') {
      event.preventDefault()
      document.getElementById('calculator')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      window.history.replaceState(null, '', '#calculator')
    }
  }

  return (
    <details ref={menuRef} className={`group relative hidden sm:block ${className}`}>
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
        <a href={priceCalculatorHref} onClick={openPriceCalculator} className="block rounded-xl px-4 py-3 text-sm font-medium text-gray-700 hover:bg-brand-light hover:text-brand-dark">
          Price Calculator
        </a>
      </div>
    </details>
  )
}
