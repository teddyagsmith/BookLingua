/** Canonical internal locale IDs. External BCP-47 metadata is derived at the edge. */
export const LOCALE_ALIASES: Record<string, string> = { 'es-419': 'es-latam' }
export function normalizeLocale(locale: string): string { const value=String(locale||'').trim().toLowerCase(); return LOCALE_ALIASES[value] || value }
export function normalizeLocales(locales: string[]): string[] { return locales.map(normalizeLocale) }
export function localeDisplayName(locale: string): string { return ({'es-es':'Spanish (Spain)','es-latam':'Spanish (Latin America)',fr:'French',de:'German',it:'Italian',pl:'Polish',ja:'Japanese','pt-pt':'Portuguese (Portugal)','pt-br':'Portuguese (Brazil)'} as Record<string,string>)[normalizeLocale(locale)] || normalizeLocale(locale) }
export function localeEpubTag(locale: string): string { return ({'es-latam':'es-419','es-es':'es-ES','pt-br':'pt-BR','pt-pt':'pt-PT'} as Record<string,string>)[normalizeLocale(locale)] || normalizeLocale(locale) }
