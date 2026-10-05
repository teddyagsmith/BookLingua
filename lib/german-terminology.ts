/** Stable German house terminology that must not depend on model wording. */
export function normalizeGermanTerminology(value: string): string {
  return value
    .replace(/\bHigh[ -]?School[ -]?Abschluss\b/gi, 'Highschoolabschluss')
    .replace(/\bHighschool-Abschluss\b/gi, 'Highschoolabschluss')
    .replace(/\bHigh[ -]School\b/gi, 'Highschool')
}

export const GERMAN_HIGHSCHOOL_GUIDANCE = 'Use Duden spelling “Highschool” throughout (including “Highschoolabschluss”, not “High School”, “High-School”, or “Highschool-Abschluss”). When an author-selected first-occurrence explanation is required, use the standard wording “Highschool: die amerikanische Oberstufe”.'
