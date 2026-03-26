import './globals.css'
import { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/next'

export const metadata: Metadata = {
  title: 'BookLingua - Professional Book Translation for Authors',
  description: 'AI-powered book translation with editorial review. From $99 per language. Translate your book into Spanish, French, German, Portuguese and more — in hours, not months.',
  metadataBase: new URL('https://booklingua.io'),
  openGraph: {
    title: 'BookLingua - Professional Book Translation for Authors',
    description: 'AI-powered book translation with editorial review. From $99 per language. Translate your book into Spanish, French, German, Portuguese and more — in hours, not months.',
    url: 'https://booklingua.io',
    siteName: 'BookLingua',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'BookLingua - Professional Book Translation',
      },
    ],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'BookLingua - Professional Book Translation for Authors',
    description: 'AI-powered book translation with editorial review. From $99 per language.',
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
      <body>{children}<Analytics /></body>
    </html>
  )
}
