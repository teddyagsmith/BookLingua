type ScorecardSubscriber = {
  email: string
  name?: string | null
  genre?: string | null
  source: string
  utmCampaign?: string | null
}

export async function addScorecardSubscriber(input: ScorecardSubscriber) {
  const apiKey = process.env.MAILERLITE_API_KEY
  const groupId = process.env.MAILERLITE_SCORECARD_GROUP_ID
  if (!apiKey || !groupId) throw new Error('MailerLite scorecard integration is not configured')

  const response = await fetch('https://connect.mailerlite.com/api/subscribers', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: input.email,
      fields: {
        name: input.name || undefined,
        genre: input.genre || undefined,
        booklingua_source: input.source,
        booklingua_status: 'Lead',
        booklingua_utm_campaign: input.utmCampaign || undefined,
      },
      groups: [groupId],
      status: 'active',
    }),
    cache: 'no-store',
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`MailerLite subscriber sync failed (${response.status}): ${detail.slice(0, 500)}`)
  }

  return response.json()
}
