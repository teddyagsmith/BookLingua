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
        <div className="mb-4 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm">
          <a
            href="https://www.facebook.com/BookLinguaBooks"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-gray-400 transition-colors hover:text-white"
            aria-label="Follow BookLingua on Facebook"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-current">
              <path d="M22 12a10 10 0 1 0-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.51 1.5-3.9 3.79-3.9 1.1 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.77l-.44 2.89h-2.33v6.99A10 10 0 0 0 22 12Z" />
            </svg>
            Facebook
          </a>
          <a
            href="https://www.linkedin.com/company/booklingua/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-gray-400 transition-colors hover:text-white"
            aria-label="Follow BookLingua on LinkedIn"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-current">
              <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.34V8.98h3.42v1.57h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.29ZM5.32 7.41a2.07 2.07 0 1 1 0-4.13 2.07 2.07 0 0 1 0 4.13ZM7.1 20.45H3.54V8.98H7.1v11.47ZM22.23 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.46c.98 0 1.77-.77 1.77-1.73V1.73C24 .77 23.21 0 22.23 0Z" />
            </svg>
            LinkedIn
          </a>
        </div>
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
