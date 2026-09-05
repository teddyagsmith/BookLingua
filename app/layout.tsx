import './globals.css'
import { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/next'
import Script from 'next/script'

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
          src="https://www.revshare.so/tracking.js"
          strategy="afterInteractive"
          data-program-id="6a5a0eae6e5359ccacaa24b1"
          data-domain=".booklingua.io"
          data-cookie-duration="30"
        />
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-WCQNKFL9ZH"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-WCQNKFL9ZH');
          `}
        </Script>
      </head>
      <body>{children}<Analytics /></body>
    </html>
  )
}
