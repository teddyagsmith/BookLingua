import type { Metadata } from 'next'
import { LegalList, LegalPage, LegalSection } from '@/components/LegalPage'

export const metadata: Metadata = { title: 'Privacy Policy | BookLingua', description: 'How BookLingua collects, uses, shares and protects personal data.', alternates: { canonical: '/privacy' } }

export default function PrivacyPage() {
  return <LegalPage eyebrow="Legal" title="Privacy Policy" introduction="This policy explains how BookLingua handles personal data when you visit our website, request an estimate, contact us or place an order.">
    <LegalSection title="Who is responsible for your data">
      <p>BookLingua is operated by Hykke Ltd, which is the controller of personal data described in this policy.</p>
      <p>Questions and privacy requests can be sent to <a className="font-semibold text-brand-dark underline" href="mailto:privacy@booklingua.io">privacy@booklingua.io</a>.</p>
    </LegalSection>
    <LegalSection title="Information we collect"><LegalList>
      <li><strong>Order information:</strong> name, email address, book title, genre, selected languages, instructions, order value and order status.</li>
      <li><strong>Manuscript information:</strong> uploaded files, extracted text, translation choices and generated deliverables.</li>
      <li><strong>Payment information:</strong> Stripe processes card details. BookLingua receives payment status and transaction identifiers, not your full card number.</li>
      <li><strong>Estimate information:</strong> email address, requested estimate details, consent choice, referral source and advertising attribution parameters.</li>
      <li><strong>Website information:</strong> device, browser, pages visited and similar usage information where permitted.</li>
    </LegalList></LegalSection>
    <LegalSection title="Why we use it"><LegalList>
      <li>to provide estimates, fulfil orders and deliver files;</li><li>to process payments and prevent fraud;</li><li>to answer enquiries and resolve support issues;</li><li>to send requested service emails and, with consent, marketing emails;</li><li>to understand website and advertising performance; and</li><li>to meet legal, accounting and security obligations.</li>
    </LegalList></LegalSection>
    <LegalSection title="Service providers and retention">
      <p>We use specialist providers including Anthropic, Supabase, Stripe, Vercel, Resend and Inngest. Some providers process data outside your country using appropriate safeguards.</p>
      <p>We keep personal data only as long as reasonably needed for the purpose collected. Order records may be retained for accounting, fraud prevention and dispute handling. Marketing details are kept until you unsubscribe or ask us to delete them.</p>
    </LegalSection>
    <LegalSection title="Your privacy rights">
      <p>Depending on where you live, you may have rights to access, correct, delete or restrict use of your data, object to processing, receive a portable copy or withdraw consent. Email <a className="font-semibold text-brand-dark underline" href="mailto:privacy@booklingua.io">privacy@booklingua.io</a> to make a request.</p>
    </LegalSection>
  </LegalPage>
}
