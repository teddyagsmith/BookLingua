/**
 * BookLingua Artifact Detection Gate
 * 
 * Scans translated text and built output for pipeline infrastructure artifacts.
 * Hard fails if any template markers, paragraph numbering, or JSON fragments are found.
 * 
 * This is the last line of defense before content reaches the customer.
 */

export interface ArtifactCheckResult {
  clean: boolean
  violations: string[]
  context: string[]  // Lines containing violations for debugging
}

// Patterns that must NEVER appear in customer-facing output
const ARTIFACT_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  // JSON/template structure markers
  { name: 'JSON type field', pattern: /"type"\s*:\s*"(body|dialogue|scene_break|heading)"/ },
  { name: 'JSON index field', pattern: /"index"\s*:\s*\d+/ },
  { name: 'JSON chapter array', pattern: /\{\s*"chapters"\s*:/ },
  { name: 'Template version', pattern: /"version"\s*:\s*"\d+\.\d+"/ },
  
  // Paragraph numbering (from translation prompt)
  { name: 'Paragraph numbering P1:', pattern: /P\d+\s*[:\-]\s*\S/ },
  { name: 'Paragraph numbering [P1]', pattern: /\[P\d+\]/ },
  
  // Pipeline segment markers
  { name: 'Segment marker', pattern: /###SEGMENT\d+###/ },
  { name: 'Segment start/end', pattern: /===SEGMENT_\d+_(START|END)===/ },
  { name: 'Template marker', pattern: /===TEMPLATE[\w_]*===/ },
  
  // Chapter/heading markers that should be stripped
  { name: 'Chapter marker', pattern: /###CHAPTER:[^#]*###/ },
  { name: 'Heading marker', pattern: /###H[1-6]:[^#]*###/ },
  { name: 'Segment marker (colon)', pattern: /###SEGMENT:\d+:\w+:\d+###/ },
  
  // Editorial markers that should not leak
  { name: 'Original text marker', pattern: /\[\[ORIGINAL:[^\]]*\]\]/ },
  { name: 'Translation notes block', pattern: /===TRANSLATION_NOTES===[\s\S]*?===END_NOTES===/ },
  { name: 'Translation notes open', pattern: /===TRANSLATION_NOTES===[\s\S]*$/ },
]

/**
 * Scan text for pipeline artifacts.
 * Returns clean=true if no artifacts found, clean=false with violations list otherwise.
 */
export function detectArtifacts(text: string): ArtifactCheckResult {
  const violations: string[] = []
  const context: string[] = []
  const lines = text.split('\n')

  for (const { name, pattern } of ARTIFACT_PATTERNS) {
    // Check full text
    if (pattern.test(text)) {
      violations.push(name)
      
      // Find context lines
      for (let i = 0; i < lines.length; i++) {
        if (pattern.test(lines[i])) {
          const start = Math.max(0, i - 1)
          const end = Math.min(lines.length, i + 2)
          context.push(`Line ${i + 1}: ${lines[i].slice(0, 100)}`)
          // Also add surrounding lines
          for (let j = start; j < end; j++) {
            if (j !== i) {
              context.push(`  [context ${j + 1}]: ${lines[j].slice(0, 100)}`)
            }
          }
        }
      }
    }
  }

  const uniqueViolations = Array.from(new Set(violations))
  const uniqueContext    = Array.from(new Set(context))
  return {
    clean: uniqueViolations.length === 0,
    violations: uniqueViolations,
    context: uniqueContext,
  }
}

/**
 * Gate check — hard fail if artifacts found.
 * Call this before storing translated text or before building output files.
 */
export function artifactGate(text: string, stage: string): void {
  const result = detectArtifacts(text)
  
  if (!result.clean) {
    const error = new Error(
      `ARTIFACT GATE FAILED at stage: ${stage}\n` +
      `Violations: ${result.violations.join(', ')}\n` +
      `Context:\n${result.context.slice(0, 20).join('\n')}`
    )
    ;(error as any).artifactResult = result
    ;(error as any).isArtifactGate = true
    throw error
  }
}

/**
 * Safe strip — remove all known pipeline markers from text.
 * Call this on translated text before storing or building output.
 */
export function stripAllMarkers(text: string): string {
  return text
    // Segment markers
    .replace(/===SEGMENT_\d+_(START|END)===\n?/g, '')
    .replace(/###SEGMENT:\d+:\w+:\d+###\n?/g, '')
    .replace(/###SEGMENT\d+###\n?/g, '')
    // Chapter/heading markers
    .replace(/###CHAPTER:[^#]*###\n?/g, '')
    .replace(/###H[1-6]:[^#]*###\n?/g, '')
    // Template markers
    .replace(/===TEMPLATE[\w_]*===\n?/g, '')
    // Editorial markers
    .replace(/\[\[ORIGINAL:([^\]]|\](?!\]))*\]\]/g, '')
    .replace(/===TRANSLATION_NOTES===([\s\S]*?)(===END_NOTES===|===TRANSLATION_NOTES===)/g, '')
    .replace(/===TRANSLATION_NOTES===([\s\S]*)$/, '')
    .replace(/===END_NOTES===\n?/g, '')
    // Paragraph numbering
    .replace(/^P\d+\s*[:\-]\s*/gm, '')
    .replace(/^\[P\d+\]\s*/gm, '')
    // General
    .replace(/===\w[\w_]*===\n?/g, '')
    .trim()
}
