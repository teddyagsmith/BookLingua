import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

// Known country-specific terms to flag
const US_TERMS = [
  'W-4', 'W-2', '1099', '1040', 'IRS', 'FICA', 'Social Security', 'Medicare',
  'Roth IRA', '401(k)', '403(b)', '529 plan', 'HSA', 'FSA',
  'District Attorney', 'Miranda rights', 'FBI', 'precinct', 'Sheriff', 'SWAT',
  'Oval Office', 'Secretary of State', 'DMV', 'Realtor', 'MLS',
  'ZIP code', 'NFL', 'NBA', 'MLB', 'NHL', 'NCAA',
  'FAFSA', 'Pell Grant', 'SAT', 'ACT',
  'CVS', 'Walgreens', 'Rite Aid',
  'FTC', 'SEC', 'EPA', 'FDA', 'OSHA',
  'SSN', 'EIN', 'Chapter 7', 'Chapter 11', 'Chapter 13',
  'pay stub', 'paycheck', 'withholding', 'federal tax',
]

const UK_TERMS = [
  'NHS', 'GP surgery', 'A&E',
  'barrister', 'solicitor', 'magistrate',
  'HMRC', 'National Insurance', 'council tax',
  'A-levels', 'GCSE', 'Oxbridge',
  'Tesco', 'Sainsbury', 'Waitrose', 'Boots',
  'Prime Minister', 'House of Commons',
  'DVLA', 'MOT', 'P45', 'P60',
]

// Measurement units
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
  { term: 'ounce', unit: 'g', context: 'weight' },
  { term: 'ounces', unit: 'g', context: 'weight' },
  { term: 'gallon', unit: 'litres', context: 'volume' },
  { term: 'gallons', unit: 'litres', context: 'volume' },
  { term: 'Fahrenheit', unit: 'Celsius', context: 'temperature' },
  { term: 'mph', unit: 'km/h', context: 'speed' },
  { term: 'square feet', unit: 'm²', context: 'area' },
  { term: 'acres', unit: 'hectares', context: 'area' },
]

// Global brands
const BRAND_NAMES = [
  'Walmart', 'Target', 'Costco', 'Best Buy', 'Home Depot',
  "McDonald's", 'Burger King', "Wendy's", "Applebee's", "Denny's", 'IHOP',
  'Starbucks', "Dunkin'", 'Tim Hortons',
  'KFC', 'Pizza Hut', "Domino's",
  'Bank of America', 'Wells Fargo', 'Citibank',
  'FedEx', 'UPS', 'USPS',
]

// Education system terms
const EDUCATION_TERMS = [
  'high school', 'middle school', 'elementary school',
  'sophomore', 'junior', 'senior', 'freshman',
  'GPA', 'valedictorian',
  'LSAT', 'MCAT', 'GRE', 'GMAT',
  'AP class', 'AP exam', 'Advanced Placement',
  'fraternity', 'sorority', 'Greek life',
  'homecoming', 'prom',
]

const LANGUAGE_NAMES: Record<string, string> = {
  'es-es': 'Spanish', 'es-latam': 'Spanish (Latin America)',
  'fr': 'French', 'de': 'German',
  'pt-pt': 'Portuguese', 'pt-br': 'Portuguese (Brazil)',
  'it': 'Italian', 'pl': 'Polish', 'ja': 'Japanese',
}

function getLangName(code: string): string {
  return LANGUAGE_NAMES[code] || code
}

// Simple word boundary check — no regex escaping needed
function findTerm(text: string, term: string): number {
  const tl = text.toLowerCase()
  const trl = term.toLowerCase()
  let idx = 0
  while (idx < tl.length) {
    const found = tl.indexOf(trl, idx)
    if (found === -1) return -1
    const before = found === 0 ? '' : tl[found - 1]
    const after = found + trl.length >= tl.length ? '' : tl[found + trl.length]
    const beforeOk = !before || !/[a-z0-9]/.test(before)
    const afterOk = !after || !/[a-z0-9]/.test(after)
    if (beforeOk && afterOk) return found
    idx = found + 1
  }
  return -1
}

