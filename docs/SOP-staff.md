# BookLingua — Staff SOP
*Internal use only. Last updated: 2026.*

---

## What is BookLingua?

BookLingua is an AI-powered book translation service. Authors upload a manuscript (EPUB, PDF, DOCX, or TXT), choose languages, and receive a translated file with editorial review within 2–3 hours. Every translation includes highlighted changes so the author can see exactly what was edited.

**Live site:** https://booklingua.io
**Repo:** https://github.com/teddyagsmith/BookLingua
**Support email:** support@booklingua.io
**Orders email:** orders@booklingua.io

---

## Pages Overview

### `/` — Homepage / Order Flow
The main sales page and the entire ordering experience. Customers:
1. Upload their book
2. Set book details (title, genre, heat level for romance, special instructions)
3. Choose languages
4. Select upsells
5. Apply a voucher code
6. Pay via Stripe

### `/examples` — Examples Page
Shows a real translation sample (Dracula excerpt) side-by-side with the original, with three tabs:
- **Translation** — the translated text with changes highlighted in yellow
- **Translation Notes** — editorial notes explaining key decisions
- **Launch Strategy Pack** — sample of the launch strategy upsell

Use this page when selling to authors — it's your best proof of quality.

### `/publishers` — Publishers Page
B2B landing page for publishers with 10+ books. Leads to a custom quote via hello@booklingua.io. No self-serve checkout — custom pricing only.

### `/success` — Order Confirmation Page
Shown after successful Stripe payment. Confirms the order and explains the 3-step process (translation → editorial review → email delivery).

---

## How an Order Works (Technical Flow)

1. **Upload** — File goes to `/api/upload` → stored in Supabase Storage
2. **Checkout** — `/api/checkout` validates the order, applies bundle discounts + voucher, creates a Stripe Checkout session
3. **Payment** — Customer pays on Stripe-hosted page
4. **Webhook** — Stripe fires event to `/api/webhook` → triggers Inngest job
5. **Translation** — Inngest runs the translation job (`/lib/translate-job.ts`): Pass 1 (Claude Sonnet, full translation) → Pass 2 (Claude Opus, editorial review)
6. **Delivery** — Translated file + Translation Notes emailed to customer via Resend from `orders@booklingua.io`
7. **Download** — Customer gets a time-limited download link via `/api/download/[orderId]/[lang]`

---

## Languages Available

| Code | Language | Market |
|------|----------|--------|
| `es-es` | Spanish (Spain) | Castilian |
| `es-latam` | Spanish (Latin America) | Mexico, Colombia, Argentina+ |
| `fr` | French | 300M+ speakers |
| `de` | German | 100M+ speakers |
| `pt-pt` | Portuguese (Portugal) | European |
| `pt-br` | Portuguese (Brazil) | 215M speakers |

---

## Pricing

| Tier | Word Count | Price per Language |
|------|------------|-------------------|
| Short | Up to 40k words | $99 |
| Standard | Up to 80k words | $149 |
| Large | Up to 150k words | $199 |

### Bundle Discounts (auto-applied)
| Languages | Discount |
|-----------|----------|
| 1 | 0% |
| 2 | 12% |
| 3 | 25% |
| 4 | 30% |
| 5 | 35% |
| All 6 | 40% |

---

## Upsells

### Launch Strategy Pack — $29 (1 language) / $49 (2+ languages)
A detailed PDF guide for launching a translated book on Amazon in a new market. Covers keyword research, category selection, pricing strategy, and launch timing. Generated automatically per language.

### MRR Romance Shoutout — $69 (Romance genre only)
A promotional shoutout to the My Romance Reads email list (~18K readers). Only appears when the customer selects Romance or Erotica as their genre. Coordinate timing with Clare.

---

## Discount / Voucher Codes

Codes are entered at checkout. They stack on top of bundle discounts.

| Code | Type | Value | Use Case |
|------|------|-------|----------|
| `LAUNCH20` | % off | 20% | General launch promotion |
| `FIRST50` | Fixed | $50 off | First-order incentive |
| `FRIEND10` | % off | 10% | Referral / word of mouth |
| `AUTHOR25` | % off | 25% | Author community / partnerships |
| `BETA95` | % off | 95% | Beta tester access |
| `TESTDRIVE` | % off | 95% | Internal testing only — do not share publicly |

### How to Add / Change Codes
Edit these two files (codes must match in both):
- `app/api/validate-voucher/route.ts`
- `app/api/checkout/route.ts`

Each code supports optional `maxUses` and `expiresAt` fields if you want to limit use.

---

## Email Setup (Resend)

All transactional emails send from `orders@booklingua.io` via Resend.
- Domain verified: ✅ booklingua.io
- **Order confirmation** — sent on successful payment (webhook)
- **Translation complete** — sent when files are ready (translate-job.ts)

To view sent emails, log in to [resend.com](https://resend.com).

---

## Stripe

- Live mode: ✅
- Webhook endpoint: `https://booklingua.io/api/webhook`
- To view orders: [dashboard.stripe.com](https://dashboard.stripe.com)

---

## Inngest (Background Jobs)

Inngest runs the translation pipeline in the background after payment.
- Dashboard: [app.inngest.com](https://app.inngest.com)
- App endpoint: `https://booklingua.io/api/inngest`
- If a translation fails, check the Inngest dashboard for the error log and retry from there.

---

## Supabase

Stores uploaded files and order data.
- Dashboard: [supabase.com](https://supabase.com)
- Schema: see `supabase-schema.sql` in the repo

---

## Deployment

The site auto-deploys to Vercel on every push to `main`.
- Vercel dashboard: [vercel.com](https://vercel.com)
- Manual deploy: `VERCEL_TOKEN=<token> npx vercel --prod --yes`

---

## Common Support Scenarios

**"I didn't get my email"**
Check Resend logs. Confirm the email address. Ask them to check spam. Resend manually from Resend dashboard if needed.

**"My translation looks wrong"**
Ask them to forward the file. Check the Inngest job logs for errors. Offer a re-run or refund depending on the issue.

**"I want a refund"**
Policy: Full refund if translation hasn't started. Partial/goodwill if already translated. Contact support@booklingua.io.

**"I need a custom quote for multiple books"**
Direct to the /publishers page or email hello@booklingua.io.
