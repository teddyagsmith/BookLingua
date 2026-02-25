# BookLingua

Professional AI-powered book translation with automatic processing.

## Architecture

```
Customer uploads book → Pays via Stripe → Order saved to Supabase
                                              ↓
                                    Inngest triggers translation job
                                              ↓
                              AI translates (Pass 1) + edits (Pass 2)
                                              ↓
                            Translations saved to Supabase + emailed to customer
```

## Quick Setup (30 minutes)

### 1. Create Required Accounts

| Service | URL | Purpose |
|---------|-----|---------|
| **Vercel** | vercel.com | Hosting |
| **Stripe** | stripe.com | Payments |
| **Supabase** | supabase.com | Database + Storage |
| **Inngest** | inngest.com | Background jobs |
| **Resend** | resend.com | Emails |
| **Anthropic** | console.anthropic.com | AI translation |

### 2. Set Up Supabase

1. Create a new project at supabase.com
2. Go to **SQL Editor**
3. Paste the contents of `supabase-schema.sql` and run it
4. Go to **Settings → API** and copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`

### 3. Set Up Inngest

1. Create account at inngest.com
2. Create a new app called "BookLingua"
3. Copy your **Signing Key** and **Event Key**

### 4. Set Up Stripe

1. Stay in **Test Mode** for now
2. Go to **Developers → API Keys**
3. Copy your secret key and publishable key
4. Go to **Developers → Webhooks → Add Endpoint**
   - URL: `https://your-app.vercel.app/api/webhook`
   - Events: `checkout.session.completed`
5. Copy the webhook signing secret

### 5. Deploy to Vercel

```bash
npm install -g vercel
vercel
```

### 6. Add Environment Variables

In Vercel Dashboard → Settings → Environment Variables:

```
# Stripe
STRIPE_SECRET_KEY=sk_test_xxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxx
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxxxx

# Anthropic
ANTHROPIC_API_KEY=sk-ant-xxxxx

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJxxxxx

# Inngest
INNGEST_SIGNING_KEY=signkey-xxxxx
INNGEST_EVENT_KEY=xxxxx

# Resend
RESEND_API_KEY=re_xxxxx

# App
ADMIN_EMAIL=your@email.com
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
```

### 7. Register Inngest Functions

After deploying, visit:
```
https://your-app.vercel.app/api/inngest
```

Then in Inngest dashboard, sync your app.

### 8. Test!

1. Go to your live site
2. Upload a small .txt file
3. Complete checkout with test card: `4242 4242 4242 4242`
4. Check Inngest dashboard to see the translation job running
5. Check Supabase to see the order and files saved

## How It Works

### Automatic Translation Flow

1. **Customer pays** → Stripe webhook fires
2. **Webhook creates order** in Supabase with status `pending`
3. **Webhook triggers Inngest** event `book/translate.requested`
4. **Inngest job runs**:
   - Fetches order details from Supabase
   - Fetches original file content
   - Updates status to `processing`
   - For each language:
     - Pass 1: Translates with AI
     - Pass 2: Editorial review with premium AI
     - Saves translation to Supabase
   - Updates status to `completed`
   - Emails customer with download links
   - Emails admin notification

### Database Schema

**orders**
- id, email, author_name, book_title, word_count, tier
- languages (JSON array), genre, special_instructions
- status: pending → processing → completed
- amount_paid, created_at, completed_at

**files**
- id, order_id, type (original/translated), language
- content (text), file_url (for binary files)

**temp_uploads**
- Temporary storage before checkout
- Cleaned up after 24 hours

## Pricing

| Tier | Word Count | Price/Language |
|------|-----------|----------------|
| Small | Up to 30k | $150 |
| Medium | Up to 80k | $350 |
| Large | Up to 150k | $600 |

Bundle discounts: 2 langs (12%), 3 langs (25%), 4 langs (37%)

## Monitoring

- **Inngest Dashboard**: View job status, retries, errors
- **Supabase Dashboard**: View orders, files, run queries
- **Vercel Logs**: View API errors
- **Resend Dashboard**: View email delivery

## Troubleshooting

### Translation job failed

1. Check Inngest dashboard for error message
2. Check Supabase for order status
3. You can manually retry from Inngest dashboard

### Customer didn't receive email

1. Check Resend dashboard for delivery status
2. Verify email address in Supabase orders table

### Re-run a translation

From Inngest dashboard, you can replay the event to re-run the job.

## Cost Estimates

| Service | Free Tier | ~Monthly Cost |
|---------|-----------|---------------|
| Vercel | 100GB bandwidth | $0-20 |
| Supabase | 500MB database | $0-25 |
| Inngest | 50k events/month | $0-50 |
| Resend | 3k emails/month | $0-20 |
| Stripe | 2.9% + $0.30/tx | Variable |
| AI API | Pay as you go | ~$50/book |

## Support

Questions? Email support@booklingua.com
