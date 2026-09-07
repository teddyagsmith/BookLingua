import { MetadataRoute } from 'next'

// Allow all crawlers, including AI search and answer engines, and point them at the sitemap.
// Private and transactional routes are excluded so they never end up in an index or an AI answer.
export default function robots(): MetadataRoute.Robots {
  const disallow = ['/api/', '/admin/', '/download/', '/success', '/_next/']
  const aiBots = [
    'GPTBot', 'OAI-SearchBot', 'ChatGPT-User',
    'ClaudeBot', 'Claude-SearchBot', 'anthropic-ai',
    'PerplexityBot', 'Perplexity-User',
    'Google-Extended', 'Bingbot', 'Applebot', 'Applebot-Extended',
    'Amazonbot', 'DuckAssistBot', 'meta-externalagent', 'cohere-ai', 'YouBot',
  ]
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow },
      ...aiBots.map((userAgent) => ({ userAgent, allow: '/', disallow })),
    ],
    sitemap: 'https://booklingua.io/sitemap.xml',
    host: 'https://booklingua.io',
  }
}
