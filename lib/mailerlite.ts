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
  utmSource?: string | null
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
        campaignutm_source: input.utmSource || undefined,
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
  utmSource?: string | null
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
  })
}
