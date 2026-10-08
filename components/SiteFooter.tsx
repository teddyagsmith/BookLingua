import Image from 'next/image'
import Link from 'next/link'
import type { ReactNode } from 'react'
import CookieSettingsButton from './CookieSettingsButton'

export default function SiteFooter({ note }: { note?: ReactNode }) {
  return (
    <footer className="bg-gray-900 text-gray-400 py-12">
      <div className="max-w-7xl mx-auto px-8 text-center">
        <Image
          src="/logo-dark-bg.png"
          alt="BookLingua"
          width={358}
          height={82}
          className="mx-auto mb-5 h-auto w-52 max-w-full object-contain"
        />
        <p className="mb-2">
          Questions? Email us at{' '}
          <a href="mailto:hello@booklingua.io" className="text-amber-400 hover:text-amber-300 transition-colors">
            hello@booklingua.io
          </a>
        </p>
        <a
          href="https://www.facebook.com/BookLinguaBooks"
          target="_blank"
          rel="noopener noreferrer"
          className="mb-4 inline-flex items-center gap-2 text-sm text-gray-400 transition-colors hover:text-white"
          aria-label="Follow BookLingua on Facebook"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-current">
            <path d="M22 12a10 10 0 1 0-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.51 1.5-3.9 3.79-3.9 1.1 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.77l-.44 2.89h-2.33v6.99A10 10 0 0 0 22 12Z" />
          </svg>
          Follow BookLingua on Facebook
        </a>
        <nav aria-label="Footer" className="mb-3 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm">
          <Link href="/manuscript-security" className="hover:text-white transition-colors">Manuscript security</Link>
          <Link href="/privacy" className="hover:text-white transition-colors">Privacy</Link>
          <Link href="/terms" className="hover:text-white transition-colors">Terms</Link>
          <Link href="/cookies" className="hover:text-white transition-colors">Cookies</Link>
          <CookieSettingsButton />
          <Link href="/affiliates" className="hover:text-white transition-colors">Affiliate Programme</Link>
        </nav>
        <p>© 2026 BookLingua. All rights reserved.</p>
        {note && <div className="mt-2 text-xs text-gray-600">{note}</div>}
      </div>
    </footer>
  )
}
