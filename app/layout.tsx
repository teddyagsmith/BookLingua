import './globals.css'
import { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/next'
import Script from 'next/script'
import CookieConsent from '@/components/CookieConsent'

export const metadata: Metadata = {
  title: 'AI Book Translation Service — Translate & Publish in 6 Languages',
  description: 'AI book translation with AI editorial review and targeted review by a professional translator. Translate novels, non-fiction and series into Spanish, German, French, Italian, Portuguese, Polish and Japanese.',
  metadataBase: new URL('https://booklingua.io'),
  openGraph: {
    title: 'AI Book Translation Service — Translate & Publish in 6 Languages',
    description: 'AI book translation with AI editorial review and targeted review by a professional translator. Translate novels, non-fiction and series into Spanish, German, French, Italian, Portuguese, Polish and Japanese.',
    url: 'https://booklingua.io',
    siteName: 'BookLingua',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'BookLingua - AI Book Translation Service',
      },
    ],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI Book Translation Service — Translate & Publish in 6 Languages',
    description: 'AI book translation with AI editorial review and targeted review by a professional translator.',
    images: ['/og-image.png'],
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <Script
          src="https://analytics.ahrefs.com/analytics.js"
          data-key="Q6qxU43SYraWgkC2LWz2DQ"
          strategy="afterInteractive"
        />
      </head>
      <body>{children}<CookieConsent /><Analytics /></body>
    </html>
  )
}
