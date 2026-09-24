import type { Metadata } from 'next'
import { LegalList, LegalPage, LegalSection } from '@/components/LegalPage'

export const metadata: Metadata = {
  title: 'Privacy Policy | BookLingua',
  description: 'How BookLingua collects, uses, shares and protects personal data.',
  alternates: { canonical: '/privacy' },
}

export default function PrivacyPage() {
  return (
    <LegalPage eyebrow="Legal" title="Privacy Policy" introduction="This policy explains how BookLingua handles personal data when you visit our website, join our mailing list, contact us or place an order.">
      <LegalSection title="Who is responsible for your data">
        <p>BookLingua is operated by Hykke Ltd, which is the controller of personal data described in this policy.</p>
        <p>Hykke Ltd<br />123 Hallgate<br />Cottingham<br />East Riding of Yorkshire<br />HU16 4DA<br />United Kingdom</p>
        <p>Questions and privacy requests can be sent to <a className="font-semibold text-brand-dark underline" href="mailto:privacy@booklingua.io">privacy@booklingua.io</a>.</p>
      </LegalSection>
      <LegalSection title="Information we collect">
        <LegalList>
          <li><strong>Order information:</strong> name, email address, book title, genre, selected languages, instructions, order value and order status.</li>
          <li><strong>Manuscript information:</strong> uploaded files, extracted text, translation choices, terminology decisions and generated deliverables.</li>
          <li><strong>Payment information:</strong> Stripe processes card details. BookLingua receives payment status, transaction identifiers and limited billing information, not your full card number.</li>
          <li><strong>Communications:</strong> messages, feedback and support history.</li>
          <li><strong>Newsletter information:</strong> email address, signup source, delivery and engagement information.</li>
          <li><strong>Website information:</strong> device, browser, pages visited, referral source and similar usage information where optional analytics are accepted.</li>
        </LegalList>
      </LegalSection>
      <LegalSection title="Why we use it">
        <LegalList>
          <li>to provide the translation service, fulfil orders and deliver files;</li>
          <li>to process payments and prevent fraud;</li>
          <li>to answer enquiries and resolve quality or support issues;</li>
          <li>to send service emails and, where permitted, requested marketing emails;</li>
          <li>to understand and improve website performance; and</li>
          <li>to meet legal, accounting and security obligations.</li>
        </LegalList>
        <p>Depending on the activity, we rely on performance of a contract, legitimate interests, legal obligations or consent.</p>
      </LegalSection>
      <LegalSection title="Service providers and international transfers">
        <p>We use specialist providers to operate BookLingua. These currently include Anthropic for AI processing; Supabase for database and file storage; Stripe for payments; Vercel for website hosting and privacy-focused site analytics; Resend for transactional email; Google Analytics and Ahrefs for website analytics; RevShare for affiliate attribution and administration; and Inngest for background workflow processing.</p>
        <p>Some providers process data outside your country, including in the United States. Where required, we rely on appropriate contractual safeguards or other lawful transfer mechanisms offered by those providers.</p>
      </LegalSection>
      <LegalSection title="Retention">
        <p>We keep personal data only as long as reasonably needed for the purpose collected. Order and transaction records may be retained for accounting, tax, fraud prevention and dispute handling. Manuscript retention is described in <a className="font-semibold text-brand-dark underline" href="/manuscript-security">How We Protect Your Manuscript</a>. Newsletter details are kept until you unsubscribe or ask us to delete them. Analytics retention is governed by our settings and provider terms.</p>
      </LegalSection>
      <LegalSection title="Your privacy rights">
        <p>Depending on where you live, you may have rights to access, correct, delete or restrict use of your data; object to certain processing; receive a portable copy; or withdraw consent. You may also complain to your local data-protection authority.</p>
        <p>To make a request, email <a className="font-semibold text-brand-dark underline" href="mailto:privacy@booklingua.io">privacy@booklingua.io</a>. We may ask for information needed to verify your identity.</p>
      </LegalSection>
      <LegalSection title="Children and policy changes">
        <p>BookLingua is intended for adults and is not directed to children. We may update this policy as the service or legal requirements change. The date at the top shows the latest version.</p>
      </LegalSection>
    </LegalPage>
  )
}
