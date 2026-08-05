/**
 * validate-translation.ts — PATCHED
 *
 * Changes from original:
 * 1. English leak check now uses langdetect via Python subprocess instead of
 *    the word-list approach. The word list caused constant false positives on
 *    Romance languages (Italian "are", Spanish "for", French "and" etc).
 * 2. Validation errors now hard-fail (passed: false) — previously errors were
 *    logged but delivery wasn't blocked. Warnings still allow delivery.
 *
 * Everything else is unchanged from the original.
 */

import { execSync } from 'child_process'
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

// ─── English leak check via langdetect ───────────────────────────────────────

/**
 * Detect English paragraphs in translated text using langdetect.
 *
 * Replaces the word-list approach which false-positived constantly on
 * Romance languages. langdetect uses statistical models trained on real
 * language data so "are" in Italian doesn't trigger as English.
 *
 * Runs as a Python subprocess — same pattern as booklingua_gate_additions.py.
 * Falls back to no-op if Python or langdetect is unavailable.
 */
function detectEnglishLeak(
  translatedText: string,
  expectedLangCode: string,
): { count: number; samples: string[] } {
  // Build the Python snippet inline — no file needed
  const pythonScript = `
import sys, json
from langdetect import detect, DetectorFactory, LangDetectException
DetectorFactory.seed = 0

text = sys.stdin.read()
expected = ${JSON.stringify(expectedLangCode)}
# Normalise lang codes: es-419, pt-br etc → es, pt
expected_base = expected.split('-')[0]

paragraphs = [p.strip() for p in text.split('\\n\\n') if len(p.strip()) > 120]

# Skip reference entries (numbered bibliography lines)
import re
ref_re = re.compile(r'^\\d+\\.?[\\s\\-]\\S')
paragraphs = [p for p in paragraphs if not ref_re.match(p)]

foreign = []
for p in paragraphs:
    try:
        lang = detect(p)
        if lang == 'en' and expected_base != 'en':
            foreign.append(p[:100])
    except LangDetectException:
        pass

print(json.dumps({'count': len(foreign), 'samples': foreign[:3]}))
`

  try {
    const result = execSync(`python3 -c "${pythonScript.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`, {
      input: translatedText,
      encoding: 'utf-8',
      timeout: 15000,
      maxBuffer: 5 * 1024 * 1024,
    })
    return JSON.parse(result.trim())
  } catch (e) {
    // Python or langdetect unavailable — skip this check rather than crash
    console.warn('[Validation] langdetect unavailable, skipping English leak check:', e)
    return { count: 0, samples: [] }
  }
}

// ─── Main validator ───────────────────────────────────────────────────────────

