import Image from 'next/image'
import type { ReactNode } from 'react'

export default function SiteFooter({ note }: { note?: ReactNode }) {
  return (
    <footer className="bg-gray-900 text-gray-400 py-12">
      <div className="max-w-7xl mx-auto px-8 text-center">
        <Image
          src="/logo.png"
          alt="BookLingua"
          width={200}
          height={80}
          className="mx-auto mb-5 h-auto w-44 brightness-0 invert"
        />
        <p className="mb-2">
          Questions? Email us at{' '}
          <a href="mailto:hello@booklingua.io" className="text-amber-400 hover:text-amber-300 transition-colors">
            hello@booklingua.io
          </a>
        </p>
        <p>© 2026 BookLingua. All rights reserved.</p>
        {note && <div className="mt-2 text-xs text-gray-600">{note}</div>}
      </div>
    </footer>
  )
}
