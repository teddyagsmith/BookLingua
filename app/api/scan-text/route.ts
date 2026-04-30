import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

// Known country-specific terms to flag
const US_TERMS = [
  'W-4', 'W-2', '1099', '1040', 'IRS', 'FICA', 'Social Security', 'Medicare',
  'Roth IRA', '401(k)', '403(b)', '529 plan', 'HSA', 'FSA',
  'DA', 'District Attorney', 'Miranda rights', 'First Degree', 'Second Degree',
  'FBI', 'precinct', 'Sheriff', 'SWAT', 'Secret Service',
  'Oval Office', 'Secretary of State', 'Speaker of the House',
  'DMV', 'Real Estate Agent', 'Realtor', 'MLS',
  'ZIP code', 'area code', 'state abbreviations',
  'NFL', 'NBA', 'MLB', 'NHL', 'NCAA',
  'FAFSA', 'Pell Grant', 'SAT', 'ACT', 'GPA',
  'Applebee\'s', 'Denny\'s', 'Walmart', 'Target', 'Costco',
  'CVS', 'Walgreens', 'Rite Aid',
  'FTC', 'SEC', 'EPA', 'FDA', 'OSHA',
  'I-9', 'EIN', 'SSN', 'TIN',
  'Chapter 7', 'Chapter 11', 'Chapter 13',
]

const UK_TERMS = [
  'NHS', 'GP', 'A\u0026E', 'A and E', 'A\u0026E',
  'barrister', 'solicitor', 'QC', 'KC', 'magistrate',
  'CPS', 'CID', 'PC', 'DCI', 'DI', 'DS',
  'council tax', 'VAT', 'HMRC', 'National Insurance',
  'A-levels', 'GCSE', 'UCAS', 'Oxbridge',
  'Tesco', 'Sainsbury\'s', 'Asda', 'Morrisons', 'Waitrose', 'Boots',
  'Prime Minister', 'Chancellor', 'MP', 'MPs', 'House of Commons',
  'High Street', 'ring road',
  'DVLA', 'MOT', 'council house', 'housing association',
  'P45', 'P60', 'P11D', 'National Insurance number',
]

const AU_TERMS = [
  'Medicare', 'Centrelink', 'ASIC', 'ABN', 'TFN',
  'Fair Work', 'Awards', 'Enterprise Agreement',
  'Coles', 'Woolworths', 'ALDI', 'Bunnings',
  'HSC', 'VCE', 'ATAR',
]

// Fantasy indicators
const FANTASY_INDICATORS = [
  'magic', 'wizard', 'sorcerer', 'spell', 'enchanted', 'kingdom',
  'dragon', 'elf', 'elves', 'dwarf', 'dwarves', 'orc',
  'quest', 'prophecy', 'chosen one', 'dark lord',
]

interface Finding {
  type: 'country_specific' | 'proper_name' | 'fantasy_element' | 'potentially_ambiguous'
  original: string
  context: string
  question: string
  options: { label: string; value: string; description: string }[]
  defaultOption: string
}

function keywordScan(text: string): Finding[] {
  const findings: Finding[] = []
  const sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.length > 20)
  const textLower = text.toLowerCase()

  // Scan for country-specific terms
  for (const term of US_TERMS) {
    const regex = new RegExp(`\\b${term.replace(/[()]/g, '\\\\$&')}\\b`, 'gi')
    const matches = Array.from(text.matchAll(regex))
    for (const match of matches.slice(0, 3)) { // max 3 instances per term
      const start = Math.max(0, match.index! - 80)
      const end = Math.min(text.length, match.index! + term.length + 80)
      const context = text.slice(start, end).replace(/\n+/g, ' ')

      const existing = findings.find(f => f.type === 'country_specific' && f.original === term)
      if (!existing) {
        findings.push({
          type: 'country_specific',
          original: term,
          context: `...${context}...`,
          question: `Your text mentions "${term}" — a US-specific term. How should we handle this?`,
          options: [
            { label: 'Keep original', value: 'keep', description: `Keep "${term}" in English with a brief German explanation` },
            { label: 'Adapt to German equivalent', value: 'adapt', description: `Replace with the nearest German equivalent (may change meaning)` },
            { label: 'Keep with footnote', value: 'footnote', description: `Keep original + add Translation Note explaining the term` },
          ],
          defaultOption: 'keep',
        })
      }
      break
    }
  }

  // Scan for UK terms
  for (const term of UK_TERMS) {
    const regex = new RegExp(`\\b${term.replace(/[()]/g, '\\\\$&')}\\b`, 'gi')
    const matches = Array.from(text.matchAll(regex))
    for (const match of matches.slice(0, 1)) {
      const start = Math.max(0, match.index! - 80)
      const end = Math.min(text.length, match.index! + term.length + 80)
      const context = text.slice(start, end).replace(/\n+/g, ' ')

      const existing = findings.find(f => f.type === 'country_specific' && f.original === term)
      if (!existing) {
        findings.push({
          type: 'country_specific',
          original: term,
          context: `...${context}...`,
          question: `Your text mentions "${term}" — a UK-specific term. How should we handle this?`,
          options: [
            { label: 'Keep original', value: 'keep', description: `Keep "${term}" in English with brief explanation` },
            { label: 'Adapt to German equivalent', value: 'adapt', description: `Replace with nearest German equivalent` },
            { label: 'Keep with footnote', value: 'footnote', description: `Keep original + add Translation Note` },
          ],
          defaultOption: 'keep',
        })
      }
      break
    }
  }

  return findings
}

