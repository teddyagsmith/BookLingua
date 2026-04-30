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

// Measurement units that should be converted for EU/metric audiences
const MEASUREMENT_TERMS = [
  { term: 'inch', unit: 'cm', context: 'length' },
  { term: 'inches', unit: 'cm', context: 'length' },
  { term: 'foot', unit: 'm', context: 'length' },
  { term: 'feet', unit: 'm', context: 'length' },
  { term: 'yard', unit: 'm', context: 'length' },
  { term: 'yards', unit: 'm', context: 'length' },
  { term: 'mile', unit: 'km', context: 'length' },
  { term: 'miles', unit: 'km', context: 'length' },
  { term: 'pound', unit: 'kg', context: 'weight' },
  { term: 'pounds', unit: 'kg', context: 'weight' },
  { term: 'lb', unit: 'kg', context: 'weight' },
  { term: 'lbs', unit: 'kg', context: 'weight' },
  { term: 'ounce', unit: 'g', context: 'weight' },
  { term: 'ounces', unit: 'g', context: 'weight' },
  { term: 'oz', unit: 'g', context: 'weight' },
  { term: 'gallon', unit: 'litres', context: 'volume' },
  { term: 'gallons', unit: 'litres', context: 'volume' },
  { term: 'quart', unit: 'litres', context: 'volume' },
  { term: 'pint', unit: 'ml', context: 'volume' },
  { term: 'cup', unit: 'ml', context: 'volume' },
  { term: 'tablespoon', unit: 'ml', context: 'volume' },
  { term: 'teaspoon', unit: 'ml', context: 'volume' },
  { term: 'Fahrenheit', unit: 'Celsius', context: 'temperature' },
  { term: 'F', unit: 'C', context: 'temperature' },
  { term: 'mph', unit: 'km/h', context: 'speed' },
  { term: 'square foot', unit: 'm\u00b2', context: 'area' },
  { term: 'square feet', unit: 'm\u00b2', context: 'area' },
  { term: 'acre', unit: 'hectares', context: 'area' },
  { term: 'acres', unit: 'hectares', context: 'area' },
]

// Global brands that may have local names
const BRAND_NAMES = [
  'Walmart', 'Target', 'Costco', 'Best Buy', 'Home Depot',
  'CVS', 'Walgreens', 'Rite Aid', 'Duane Reade',
  'McDonald\'s', 'Burger King', 'Wendy\'s', 'Applebee\'s', 'Denny\'s', 'IHOP',
  'Starbucks', 'Dunkin\'', 'Tim Hortons',
  'Subway', 'KFC', 'Pizza Hut', 'Domino\'s',
  'Nike', 'Adidas', 'Under Armour',
  'Ford', 'Chevrolet', 'Dodge', 'Jeep', 'Chrysler', 'Buick', 'Cadillac',
  'AT\u0026T', 'Verizon', 'T-Mobile', 'Sprint',
  'Comcast', 'Spectrum', 'Xfinity',
  'FedEx', 'UPS', 'USPS',
  'Bank of America', 'Wells Fargo', 'Chase', 'Citibank',
  'Exxon', 'Shell', 'BP', 'Chevron',
]

// Education system terms
const EDUCATION_TERMS = [
  'high school', 'middle school', 'elementary school', 'junior high',
  'college', 'university', 'community college', 'trade school',
  'sophomore', 'junior', 'senior', 'freshman',
  'GPA', 'valedictorian', 'salutatorian',
  'SAT', 'ACT', 'LSAT', 'MCAT', 'GRE', 'GMAT',
  'AP class', 'AP exam', 'Advanced Placement',
  'bachelor\'s degree', 'master\'s degree', 'PhD', 'MBA',
  'fraternity', 'sorority', 'Greek life',
  'homecoming', 'prom', 'detention',
]

