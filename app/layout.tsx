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
        <Script id="meta-pixel" strategy="afterInteractive">
          {`
            !function(f,b,e,v,n,t,s)
            {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
            n.callMethod.apply(n,arguments):n.queue.push(arguments)};
            if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
            n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];
            s.parentNode.insertBefore(t,s)}(window, document,'script',
            'https://connect.facebook.net/en_US/fbevents.js');
            fbq('init', '1067674185897808');
            fbq('track', 'PageView');
          `}
        </Script>
      </head>
      <body>
        <noscript>
          <img
            height="1"
            width="1"
            style={{ display: 'none' }}
            src="https://www.facebook.com/tr?id=1067674185897808&ev=PageView&noscript=1"
            alt=""
          />
        </noscript>
        {children}
        <CookieConsent />
        <Analytics />
      </body>
    </html>
  )
}
