import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

interface LaunchStrategyInput {
  bookTitle: string
  authorName: string
  genre: string
  bookDescription: string // First ~500 words of the book or description
  targetLanguage: string
  targetMarket: string // e.g., "Spain/Latin America", "France", "Germany", "Brazil/Portugal"
}

interface LaunchStrategyOutput {
  backendKeywords: string[] // 7 keyword boxes, each up to 50 chars
  adKeywords: string[] // 20-30 keywords for Amazon Ads
  categories: string[] // Recommended categories for that market
  pricingRecommendation: {
    ebook: string
    paperback: string
    reasoning: string
  }
  bookDescription: string // Translated + optimized for that market
  reviewStrategy: string[]
  kdpUploadChecklist: string[]
}

export async function generateLaunchStrategy(
  input: LaunchStrategyInput
): Promise<LaunchStrategyOutput> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4000,
    messages: [
      {
        role: 'user',
        content: `You are an expert Amazon KDP consultant specializing in international book launches. Generate a comprehensive launch strategy for the following book being published in ${input.targetLanguage} for the ${input.targetMarket} market.

BOOK DETAILS:
Title: ${input.bookTitle}
Author: ${input.authorName}
Genre: ${input.genre}
Book Content/Description: ${input.bookDescription}

Generate the following in JSON format:

{
  "backendKeywords": [
    // 7 keyword strings for Amazon's backend keyword boxes
    // CRITICAL RULES:
    // - Each string must be UNDER 50 characters
    // - All keywords must be in ${input.targetLanguage}
    // - Boxes 1-3: Specific descriptive phrases shoppers would type (e.g., "novela romántica segunda oportunidad familia")
    // - Boxes 4-5: Category-anchoring terms that reinforce genre placement
    // - Boxes 6-7: Fill with genre/topic-rich descriptive words
    // 
    // For FICTION include: character roles, setting, time period, story catalyst, genre flavor
    // For NON-FICTION include: reader pain points, desired outcomes, reader demographics
    //
    // DO NOT include: the book title, author name, or generic terms like "book" or "ebook"
    // DO NOT use quotes, commas within a box, or repeat words unnecessarily
  ],
  
  "adKeywords": [
    // 25-30 keywords for Amazon Advertising campaigns
    // Mix of:
    // - Competitor book titles in ${input.targetLanguage} market (translated titles of popular books in this genre)
    // - Competitor author names popular in ${input.targetMarket}
    // - Genre phrases and tropes
    // - Reader interest keywords
    // Each keyword should be something a reader might search for
  ],
  
  "categories": [
    // 5-7 recommended Amazon categories for ${input.targetMarket}
    // Include the full category path like "Libros > Literatura y ficción > Ficción por género > Romance > Contemporáneo"
    // Choose categories that are:
    // - Relevant to the book
    // - Not overly competitive (avoid top-level categories)
    // - Popular enough to have active shoppers
  ],
  
  "pricingRecommendation": {
    "ebook": "€X.XX or equivalent",
    "paperback": "€X.XX or equivalent",
    "reasoning": "Brief explanation of why this price point works for ${input.targetMarket}, considering local purchasing power and competitor pricing"
  },
  
  "bookDescription": "A compelling book description in ${input.targetLanguage}, optimized for the ${input.targetMarket} market. Should be 150-200 words, include relevant keywords naturally, and follow Amazon best practices with a hook, body, and call to action.",
  
  "reviewStrategy": [
    // 5-7 specific, actionable tactics for getting reviews in ${input.targetMarket}
    // Include:
    // - Local book blogger/bookstagrammer outreach suggestions
    // - ${input.targetLanguage} Goodreads groups
    // - Local ARC strategies
    // - Review request timing
    // - Cultural considerations for ${input.targetMarket}
  ],
  
  "kdpUploadChecklist": [
    // Step-by-step checklist specific to publishing in ${input.targetMarket}
    // Include:
    // - Which Amazon marketplace to use (amazon.es, amazon.fr, amazon.de, amazon.com.br)
    // - Territory rights settings
    // - Pricing strategy across markets
    // - Pre-order considerations
    // - Launch timing recommendations for ${input.targetMarket}
  ]
}

IMPORTANT: 
- All text content must be in ${input.targetLanguage}
- Backend keywords must each be under 50 characters
- Be specific to ${input.targetMarket} market, not generic advice
- Consider cultural nuances and local reading preferences

Respond with ONLY the JSON object, no additional text.`,
      },
    ],
  })

  const content = response.content[0]
  if (content.type !== 'text') {
    throw new Error('Unexpected response type')
  }

  // Parse the JSON response
  const cleanedResponse = content.text
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim()

  return JSON.parse(cleanedResponse) as LaunchStrategyOutput
}

