import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Thanks | BookLingua',
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
      noarchive: true,
      nosnippet: true,
    },
  },
}

export default function ThanksLayout({ children }: { children: React.ReactNode }) {
  return children
}
