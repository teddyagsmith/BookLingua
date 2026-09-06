import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Book Translation Pricing Calculator | BookLingua',
  description: 'Calculate your book translation price by manuscript word count and target languages, including automatic multi-language discounts.',
  alternates: { canonical: '/pricing' },
}

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children
}
