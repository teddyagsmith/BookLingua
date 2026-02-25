import './globals.css'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'BookLingua - Professional Book Translation for Authors',
  description: 'AI-powered book translation with editorial review. Translate your romance novel into Spanish, French, German, and Portuguese.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