export async function POST(request: NextRequest) {
  try {
    const { text, genre, language, maxFindings = 8 } = await request.json()

    if (!text || text.length < 50) {
      return NextResponse.json({ findings: [] })
    }

    // Phase 1: Fast keyword scan
    const keywordFindings = keywordScan(text)

    // Phase 2: AI-enhanced scan for proper names and fantasy elements
    // Only run for longer texts or when genre suggests we should
    let aiFindings: Finding[] = []
    const targetLangName = language === 'de' ? 'German' : language === 'es-es' ? 'Spanish' : language || 'the target language'

    try {
      const sampleText = text.length > 3000 ? text.slice(0, 3000) + '...' : text
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        system: `You are a pre-translation content scanner for BookLingua, a professional literary translation service. Your job is to quickly scan a text and identify elements that need author guidance before translation begins.`,
        messages: [{
          role: 'user',
          content: `Scan this text for translation-relevant items. Return ONLY a JSON array of findings. Each finding should have:
- "type": "proper_name" | "fantasy_element" | "potentially_ambiguous" | "country_specific"
- "original": the exact term or phrase
- "question": what to ask the author
- "options": array of {label, value, description} choices
- "defaultOption": the recommended default value

Focus on:
1. PROPER NAMES (people names, place names, fictional locations) — ask if they should be translated, kept, or adapted
2. FANTASY ELEMENTS (if genre is fantasy/sci-fi) — invented terms, magic systems, creature names — ask if untranslatable
3. POTENTIALLY AMBIGUOUS terms that might confuse translators

Do NOT flag common words, everyday vocabulary, or obvious choices. Only flag items where author guidance genuinely helps quality.

Genre: ${genre || 'unknown'}
Target language: ${targetLangName}

TEXT TO SCAN (first ~3000 chars):
${sampleText}

Return ONLY valid JSON array, no markdown, no explanation. Example:
[
  {"type":"proper_name","original":"Aragorn","question":"The name 'Aragorn' appears...","options":[{"label":"Keep as-is","value":"keep","description":"..."}],"defaultOption":"keep"}
]`
        }]
      })

      const aiText = response.content[0].type === 'text' ? response.content[0].text : ''
      const jsonMatch = aiText.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        aiFindings = JSON.parse(jsonMatch[0])
      }
    } catch (err) {
      console.warn('[scan-text] AI scan failed, using keyword-only:', err)
    }

    // Merge and deduplicate
    const allFindings = [...keywordFindings]
    for (const ai of aiFindings) {
      const dup = allFindings.find(f => f.original.toLowerCase() === ai.original.toLowerCase())
      if (!dup) {
        allFindings.push(ai)
      }
    }

    // Limit to max findings, prioritize country_specific
    const prioritized = [
      ...allFindings.filter(f => f.type === 'country_specific'),
      ...allFindings.filter(f => f.type !== 'country_specific'),
    ]

    return NextResponse.json({ findings: prioritized.slice(0, maxFindings) })

  } catch (error) {
    console.error('Scan text error:', error)
    return NextResponse.json({ findings: [] })
  }
}
