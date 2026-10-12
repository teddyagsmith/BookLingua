# Meta Instant Form — BookLingua language scorecard

## Form settings

- Form type: **Higher intent**
- Headline: **Which language should you translate your book into first?**
- Description: **Get the free three-minute Indie Author Market-Match Scorecard. Compare German, Spanish, French, Italian and Portuguese using your genre, reader signals and launch readiness.**
- Contact fields: full name, email
- Custom multiple-choice question: **What genre do you write?**
  - Romance
  - Fantasy
  - Thriller / crime
  - Science fiction
  - Nonfiction
  - Other
- Marketing consent (optional, unchecked): **Yes, send me BookLingua news, offers and practical translation tips. I can unsubscribe at any time.**
- Privacy policy: `https://booklingua.io/privacy`

## Completion screen

- Headline: **Your scorecard is ready**
- Description: **Download it now. We’ll also email you a copy so you can return to it later.**
- Button: **Download scorecard**
- URL: `https://booklingua.io/scorecard?utm_source=meta&utm_medium=paid_social&utm_campaign=language_scorecard`

## Lead delivery integration

Configure Meta Leads Center, Zapier, Make or an equivalent server-side connector to POST each lead to:

`https://booklingua.io/api/meta-scorecard-lead`

Header:

`x-booklingua-lead-secret: <SCORECARD_LEAD_SECRET>`

JSON body:

```json
{
  "email": "lead@example.com",
  "fullName": "Reader Name",
  "genre": "romance",
  "marketingConsent": true,
  "source": "meta_instant_form",
  "metaLeadId": "{{lead_id}}",
  "metaFormId": "{{form_id}}",
  "metaCampaignId": "{{campaign_id}}",
  "metaAdsetId": "{{adset_id}}",
  "metaAdId": "{{ad_id}}",
  "utmCampaign": "language_scorecard",
  "utmContent": "{{ad_name}}"
}
```

Set `SCORECARD_LEAD_SECRET` in Vercel before enabling the connector. Never expose it in browser code or the Meta form itself.

