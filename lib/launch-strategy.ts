import Anthropic from '@anthropic-ai/sdk'
import type { Message, MessageCreateParamsNonStreaming } from '@anthropic-ai/sdk/resources/messages'
import { LAUNCH_PACK_SCHEMA_VERSION, LaunchPackV1, launchMarket, validateLaunchPack } from './launch-pack-schema'
import { BOOKLINGUA_MODEL_CONFIG } from './model-config'

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
  researchDossier?: string
  manuscriptFacts?: string
}

export interface LaunchStrategyOutput {
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
  opportunities: LaunchPackV1['opportunities']
  topOpportunities: LaunchPackV1['topOpportunities']
  launchPlan30Day: LaunchPackV1['launchPlan30Day']
  marketingHooks: LaunchPackV1['marketingHooks']
  socialContentIdeas: LaunchPackV1['socialContentIdeas']
  amazonAdsStrategy: LaunchPackV1['amazonAdsStrategy']
  discountPromotion: LaunchPackV1['discountPromotion']
  research: LaunchPackV1['research']
}

export interface LaunchPackExecutionMetadata {
  provider: 'anthropic'
  modelId: string
  inputTokens?: number
  outputTokens?: number
  attempt: number
  success: boolean
  stage: 'launch-pack'
  requestId: string
  providerRequestId?: string
  errorCode?: string
}

type AnthropicMessage = Message

export function extractLaunchPackText(content: Array<{ type: string; text?: string }>): string {
  const text = content.find(block => block.type === 'text')
  if (!text?.text?.trim()) {
    throw new Error('Launch Pack model returned no non-empty text block')
  }
  return text.text
}