// Currency references
const CURRENCY_TERMS = [
  { term: '$', name: 'dollar', context: 'US currency' },
  { term: 'USD', name: 'US dollar', context: 'currency' },
  { term: 'dollars', name: 'dollar', context: 'US currency' },
  { term: '\u00a3', name: 'pound', context: 'UK currency' },
  { term: 'GBP', name: 'British pound', context: 'currency' },
  { term: 'pounds', name: 'pound', context: 'UK currency' },
]

const LANGUAGE_NAMES: Record<string, string> = {
  'es-es': 'Spanish',
  'es-latam': 'Spanish (Latin America)',
  'fr': 'French',
  'de': 'German',
  'pt-pt': 'Portuguese',
  'pt-br': 'Portuguese (Brazil)',
  'it': 'Italian',
  'pl': 'Polish',
  'ja': 'Japanese',
}

function getLangName(code: string): string {
  return LANGUAGE_NAMES[code] || code
}

interface Finding {
  type: 'country_specific' | 'proper_name' | 'fantasy_element' | 'potentially_ambiguous'
  original: string
  context: string
  question: string
  options: { label: string; value: string; description: string }[]
  defaultOption: string
}

function keywordScan(text: string, languages: string[]): Finding[] {
  const findings: Finding[] = []
  const langName = getLangName(languages[0] || 'de')

  // Scan for measurement units
  for (const { term, unit, context } of MEASUREMENT_TERMS) {
    const regex = new RegExp(`\\b${term}\\b`, 'gi')
    const matches = Array.from(text.matchAll(regex))
    for (const match of matches.slice(0, 2)) {
      const start = Math.max(0, match.index! - 60)
      const end = Math.min(text.length, match.index! + term.length + 60)
      const ctx = text.slice(start, end).replace(/\n+/g, ' ')

      const existing = findings.find(f => f.original.toLowerCase() === term.toLowerCase())
      if (!existing) {
        findings.push({
          type: 'potentially_ambiguous',
          original: term,
          context: `...${ctx}...`,
          question: `Your text uses "${term}" (${context}). For ${langName} readers, should we convert to ${unit}?`,
          options: [
            { label: `Convert to ${unit}`, value: 'convert', description: `Replace "${term}" with metric equivalent throughout` },
            { label: 'Keep original', value: 'keep', description: `Keep "${term}" as-is (appropriate if story stays in original country)` },
            { label: 'Convert with note', value: 'footnote', description: `Use ${unit} + add Translation Note explaining original measurement` },
          ],
          defaultOption: 'convert',
        })
      }
      break
    }
  }

  // Scan for brand names
  for (const brand of BRAND_NAMES) {
    const regex = new RegExp(`\\b${brand.replace(/[']/g, "\\'")}\\b`, 'gi')
    const matches = Array.from(text.matchAll(regex))
    for (const match of matches.slice(0, 2)) {
      const start = Math.max(0, match.index! - 60)
      const end = Math.min(text.length, match.index! + brand.length + 60)
      const ctx = text.slice(start, end).replace(/\n+/g, ' ')

      const existing = findings.find(f => f.original === brand)
      if (!existing) {
        findings.push({
          type: 'potentially_ambiguous',
          original: brand,
          context: `...${ctx}...`,
          question: `Your text mentions "${brand}". How should we handle this brand name?`,
          options: [
            { label: 'Keep original', value: 'keep', description: `Keep "${brand}" in English — global brand recognition` },
            { label: 'Use local equivalent', value: 'adapt', description: `Replace with nearest local equivalent store/brand (may change cultural context)` },
            { label: 'Keep with explanation', value: 'footnote', description: `Keep "${brand}" + brief description for foreign readers` },
          ],
          defaultOption: 'keep',
        })
      }
      break
    }
  }

  // Scan for education terms
  for (const term of EDUCATION_TERMS) {
    const regex = new RegExp(`\\b${term.replace(/[()]/g, '\\\\$&')}\\b`, 'gi')
    const matches = Array.from(text.matchAll(regex))
    for (const match of matches.slice(0, 2)) {
      const start = Math.max(0, match.index! - 60)
      const end = Math.min(text.length, match.index! + term.length + 60)
      const ctx = text.slice(start, end).replace(/\n+/g, ' ')

      const existing = findings.find(f => f.original.toLowerCase() === term.toLowerCase())
      if (!existing) {
        findings.push({
          type: 'country_specific',
          original: term,
          context: `...${ctx}...`,
          question: `Your text mentions "${term}" — a US/UK education term. For ${langName} readers, should we keep or explain it?`,
          options: [
            { label: 'Keep original', value: 'keep', description: `Keep "${term}" — appropriate if story stays in original education system` },
            { label: 'Add brief explanation', value: 'footnote', description: `Keep term + add Translation Note explaining the system` },
            { label: 'Use local equivalent', value: 'adapt', description: `Replace with nearest ${langName} education equivalent (may change meaning)` },
          ],
          defaultOption: 'keep',
        })
      }
      break
    }
  }

  // Scan for country-specific terms (US)
  for (const term of US_TERMS) {
    const regex = new RegExp(`\\b${term.replace(/[()]/g, '\\\\$&')}\\b`, 'gi')
    const matches = Array.from(text.matchAll(regex))
    for (const match of matches.slice(0, 3)) {
      const start = Math.max(0, match.index! - 80)
      const end = Math.min(text.length, match.index! + term.length + 80)
      const context = text.slice(start, end).replace(/\n+/g, ' ')

      const existing = findings.find(f => f.type === 'country_specific' && f.original === term)
      if (!existing) {
        findings.push({
          type: 'country_specific',
          original: term,
          context: `...${context}...`,
          question: `Your text mentions "${term}" — a US-specific term. For your ${langName} translation, how should we handle this?`,
          options: [
            { label: 'Keep original', value: 'keep', description: `Keep "${term}" in English with brief ${langName} explanation` },
            { label: 'Adapt to local equivalent', value: 'adapt', description: `Replace with nearest ${langName} equivalent (may change meaning)` },
            { label: 'Keep with footnote', value: 'footnote', description: `Keep original + add Translation Note` },
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
          question: `Your text mentions "${term}" — a UK-specific term. For your ${langName} translation, how should we handle this?`,
          options: [
            { label: 'Keep original', value: 'keep', description: `Keep "${term}" in English with brief explanation` },
            { label: 'Adapt to local equivalent', value: 'adapt', description: `Replace with nearest ${langName} equivalent` },
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
    const { text, genre, languages, maxFindings = 8 } = await request.json()
    const targetLang = languages?.[0] || 'de'

    if (!text || text.length < 50) {
      return NextResponse.json({ findings: [] })
    }

    // Phase 1: Fast keyword scan (language-aware)
    const keywordFindings = keywordScan(text, languages || ['de'])

    // Phase 2: AI-enhanced scan for proper names and fantasy elements
    let aiFindings: Finding[] = []
    const targetLangName = getLangName(targetLang)

    try {
      const sampleText = text.length > 3000 ? text.slice(0, 3000) + '...' : text
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        system: `You are a pre-translation content scanner for BookLingua, a professional literary translation service. Your job is to quickly scan a text and identify elements that need author guidance before translation begins.`,
        messages: [{
          role: 'user',
          content: `Scan this text for translation-relevant items. Return ONLY a JSON array of findings. Each finding should have:
- "type": "proper_name" | "fantasy_element" | "potentially_ambiguous"
- "original": the exact term or phrase
- "question": what to ask the author
- "options": array of {label, value, description} choices
- "defaultOption": the recommended default value

Focus on:
1. PROPER NAMES (people names, place names, fictional locations) — ask if they should be translated, kept, or adapted
2. FANTASY ELEMENTS (if genre is fantasy/sci-fi) — invented terms, magic systems, creature names — ask if untranslatable

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
