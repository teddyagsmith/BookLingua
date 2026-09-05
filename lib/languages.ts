export const CORE_LANGUAGES = [
  { code: 'es-es', name: 'Spanish (Spain)', flag: '🇪🇸', market: 'Spain · Castilian' },
  { code: 'es-latam', name: 'Spanish (Latin America)', flag: '🌎', market: 'Mexico, Colombia, Argentina+' },
  { code: 'fr', name: 'French', flag: '🇫🇷', market: '300M+ speakers' },
  { code: 'de', name: 'German', flag: '🇩🇪', market: '100M+ speakers' },
  { code: 'it', name: 'Italian', flag: '🇮🇹', market: '65M+ speakers' },
  { code: 'pl', name: 'Polish', flag: '🇵🇱', market: '50M+ speakers' },
  { code: 'ja', name: 'Japanese', flag: '🇯🇵', market: '125M+ speakers' },
  { code: 'pt-pt', name: 'Portuguese (Portugal)', flag: '🇵🇹', market: 'Portugal · European' },
  { code: 'pt-br', name: 'Portuguese (Brazil)', flag: '🇧🇷', market: 'Brazil · 215M speakers' },
] as const

export const CORE_LANGUAGE_CODES = new Set<string>(CORE_LANGUAGES.map(language => language.code))