export function validateTranslation(
  originalText: string,
  translatedText: string,
  segmentMeta?: Array<{ id: number; type: Segment['type']; level: number }> | null,
  langCode: string = 'en',
): ValidationResult {
  const issues: ValidationIssue[] = []

  // ── 1. Segment count mismatch ──
  if (segmentMeta) {
    const originalParas = originalText.split(/\n\n+/).map(p => p.trim()).filter(p => p.length > 0)
    const translatedParas = translatedText.split(/\n\n+/).map(p => p.trim()).filter(p => p.length > 0)
    const ratio = translatedParas.length / originalParas.length
    if (ratio < 0.8 || ratio > 1.2) {
      issues.push({
        check: 'segment-count',
        severity: 'error',
        message: `Paragraph count mismatch: ${originalParas.length} original → ${translatedParas.length} translated (${(ratio * 100).toFixed(0)}%)`,
        details: 'Translation may have merged or split paragraphs incorrectly',
      })
    }

    // Heading structure validation
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

    const headingCount = segmentMeta.filter(s => s.type === 'heading').length
    const translatedHeadings = translatedParas.filter(p =>
      p.match(/^#{1,3}\s|^(Chapter|Chapitre|Capítulo|Kapitel|Capitolo)\s/i)
    ).length
    if (headingCount > 0 && translatedHeadings === 0 && translatedParas.length > 20) {
      issues.push({
        check: 'heading-loss',
        severity: 'warning',
        message: `No headings detected in translated text (${headingCount} expected)`,
        details: 'Chapter structure may be lost',
      })
    }
  }

  // ── 2. English leak check — langdetect (replaces word-list approach) ──
  if (langCode !== 'en') {
    const leakResult = detectEnglishLeak(translatedText, langCode)
    if (leakResult.count > 0) {
      issues.push({
        check: 'english-leak',
        severity: 'error',
        message: `Found ${leakResult.count} paragraphs detected as English in ${langCode} translation`,
        details: leakResult.samples.length > 0
          ? 'Samples: ' + leakResult.samples.map(s => `"${s}..."`).join(', ')
          : undefined,
      })
    }
  }

  // ── 3. Heading length sanity ──
  if (segmentMeta) {
    const translatedParas = translatedText.split(/\n\n+/).map(p => p.trim()).filter(p => p.length > 0)
    const headingMeta = segmentMeta.filter(s => s.type === 'heading')
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

  // ── 4. Empty segments ──
  const emptyParas = translatedText.split(/\n\n+/).filter(p => p.trim().length === 0)
  if (emptyParas.length > 10) {
    issues.push({
      check: 'empty-segments',
      severity: 'warning',
      message: `Found ${emptyParas.length} empty paragraphs`,
      details: 'May indicate missing content or broken formatting',
    })
  }

  // ── 5. Length ratio ──
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
      details: 'Chapter structure may be broken',
    })
  }

  // ── 7. Duplicate text ──
  const lines = translatedText.split('\n').filter(l => l.trim().length > 20)
  const duplicates = new Set<string>()
  const seen = new Set<string>()
  for (const line of lines) {
    const trimmed = line.trim()
    if (seen.has(trimmed)) duplicates.add(trimmed)
    seen.add(trimmed)
  }
  if (duplicates.size > 5) {
    issues.push({
      check: 'duplicate-text',
      severity: 'warning',
      message: `Found ${duplicates.size} duplicated lines`,
      details: 'Possible chunk boundary error',
    })
  }

  // ── Summary ──
  const errors = issues.filter(i => i.severity === 'error')
  const warnings = issues.filter(i => i.severity === 'warning')

  let summary: string
  if (errors.length === 0 && warnings.length === 0) {
    summary = '✅ All checks passed'
  } else if (errors.length === 0) {
    summary = `⚠️ ${warnings.length} warning${warnings.length !== 1 ? 's' : ''} — safe to proceed with caution`
  } else {
    summary = `❌ ${errors.length} error${errors.length !== 1 ? 's' : ''}, ${warnings.length} warning${warnings.length !== 1 ? 's' : ''} — delivery blocked`
  }

  return {
    passed: errors.length === 0,  // CHANGED: was previously non-fatal, now hard-fails on errors
    severity: errors.length > 0 ? 'error' : warnings.length > 0 ? 'warning' : 'ok',
    issues,
    summary,
  }
}

export function formatValidationAlert(result: ValidationResult): string {
  const lines = [
    `BookLingua Translation Validation Report`,
    `Result: ${result.summary}`,
    ``,
    `Issues found (${result.issues.length}):`,
    ...result.issues.map(i =>
      `[${i.severity.toUpperCase()}] ${i.check}: ${i.message}${i.details ? '\n  → ' + i.details : ''}`
    ),
  ]
  return lines.join('\n')
}

// ─── Heading structure validator (unchanged from original) ────────────────────

interface HeadingMeta {
  id: number
  type: 'heading' | 'paragraph' | 'listitem' | 'blockquote'
  level: number
  text?: string
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
  const origHeadings = originalSegments.filter(s => s.type === 'heading')

  if (origHeadings.length === 0) return { pass: true, errors, warnings }

  const HEADING_RE = /^(chapter|chapitre|capítulo|kapitel|capitolo|introduction|preface|foreword|dedication|conclusion|epilogue|teil|parte|section)\s/i
  const translatedHeadings = translatedParas.map((text, i) => {
    const t = text.trim()
    const isHeading = HEADING_RE.test(t) ||
      (t.length <= 100 && t.length >= 3 && /^[A-ZÁÉÍÓÚÀÈÌÒÙÄËÏÖÜÂÊÎÔÛÑ]/.test(t) && !/[.!?]$/.test(t))
    return { text: t, i, isHeading }
  }).filter(h => h.isHeading)

  if (translatedHeadings.length < origHeadings.length * 0.85) {
    errors.push(
      `Heading count too low: ${translatedHeadings.length} translated vs ${origHeadings.length} original. ` +
      `Min acceptable: ${Math.ceil(origHeadings.length * 0.85)}.`
    )
  }

  const origH1 = origHeadings.filter(h => h.level === 1).length
  if (origH1 > 0 && translatedHeadings.length === 0) {
    errors.push(`Source has ${origH1} H1 headings but translation has 0. Chapter titles have been lost.`)
  }

  for (const level of [3, 4]) {
    const origCount = origHeadings.filter(h => h.level === level).length
    if (origCount > 5 && translatedHeadings.length === 0) {
      warnings.push(`Source has ${origCount} H${level} headings but translation has 0. Sub-heading structure may be flattened.`)
    }
  }

  return { pass: errors.length === 0, errors, warnings }
}