function getContext(text: string, idx: number, termLen: number): string {
  const start = Math.max(0, idx - 60)
  const end = Math.min(text.length, idx + termLen + 60)
  return `...${text.slice(start, end).replace(/\n+/g, ' ')}...`
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
  const isMultiLang = languages.length > 1
  const langName = isMultiLang
    ? `${languages.length} target languages`
    : getLangName(languages[0] || 'de')
  const langRef = isMultiLang ? 'target language' : langName

  // Measurements
  for (const { term, unit, context } of MEASUREMENT_TERMS) {
    const idx = findTerm(text, term)
    if (idx !== -1) {
      const existing = findings.find(f => f.original.toLowerCase() === term.toLowerCase())
      if (!existing) {
        findings.push({
          type: 'potentially_ambiguous',
          original: term,
          context: getContext(text, idx, term.length),
          question: `Your text uses "${term}" (${context}). For ${langName}${isMultiLang ? ' readers' : ''}, should we convert to ${unit}?`,
          options: [
            { label: `Convert to ${unit}`, value: 'convert', description: `Replace with metric equivalent throughout` },
            { label: 'Keep original', value: 'keep', description: `Keep "${term}" as-is (e.g. if story is set in the US/UK)` },
            { label: 'Convert with note', value: 'footnote', description: `Use ${unit} + add Translation Note` },
            { label: 'Not a measurement — just a regular word', value: 'false_positive', description: `This is a normal use of "${term}" (e.g. "a few miles away" vs. a brand name)` },
          ],
          defaultOption: 'convert',
        })
      }
    }
  }

  // Brands
  for (const brand of BRAND_NAMES) {
    const idx = findTerm(text, brand)
    if (idx !== -1) {
      const existing = findings.find(f => f.original === brand)
      if (!existing) {
        findings.push({
          type: 'potentially_ambiguous',
          original: brand,
          context: getContext(text, idx, brand.length),
          question: `Your text mentions "${brand}". How should we handle this brand name?`,
          options: [
            { label: 'Keep original', value: 'keep', description: `Keep "${brand}" — global brand recognition` },
            { label: 'Use local equivalent', value: 'adapt', description: `Replace with nearest local equivalent` },
            { label: 'Keep with explanation', value: 'footnote', description: `Keep "${brand}" + brief description` },
            { label: 'Not a brand — just a regular word', value: 'false_positive', description: `This is a normal use of the word "${brand}" (e.g. "target audience" not the store)` },
          ],
          defaultOption: 'keep',
        })
      }
    }
  }

  // Education terms
  for (const term of EDUCATION_TERMS) {
    const idx = findTerm(text, term)
    if (idx !== -1) {
      const existing = findings.find(f => f.original.toLowerCase() === term.toLowerCase())
      if (!existing) {
        findings.push({
          type: 'country_specific',
          original: term,
          context: getContext(text, idx, term.length),
          question: `Your text mentions "${term}" — a US/UK education term. For ${langRef} readers, keep or explain?`,
          options: [
            { label: 'Keep original', value: 'keep', description: `Keep "${term}" — appropriate if story stays in original education system` },
            { label: 'Add brief explanation', value: 'footnote', description: `Keep English + add local equivalent in brackets on first mention (e.g. "${term} (local equivalent)"), then just "${term}" afterwards` },
            { label: 'Use local equivalent', value: 'adapt', description: `Replace with nearest local equivalent` },
            { label: 'Not an education term — just a regular word', value: 'false_positive', description: `This is a normal use of the word "${term}" (e.g. "act" as a verb, not the test)` },
          ],
          defaultOption: 'keep',
        })
      }
    }
  }

  // US terms
  for (const term of US_TERMS) {
    const idx = findTerm(text, term)
    if (idx !== -1) {
      const existing = findings.find(f => f.type === 'country_specific' && f.original === term)
      if (!existing) {
        findings.push({
          type: 'country_specific',
          original: term,
          context: getContext(text, idx, term.length),
          question: `Your text mentions "${term}" — a US-specific term. For your ${langRef} translation${isMultiLang ? 's' : ''}, how should we handle it?`,
          options: [
            { label: 'Keep original', value: 'keep', description: `Keep "${term}" in English with brief ${langRef} explanation` },
            { label: 'Adapt to local equivalent', value: 'adapt', description: `Replace with nearest ${langRef} equivalent (may change meaning)` },
            { label: 'Keep with inline bracket', value: 'footnote', description: `Keep English + add local equivalent in brackets on first mention (e.g. "${term} (local equivalent)"), then just "${term}" afterwards` },
            { label: 'Not a US term — just a regular word', value: 'false_positive', description: `This is a normal use of the word "${term}" (e.g. "target" as a verb, not the store)` },
          ],
          defaultOption: 'keep',
        })
      }
    }
  }

  // UK terms
  for (const term of UK_TERMS) {
    const idx = findTerm(text, term)
    if (idx !== -1) {
      const existing = findings.find(f => f.type === 'country_specific' && f.original === term)
      if (!existing) {
        findings.push({
          type: 'country_specific',
          original: term,
          context: getContext(text, idx, term.length),
          question: `Your text mentions "${term}" — a UK-specific term. For your ${langRef} translation${isMultiLang ? 's' : ''}, how should we handle it?`,
          options: [
            { label: 'Keep original', value: 'keep', description: `Keep "${term}" in English with brief explanation` },
            { label: 'Adapt to local equivalent', value: 'adapt', description: `Replace with nearest ${langRef} equivalent` },
            { label: 'Keep with inline bracket', value: 'footnote', description: `Keep English + add local equivalent in brackets on first mention (e.g. "${term} (local equivalent)"), then just "${term}" afterwards` },
            { label: 'Not a UK term — just a regular word', value: 'false_positive', description: `This is a normal use of the word "${term}" (e.g. "prime" as an adjective, not the office)` },
          ],
          defaultOption: 'keep',
        })
      }
    }
  }

  return findings
}