// Market configurations
export const MARKET_CONFIG: Record<string, { language: string; market: string; currency: string; amazonDomain: string }> = {
  es: {
    language: 'Spanish',
    market: 'Spain and Latin America',
    currency: 'EUR/USD',
    amazonDomain: 'amazon.es / amazon.com.mx',
  },
  fr: {
    language: 'French',
    market: 'France and French-speaking countries',
    currency: 'EUR',
    amazonDomain: 'amazon.fr',
  },
  de: {
    language: 'German',
    market: 'Germany, Austria, and Switzerland',
    currency: 'EUR',
    amazonDomain: 'amazon.de',
  },
  pt: {
    language: 'Portuguese',
    market: 'Brazil and Portugal',
    currency: 'BRL/EUR',
    amazonDomain: 'amazon.com.br',
  },
}

// Format the launch strategy as a readable document
export function formatLaunchStrategyDocument(
  strategy: LaunchStrategyOutput,
  bookTitle: string,
  langCode: string
): string {
  const config = MARKET_CONFIG[langCode]
  
  return `
═══════════════════════════════════════════════════════════════════
📚 LAUNCH STRATEGY PACK
${bookTitle} — ${config.language} (${config.market})
═══════════════════════════════════════════════════════════════════

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔑 AMAZON BACKEND KEYWORDS (Copy these exactly into KDP)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Paste each line into one of your 7 keyword boxes in KDP:

Box 1: ${strategy.backendKeywords[0] || ''}
Box 2: ${strategy.backendKeywords[1] || ''}
Box 3: ${strategy.backendKeywords[2] || ''}
Box 4: ${strategy.backendKeywords[3] || ''}
Box 5: ${strategy.backendKeywords[4] || ''}
Box 6: ${strategy.backendKeywords[5] || ''}
Box 7: ${strategy.backendKeywords[6] || ''}

💡 TIP: Boxes 1-3 are your most important targeted phrases. Boxes 4-7 
   help with broader discoverability and category placement.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 AMAZON ADS KEYWORDS (For Sponsored Products campaigns)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Copy these into your Amazon Advertising campaign:

${strategy.adKeywords.map((kw, i) => `${i + 1}. ${kw}`).join('\n')}

💡 TIP: Start with "Manual targeting" and add these as "Keyword targeting"
   with "Broad match" to discover which work best, then switch winners
   to "Exact match" for better ROI.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📂 RECOMMENDED CATEGORIES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Select these categories in KDP (you can choose up to 3):

${strategy.categories.map((cat, i) => `${i + 1}. ${cat}`).join('\n')}

💡 TIP: Start with the more specific (niche) categories. It's easier to
   rank #1 in a smaller category, which triggers Amazon to expand your
   visibility to larger categories.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💰 PRICING RECOMMENDATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Ebook:     ${strategy.pricingRecommendation.ebook}
Paperback: ${strategy.pricingRecommendation.paperback}

Why: ${strategy.pricingRecommendation.reasoning}


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 OPTIMIZED BOOK DESCRIPTION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Copy this into your KDP book description:

${strategy.bookDescription}


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⭐ REVIEW STRATEGY FOR ${config.market.toUpperCase()}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${strategy.reviewStrategy.map((tip, i) => `${i + 1}. ${tip}`).join('\n\n')}


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ KDP UPLOAD CHECKLIST FOR ${config.amazonDomain.toUpperCase()}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${strategy.kdpUploadChecklist.map((step, i) => `☐ ${i + 1}. ${step}`).join('\n\n')}


═══════════════════════════════════════════════════════════════════
Generated by BookLingua • booklingua.com
═══════════════════════════════════════════════════════════════════
`.trim()
}
