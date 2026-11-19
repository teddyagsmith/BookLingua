const MAILERLITE_API_URL = 'https://connect.mailerlite.com/api'

export const MAILERLITE_GROUPS = {
  customers: process.env.MAILERLITE_CUSTOMERS_GROUP_ID || '201489301465203864',
  general: process.env.MAILERLITE_GENERAL_GROUP_ID || '201489262774846513',
  pricing: process.env.MAILERLITE_PRICING_GROUP_ID || '201489290743514883',
  scorecard: process.env.MAILERLITE_SCORECARD_GROUP_ID || '201489278095590589',
} as const

type BookLinguaSubscriber = {
  email: string
  groupId: string
  name?: string | null
  genre?: string | null
  source: string
  lifecycleStatus: 'Subscriber' | 'Lead' | 'Customer'
  marketingConsent: boolean
  utmSource?: string | null
  utmMedium?: string | null
  utmCampaign?: string | null
  utmContent?: string | null
}

function apiKey() {
  const key = process.env.BOOKLINGUA_MAILERLITE_API_KEY || process.env.MAILERLITE_API_KEY
  if (!key) throw new Error('BookLingua MailerLite integration is not configured')
  return key
}

/**
 * Upserts a subscriber without forcing their MailerLite status back to active.
 * This protects an existing unsubscribe while still adding new opted-in contacts.
 */
export async function upsertBookLinguaSubscriber(input: BookLinguaSubscriber) {
  const response = await fetch(`${MAILERLITE_API_URL}/subscribers`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: input.email,
      fields: {
        name: input.name || undefined,
        genre: input.genre || undefined,
        source_origin: input.source,
        contact_status: input.lifecycleStatus,
        utm_source: input.utmSource || undefined,
        utm_medium: input.utmMedium || undefined,
        utm_campaign: input.utmCampaign || undefined,
        utm_content: input.utmContent || undefined,
        httpsmailerlitecom_accepts_marketing: input.marketingConsent ? 1 : 0,
      },
      groups: [input.groupId],
    }),
    cache: 'no-store',
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`MailerLite subscriber sync failed (${response.status}): ${detail.slice(0, 500)}`)
  }

  return response.json()
}

export function addScorecardSubscriber(input: {
  email: string
  name?: string | null
  genre?: string | null
  source: string
  marketingConsent: boolean
  utmSource?: string | null
  utmMedium?: string | null
  utmCampaign?: string | null
  utmContent?: string | null
}) {
  return upsertBookLinguaSubscriber({
    ...input,
    groupId: MAILERLITE_GROUPS.scorecard,
    lifecycleStatus: 'Lead',
  })
}

export function addGeneralSubscriber(input: {
  email: string
  source: string
  utmSource?: string | null
}) {
  return upsertBookLinguaSubscriber({
    ...input,
    groupId: MAILERLITE_GROUPS.general,
    lifecycleStatus: 'Subscriber',
    marketingConsent: true,
  })
}