export async function POST(request: NextRequest) {
  try {
    const { sessionId, text, genre, languages, maxFindings = 8 } = await request.json()

    let textToScan = ''

    // If sessionId provided, fetch from database (handles all formats)
    if (sessionId) {
      const { data, error } = await supabaseAdmin
        .from('temp_uploads')
        .select('content, file_format')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (error || !data) {
        console.error('Scan: failed to fetch upload:', error)
        return NextResponse.json({ findings: [] })
      }

      if (data.file_format === '.docx') {
        // DOCX content is JSON with { text, binary }
        try {
          const parsed = JSON.parse(data.content)
          textToScan = parsed.text || ''
        } catch {
          textToScan = data.content
        }
      } else {
        textToScan = data.content || ''
      }
    } else if (text) {
      textToScan = text
    }

    if (!textToScan || textToScan.length < 50) {
      return NextResponse.json({ findings: [] })
    }

    // Phase 1: Fast keyword scan
    const keywordFindings = keywordScan(textToScan, languages || ['de'])

    // Phase 2: AI scan for proper names and fantasy elements
    let aiFindings: Finding[] = []
    const targetLangName = getLangName(languages?.[0] || 'de')

    try {
      const sampleText = textToScan.length > 3000 ? textToScan.slice(0, 3000) + '...' : textToScan
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: `You are a pre-translation content scanner for BookLingua. Scan text for proper names and fantasy elements that need author guidance. Be concise.`,
        messages: [{
          role: 'user',
          content: `Scan for: (1) character names or place names that may need translation decisions, (2) fantasy/invented terms if genre is fantasy/sci-fi.

Genre: ${genre || 'unknown'}
Target language: ${targetLangName}

TEXT:
${sampleText}

Return ONLY a JSON array (max 3 items). Each item: {"type":"proper_name"|"fantasy_element","original":"term","question":"ask author","options":[{"label":"...","value":"keep|translate|adapt","description":"..."}],"defaultOption":"keep"}

If nothing notable, return [].`
        }]
      })

      const aiText = response.content[0].type === 'text' ? response.content[0].text : ''
      const jsonMatch = aiText.match(/\[[\s\S]*?\]/)
      if (jsonMatch) {
        aiFindings = JSON.parse(jsonMatch[0])
      }
    } catch (err) {
      console.warn('[scan-text] AI scan failed, using keyword-only:', err)
    }

    // Merge, deduplicate, prioritise country_specific
    const allFindings = [...keywordFindings]
    for (const ai of aiFindings) {
      const dup = allFindings.find(f => f.original.toLowerCase() === ai.original.toLowerCase())
      if (!dup) allFindings.push(ai)
    }

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
