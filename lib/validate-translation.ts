import { Segment } from './extract-segments'

export interface ValidationIssue {
  check: string
  severity: 'warning' | 'error'
  message: string
  details?: string
}

export interface ValidationResult {
  passed: boolean
  severity: 'ok' | 'warning' | 'error'
  issues: ValidationIssue[]
  summary: string
}

/**
 * Rule-based validator — no model calls, just code checks.
 * Runs after translation completes, before saving to database.
 * If validation fails, the order is blocked from delivery and flagged for manual review.
 */
export function validateTranslation(
  originalText: string,
  translatedText: string,
  segmentMeta?: Array<{ id: number; type: Segment['type']; level: number }> | null,
  langCode: string = 'en',
): ValidationResult {
  const issues: ValidationIssue[] = []

  // ── 1. Segment count mismatch (if metadata available) ──
  if (segmentMeta) {
    const originalParas = originalText
      .split(/\n\n+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0)

    const translatedParas = translatedText
      .split(/\n\n+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0)

    const ratio = translatedParas.length / originalParas.length
    if (ratio < 0.8 || ratio > 1.2) {
      issues.push({
        check: 'segment-count',
        severity: 'error',
        message: `Paragraph count mismatch: ${originalParas.length} original → ${translatedParas.length} translated (${(ratio * 100).toFixed(0)}%)`,
        details: 'Translation may have merged or split paragraphs incorrectly',
      })
    }

    // Heading structure validation (NEW — blocking)
    const headingCheck = validateHeadingStructure(segmentMeta, translatedParas)
    if (!headingCheck.pass) {
      headingCheck.errors.forEach(e => issues.push({
        check: 'heading-structure',
        severity: 'error',
        message: e,
        details: 'Heading hierarchy lost during translation. Rebuild required.',
      }))
    }
    headingCheck.warnings.forEach(w => issues.push({
      check: 'heading-structure',
      severity: 'warning',
      message: w,
    }))

    // Heading count mismatch (old check, now relaxed)
    const headingCount = segmentMeta.filter((s) => s.type === 'heading').length
    const translatedHeadings = translatedParas.filter((p) => p.match(/^#{1,3}\s|^(Chapter|Chapitre|Capítulo|Kapitel|Capitolo)\s/i)).length
    if (headingCount > 0 && translatedHeadings === 0 && translatedParas.length > 20) {
      issues.push({
        check: 'heading-loss',
        severity: 'warning',
        message: `No headings detected in translated text (${headingCount} expected)`,
        details: 'Chapter structure may be lost — headings might be plain paragraphs',
      })
    }
  }

  // ── 2. English leak check ──
  // ... rest of existing validation code ...
  // Sample chunks of 500 chars, check for >30% English words
  const chunks = translatedText.match(/.{1,500}/g) || []
  const englishWords = [
    'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'any', 'can',
    'had', 'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him',
    'his', 'how', 'man', 'new', 'now', 'old', 'see', 'two', 'way', 'who',
    'boy', 'did', 'its', 'let', 'put', 'say', 'she', 'too', 'use', 'with',
    'have', 'from', 'they', 'know', 'want', 'been', 'good', 'much', 'some',
    'time', 'very', 'when', 'come', 'here', 'just', 'like', 'long', 'make',
    'many', 'over', 'such', 'take', 'than', 'them', 'well', 'were', 'will',
  ]

  const suspiciousChunks = chunks.filter((chunk) => {
    const words = chunk.toLowerCase().split(/\s+/)
    const englishCount = words.filter((w) => englishWords.includes(w)).length
    return englishCount / words.length > 0.3 && words.length > 10
  })

  if (suspiciousChunks.length > 0) {
    issues.push({
      check: 'english-leak',
      severity: 'error',
      message: `Found ${suspiciousChunks.length} chunks with >30% common English words`,
      details: 'English text may have leaked into the translation. Check samples: ' +
        suspiciousChunks.slice(0, 2).map((c) => `"${c.substring(0, 80)}..."`).join(', '),
    })
  }

  // ── 3. Heading length sanity (if metadata available) ──
  if (segmentMeta) {
    const translatedParas = translatedText
      .split(/\n\n+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0)

    const headingMeta = segmentMeta.filter((s) => s.type === 'heading')
    for (let i = 0; i < headingMeta.length && i < translatedParas.length; i++) {
      if (translatedParas[i].length > 200) {
        issues.push({
          check: 'heading-too-long',
          severity: 'warning',
          message: `Heading ${i} is ${translatedParas[i].length} chars (expected < 200)`,
          details: `Text: "${translatedParas[i].substring(0, 100)}..."`,
        })
      }
    }
  }

  // ── 4. Empty/missing segments ──
  const allParas = translatedText.split(/\n\n+/)
  const emptyParas = allParas.filter((p) => p.trim().length === 0)
  if (emptyParas.length > 10) {
    issues.push({
      check: 'empty-segments',
      severity: 'warning',
      message: `Found ${emptyParas.length} empty paragraphs`,
      details: 'May indicate missing content or broken formatting',
    })
  }

  // ── 5. Book length ratio ──
  const lengthRatio = translatedText.length / originalText.length
  if (lengthRatio < 0.5 || lengthRatio > 2.0) {
    issues.push({
      check: 'length-ratio',
      severity: 'error',
      message: `Length ratio ${lengthRatio.toFixed(2)} (expected 0.5–2.0)`,
      details: `Original: ${originalText.length} chars, Translated: ${translatedText.length} chars`,
    })
  }

  // ── 6. Chapter marker preservation ──
  const originalMarkers = (originalText.match(/###CHAPTER:/g) || []).length
  const translatedMarkers = (translatedText.match(/###CHAPTER:/g) || []).length
  if (originalMarkers > 0 && translatedMarkers !== originalMarkers) {
    issues.push({
      check: 'marker-loss',
      severity: 'error',
      message: `Chapter markers lost: ${originalMarkers} original → ${translatedMarkers} translated`,
      details: 'Chapter structure may be broken — markers were not preserved through translation',
    })
  }

  // ── 7. Content check — no duplicated text ──
  const lines = translatedText.split('\n').filter((l) => l.trim().length > 20)
  const duplicates = new Set<string>()
  const seen = new Set<string>()
  for (const line of lines) {
    const trimmed = line.trim()
    if (seen.has(trimmed)) {
      duplicates.add(trimmed)
    }
    seen.add(trimmed)
  }
  if (duplicates.size > 5) {
    issues.push({
      check: 'duplicate-text',
      severity: 'warning',
      message: `Found ${duplicates.size} duplicated lines`,
      details: 'Translation may have repeated content — possible chunk boundary error',
    })
  }

  // ── Summary ──
  const errors = issues.filter((i) => i.severity === 'error')
  const warnings = issues.filter((i) => i.severity === 'warning')

  let summary: string
  if (errors.length === 0 && warnings.length === 0) {
    summary = '✅ All checks passed'
  } else if (errors.length === 0) {
    summary = `⚠️ ${warnings.length} warning${warnings.length !== 1 ? 's' : ''} — safe to proceed with caution`
  } else {
    summary = `❌ ${errors.length} error${errors.length !== 1 ? 's' : ''}, ${warnings.length} warning${warnings.length !== 1 ? 's' : ''} — delivery blocked`
  }

  return {
    passed: errors.length === 0,
    severity: errors.length > 0 ? 'error' : warnings.length > 0 ? 'warning' : 'ok',
    issues,
    summary,
  }
}

/**
 * Format validation result for email/alert display.
 */
export function formatValidationAlert(result: ValidationResult): string {
  const lines = [
    `BookLingua Translation Validation Report`,
    `Result: ${result.summary}`,
    ``,
    `Issues found (${result.issues.length}):`,
    ...result.issues.map((i) =>
      `[${i.severity.toUpperCase()}] ${i.check}: ${i.message}${i.details ? '\n  → ' + i.details : ''}`
    ),
  ]
  return lines.join('\n')
}

// ─── Heading structure validator (blocking) ─────────────────────────────────

interface HeadingMeta {
  id: number
  type: 'heading' | 'paragraph' | 'listitem' | 'blockquote'
  level: number
}

interface HeadingCheckResult {
  pass: boolean
  errors: string[]
  warnings: string[]
}

function validateHeadingStructure(
  originalSegments: HeadingMeta[],
  translatedParas: string[]
): HeadingCheckResult {
  const errors: string[] = []
  const warnings: string[] = []

  const origHeadings = originalSegments.filter((s) => s.type === 'heading')

  if (origHeadings.length === 0) {
    return { pass: true, errors, warnings }
  }

  // Infer heading structure from translated text (positional + heuristic)
  const translatedHeadings = translatedParas
    .map((text, i) => ({ text, i, isHeading: false, level: 0 }))

  // Heuristic: headings are short, start with capital, don't end with period
  // Also check for known heading patterns
  const HEADING_RE = /^(chapter|chapitre|capítulo|kapitel|capitolo|introduction|preface|foreword|dedication|conclusion|epilogue|teil|parte|section|capítulo|capitulo)\s/i

  translatedHeadings.forEach((h) => {
    const t = h.text.trim()
    const len = t.length
    if (len === 0) return

    if (HEADING_RE.test(t)) {
      h.isHeading = true
      h.level = 1
      return
    }

    if (len <= 100 && len >= 3 && /^[A-ZÁÉÍÓÚÀÈÌÒÙÄËÏÖÜÂÊÎÔÛÑ]/.test(t) && !/[.!?]$/.test(t)) {
      h.isHeading = true
      h.level = 2
    }
  })

  const transHeadings = translatedHeadings.filter((h) => h.isHeading)

  // Count by level
  const origByLevel: Record<number, number> = {}
  const transByLevel: Record<number, number> = {}
  origHeadings.forEach((h) => { origByLevel[h.level] = (origByLevel[h.level] ?? 0) + 1 })
  transHeadings.forEach((h) => { transByLevel[h.level] = (transByLevel[h.level] ?? 0) + 1 })

  // Total heading count — must be within 85%
  if (transHeadings.length < origHeadings.length * 0.85) {
    errors.push(
      `Heading count too low: ${transHeadings.length} translated vs ${origHeadings.length} original. ` +
      `Min acceptable: ${Math.ceil(origHeadings.length * 0.85)}.`
    )
  }

  // H1 count — must be within 2 of source
  const origH1 = origByLevel[1] ?? 0
  const transH1 = transByLevel[1] ?? 0
  if (origH1 > 0 && transH1 === 0) {
    errors.push(
      `Source has ${origH1} H1 headings but translation has 0. ` +
      `Chapter titles have been lost or demoted.`
    )
  } else if (origH1 > 0 && transH1 < origH1 - 2) {
    errors.push(
      `H1 count mismatch: ${transH1} translated vs ${origH1} original. ` +
      `Chapter titles are being demoted to H2.`
    )
  }

  // H3/H4 — warn if source has them but translation has none
  for (const level of [3, 4]) {
    const origCount = origByLevel[level] ?? 0
    const transCount = transByLevel[level] ?? 0
    if (origCount > 5 && transCount === 0) {
      warnings.push(
        `Source has ${origCount} H${level} headings but translation has 0. ` +
        `Sub-heading structure may have been flattened.`
      )
    }
  }

  return { pass: errors.length === 0, errors, warnings }
}