export function parseLaunchStrategyText(raw: string): LaunchStrategyOutput {
  const unfenced = raw.replace(/```(?:json)?\s*/gi, '').trim()
  const start=unfenced.indexOf('{'),end=unfenced.lastIndexOf('}')
  const cleaned=start>=0&&end>start?unfenced.slice(start,end+1):unfenced
  if (!cleaned) throw new Error('Launch Pack model returned empty text')
  try {
    return JSON.parse(cleaned) as LaunchStrategyOutput
  } catch {
    throw new Error('Launch Pack model returned malformed JSON')
  }
}

export function toCanonicalLaunchPack(
  strategy: LaunchStrategyOutput,
  locale: string,
  purchased: boolean,
): LaunchPackV1 {
  const identity = launchMarket(locale)
  const pack: LaunchPackV1 = { schemaVersion: LAUNCH_PACK_SCHEMA_VERSION, ...identity, ...strategy }
  const errors = validateLaunchPack({ pack, expectedLocale: locale, purchased })
  if (errors.length) throw new Error(`Launch Pack validation failed: ${errors.join('; ')}`)
  return pack
}

export async function generateLaunchStrategy(
  input: LaunchStrategyInput,
  execution: {
    attempt?: number
    requestId?: string
    onMetadata?: (metadata: LaunchPackExecutionMetadata) => Promise<void> | void
    createMessage?: (params: MessageCreateParamsNonStreaming) => Promise<AnthropicMessage>
  } = {},
): Promise<LaunchStrategyOutput> {
  const attempt = execution.attempt || 1
  const requestId = execution.requestId || `launch-pack:${input.targetLanguage}:${attempt}`
  let response: AnthropicMessage | undefined
  try {
  response = await (execution.createMessage || ((params) => anthropic.messages.create(params)))({
    model: BOOKLINGUA_MODEL_CONFIG.launchPack,
    // Opus may spend part of this budget on thinking blocks before emitting the
    // canonical JSON text block. 4,000 truncated valid Launch Packs in staging.
    max_tokens: 24576,
    messages: [
      {
        role: 'user',
        content: `You are an expert Amazon KDP consultant specializing in international book launches. Generate a comprehensive launch strategy for the following book being published in ${input.targetLanguage} for the ${input.targetMarket} market.

BOOK DETAILS:
Title: ${input.bookTitle}
Author: ${input.authorName}
Genre: ${input.genre}
Book Content/Description: ${input.bookDescription}

AUTHORITATIVE MANUSCRIPT FACTS (the only permitted source for claims about the book):
${input.manuscriptFacts || input.bookDescription}

MANUSCRIPT FACT-GROUNDING CONTRACT:
- Market research may be creative and wide-ranging. Manuscript research may not.
- Every statement about characters, names, plot events, time periods, relationships, tropes, spice, content warnings, setting, worldbuilding, quotations, or promises made by the book must be directly supported by AUTHORITATIVE MANUSCRIPT FACTS above.
- Do not infer plausible romantasy details. Omit unsupported specifics.
- A direct quotation must appear verbatim in AUTHORITATIVE MANUSCRIPT FACTS. Otherwise write original promotional copy without quotation marks and never present it as a line from the book.
- Do not state comparative or performance claims (for example "highest-saved", "highest-upside", "major income line", precise conversion assumptions, or claims about creator behaviour) unless the VERIFIED RESEARCH DOSSIER explicitly supports them. Prefer "worth testing", "a strong candidate", "potentially useful", or "commonly used" when evidence is limited.
- If comparative performance is not explicitly evidenced, remove the performance claim entirely. Explain instead why the idea suits this specific book using only the manuscript facts (for example, its imagery, setting, premise, tone, or format).
- Never prefix author-facing instructions with "English:" or another implementation label. Write the instruction directly in English. Labels are reserved for copy-ready marketplace text, such as "FRENCH COPY — READY TO USE".

Use the verified research dossier below as evidence. Never invent a URL, audience size, price, submission route, or promotion permission. If a fact is not established, say "Not publicly stated".

VERIFIED RESEARCH DOSSIER:
${input.researchDossier || 'No live dossier supplied; identify uncertainty explicitly and do not fabricate current facts.'}

Generate the following in JSON format. All author-facing explanations and instructions MUST be English. Only copy-ready marketplace fields are in ${input.targetLanguage}.

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
  ],
  "opportunities": [{"name":"","url":"https://...","type":"deal_site|reviewer_blog|reader_community|social_creator|media|event|platform","audience":"","fit":"","cost":"","promotionAllowed":"","contactRoute":"","priority":"High|Medium|Low"}],
  "topOpportunities": [{"rank":1,"opportunity":"","url":"https://...","whyItFits":"","effort":"Low|Medium|High","likelyCost":"Free|€|€€|€€€","recommendedAction":""}],
  "launchPlan30Day": {"minimumViable":[""],"pushHarder":[""],"phases":[{"timing":"4 weeks before launch","actions":[""]},{"timing":"2 weeks before launch","actions":[""]},{"timing":"Launch week","actions":[""]},{"timing":"Weeks 2–4","actions":[""]}]},
  "marketingHooks": [{"hook":"","readerAppeal":"","frenchPromotionalLine":"copy-ready promotional line in ${input.targetLanguage}; despite the legacy field name this is never necessarily French"}],
  "socialContentIdeas": [{"concept":"","explanation":"","frenchCaption":"copy-ready caption in ${input.targetLanguage}; despite the legacy field name this is never necessarily French","hashtags":["#..."],"format":"Reel|TikTok|Static|Carousel"}],
  "amazonAdsStrategy": {"startingStrategy":"","comparableTargets":[""],"targetingIdeas":[""],"metaPositioning":""},
  "discountPromotion": [{"option":"","availability":"","restriction":"","recommendedAction":""}],
  "research": {"completedAt":"2026-08-14","sources":[{"name":"","url":"https://...","note":"what was verified"}]}
}

IMPORTANT: 
- Explanations/instructions are English; copy-ready material is ${input.targetLanguage}
- Include at least 12 strong verified opportunities, exactly 10 ranked opportunities, 5+ hooks, 8-12 social concepts, and 10+ cited sources
- Keep every field concise enough that the complete JSON fits the response; quality and specificity matter more than long prose
- Backend keywords must each be under 50 characters
- Be specific to ${input.targetMarket} market, not generic advice
- Consider cultural nuances and local reading preferences

Respond with ONLY the JSON object, no additional text.`,
      },
    ],
  })

  const strategy = parseLaunchStrategyText(extractLaunchPackText(response.content as Array<{ type: string; text?: string }>))
  await execution.onMetadata?.({ provider: 'anthropic', modelId: response.model, ...(response.id ? { providerRequestId: response.id } : {}), inputTokens: response.usage?.input_tokens, outputTokens: response.usage?.output_tokens, attempt, success: true, stage: 'launch-pack', requestId })
  return strategy
  } catch (error) {
    await execution.onMetadata?.({ provider: 'anthropic', modelId: response?.model || BOOKLINGUA_MODEL_CONFIG.launchPack, ...(response?.id ? { providerRequestId: response.id } : {}), inputTokens: response?.usage?.input_tokens, outputTokens: response?.usage?.output_tokens, attempt, success: false, stage: 'launch-pack', requestId, errorCode: error instanceof Error ? error.message : 'LAUNCH_PACK_EXECUTION_FAILED' })
    throw error
  }
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
Generated by BookLingua • booklingua.io
═══════════════════════════════════════════════════════════════════
`.trim()
}
