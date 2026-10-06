import type { Metadata } from 'next'
import { LegalList, LegalPage, LegalSection } from '@/components/LegalPage'

export const metadata: Metadata = {
  title: 'Cookie Policy | BookLingua',
  description: 'How BookLingua uses essential storage, analytics cookies and affiliate-attribution cookies, and how to control them.',
  alternates: { canonical: '/cookies' },
}

export default function CookiePolicyPage() {
  return (
    <LegalPage eyebrow="Legal" title="Cookie Policy" introduction="This policy explains the cookies and similar browser storage used on BookLingua and the choices available to you.">
      <LegalSection title="What cookies are">
        <p>Cookies are small text files stored by your browser. Similar technologies, such as local storage, can remember a preference or referral without placing a traditional cookie.</p>
      </LegalSection>
      <LegalSection title="Essential storage">
        <p>BookLingua uses local browser storage to remember your cookie choice. Checkout and payment providers may also use strictly necessary technologies for security, fraud prevention and completion of a transaction. These functions cannot be switched off through our optional-cookie control.</p>
      </LegalSection>
      <LegalSection title="Optional analytics">
        <p>If you accept optional cookies, Google Analytics may set cookies such as <code>_ga</code> and <code>_ga_*</code> to distinguish visits and help us understand how the website is used. IP anonymisation is enabled in our Google Analytics configuration.</p>
        <p>BookLingua also uses Vercel Web Analytics and Ahrefs Web Analytics. These services are configured as cookie-free site-measurement tools, although they receive limited technical request information needed to provide analytics and security.</p>
      </LegalSection>
      <LegalSection title="Affiliate attribution">
        <p>If you accept optional cookies and arrive through an affiliate link, RevShare records the referral so the correct affiliate can receive credit. It may use first-party cookies including identifiers beginning <code>revshare_ref_</code>, <code>revshare_last_</code> and <code>revshare_cid_</code>, plus local storage used for visit history. BookLingua configures a 30-day attribution period.</p>
      </LegalSection>
      <LegalSection title="Your choices">
        <LegalList>
          <li>Choose “Essential only” in the cookie notice to prevent Google Analytics and RevShare from loading.</li>
          <li>Choose “Accept optional cookies” to allow analytics and affiliate attribution.</li>
          <li>Use “Cookie settings” in the footer at any time to change your choice.</li>
          <li>You can also delete or block cookies and local storage through your browser settings. Blocking some necessary provider technologies may affect checkout.</li>
        </LegalList>
        <p>Changing your choice stops future optional tracking on BookLingua. You can use your browser controls to remove cookies already stored.</p>
      </LegalSection>
      <LegalSection title="Contact">
        <p>Questions about cookies or personal data can be sent to <a className="font-semibold text-brand-dark underline" href="mailto:privacy@booklingua.io">privacy@booklingua.io</a>.</p>
      </LegalSection>
    </LegalPage>
  )
}
