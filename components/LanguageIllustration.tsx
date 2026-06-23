// components/LanguageIllustration.tsx
// Place at: components/LanguageIllustration.tsx
//
// SVG landmark illustrations for each BookLingua language.
// Replaces the emoji flag in language cards, the checkout selector,
// and the summary strip. Pass size="sm" | "md" | "lg".
//
// Usage:
//   import LanguageIllustration from '@/components/LanguageIllustration'
//   <LanguageIllustration code="fr" size="md" />

interface Props {
  code: string       // language code from CORE_LANGUAGES
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const SIZES = {
  sm:  { px: 32,  viewBox: '0 0 64 64' },
  md:  { px: 48,  viewBox: '0 0 64 64' },
  lg:  { px: 80,  viewBox: '0 0 64 64' },
}

// Shared open-book base — right page dissolves into purple pixel dust
function BookBase() {
  return (
    <>
      {/* Left page */}
      <path d="M8 48 Q8 16 32 14 L32 54 Q20 54 8 54 Z" fill="#F7EFE4" stroke="#C4B5D9" strokeWidth="1.5"/>
      {/* Right page dissolving */}
      <path d="M56 48 Q56 16 32 14 L32 54 Q44 54 56 54 Z" fill="#F0EAF8" stroke="#C4B5D9" strokeWidth="1.5"/>
      {/* Spine */}
      <line x1="32" y1="14" x2="32" y2="54" stroke="#9B89C4" strokeWidth="2"/>
      {/* Pixel dust on right page — purple dissolve */}
      <rect x="46" y="20" width="3" height="3" fill="#7B6CA8" opacity="0.7"/>
      <rect x="51" y="17" width="2" height="2" fill="#9B89C4" opacity="0.5"/>
      <rect x="53" y="23" width="2" height="2" fill="#7B6CA8" opacity="0.4"/>
      <rect x="49" y="27" width="2" height="2" fill="#C4B5D9" opacity="0.6"/>
      <rect x="54" y="29" width="1" height="1" fill="#7B6CA8" opacity="0.5"/>
      <rect x="44" y="15" width="2" height="2" fill="#9B89C4" opacity="0.3"/>
      <rect x="57" y="19" width="1" height="1" fill="#7B6CA8" opacity="0.4"/>
      <rect x="55" y="33" width="2" height="2" fill="#C4B5D9" opacity="0.3"/>
    </>
  )
}

// Each landmark sits on the LEFT page
const LANDMARKS: Record<string, JSX.Element> = {

  // Eiffel Tower
  fr: (
    <g transform="translate(12, 16) scale(0.28)">
      {/* Tower legs */}
      <path d="M22 80 L28 40 L40 40 L46 80 Z" fill="#7B6CA8" opacity="0.9"/>
      {/* Tower body */}
      <path d="M28 40 L30 20 L38 20 L40 40 Z" fill="#7B6CA8"/>
      {/* Spire */}
      <line x1="34" y1="20" x2="34" y2="8" stroke="#7B6CA8" strokeWidth="2"/>
      {/* Cross beams */}
      <line x1="24" y1="55" x2="44" y2="55" stroke="#9B89C4" strokeWidth="1.5"/>
      <line x1="27" y1="45" x2="41" y2="45" stroke="#9B89C4" strokeWidth="1.5"/>
      <line x1="29" y1="35" x2="39" y2="35" stroke="#9B89C4" strokeWidth="1.5"/>
    </g>
  ),

  // Brandenburg Gate
  de: (
    <g transform="translate(10, 22) scale(0.6)">
      {/* Columns */}
      {[0,5,10,15,20].map((x, i) => (
        <rect key={i} x={x} y={8} width={2.5} height={22} fill="#7B6CA8" opacity="0.85"/>
      ))}
      {/* Entablature */}
      <rect x={-1} y={6} width={24} height={4} fill="#7B6CA8"/>
      {/* Quadriga platform */}
      <rect x={2} y={2} width={18} height={5} fill="#9B89C4"/>
      {/* Simple quadriga silhouette */}
      <ellipse cx={11} cy={1} rx={5} ry={2} fill="#7B6CA8"/>
      {/* Base */}
      <rect x={-2} y={30} width={26} height={3} fill="#7B6CA8"/>
    </g>
  ),

  // Colosseum
  it: (
    <g transform="translate(9, 20) scale(0.55)">
      {/* Main ellipse body */}
      <ellipse cx={20} cy={22} rx={18} ry={12} fill="none" stroke="#7B6CA8" strokeWidth={3}/>
      {/* Inner ellipse */}
      <ellipse cx={20} cy={22} rx={12} ry={7} fill="none" stroke="#9B89C4" strokeWidth={1.5}/>
      {/* Arches top row */}
      {[-10,-5,0,5,10].map((x, i) => (
        <path key={i} d={`M${20+x-2} 14 Q${20+x} 10 ${20+x+2} 14`} fill="none" stroke="#7B6CA8" strokeWidth={1.5}/>
      ))}
      {/* Ground */}
      <line x1={2} y1={34} x2={38} y2={34} stroke="#9B89C4" strokeWidth={2}/>
    </g>
  ),

  // Sagrada Família (Spain)
  'es-es': (
    <g transform="translate(10, 14) scale(0.55)">
      {/* Central tower */}
      <rect x={17} y={4} width={6} height={32} fill="#7B6CA8"/>
      {/* Spire */}
      <polygon points="20,0 23,6 17,6" fill="#7B6CA8"/>
      {/* Side towers */}
      <rect x={10} y={12} width={5} height={24} fill="#9B89C4" opacity="0.8"/>
      <polygon points="12.5,8 15,14 10,14" fill="#9B89C4"/>
      <rect x={25} y={12} width={5} height={24} fill="#9B89C4" opacity="0.8"/>
      <polygon points="27.5,8 30,14 25,14" fill="#9B89C4"/>
      {/* Facade details */}
      <rect x={13} y={24} width={14} height={12} fill="#C4B5D9" opacity="0.5"/>
      {/* Rose window */}
      <circle cx={20} cy={28} r={3} fill="none" stroke="#7B6CA8" strokeWidth={1.5}/>
    </g>
  ),

  // Aztec/Mayan pyramid (Latin America)
  'es-latam': (
    <g transform="translate(10, 18) scale(0.58)">
      {/* Pyramid tiers */}
      <polygon points="20,4 36,36 4,36" fill="#7B6CA8" opacity="0.9"/>
      <polygon points="20,4 32,20 8,20" fill="#9B89C4" opacity="0.6"/>
      {/* Temple on top */}
      <rect x={16} y={0} width={8} height={6} fill="#7B6CA8"/>
      {/* Steps */}
      <line x1={10} y1={28} x2={30} y2={28} stroke="#C4B5D9" strokeWidth={1}/>
      <line x1={12} y1={32} x2={28} y2={32} stroke="#C4B5D9" strokeWidth={1}/>
      {/* Ground */}
      <line x1={2} y1={36} x2={38} y2={36} stroke="#9B89C4" strokeWidth={2}/>
    </g>
  ),

  // Belém Tower (Portugal)
  'pt-pt': (
    <g transform="translate(11, 16) scale(0.55)">
      {/* Main tower body */}
      <rect x={12} y={16} width={14} height={24} fill="#7B6CA8"/>
      {/* Battlements */}
      {[12,15,18,21,24].map((x, i) => (
        <rect key={i} x={x} y={12} width={2} height={5} fill="#7B6CA8"/>
      ))}
      {/* Watchtower */}
      <rect x={15} y={6} width={8} height={10} fill="#9B89C4"/>
      <polygon points="19,2 24,8 14,8" fill="#7B6CA8"/>
      {/* Arched windows */}
      <path d="M15 22 Q19 18 23 22" fill="none" stroke="#C4B5D9" strokeWidth={1.5}/>
      <path d="M15 30 Q19 26 23 30" fill="none" stroke="#C4B5D9" strokeWidth={1.5}/>
      {/* Water base */}
      <path d="M6 40 Q14 37 22 40 Q30 43 38 40" fill="none" stroke="#9B89C4" strokeWidth={1.5}/>
    </g>
  ),

  // Christ the Redeemer (Brazil)
  'pt-br': (
    <g transform="translate(11, 14) scale(0.55)">
      {/* Body */}
      <path d="M20 8 L20 36" stroke="#7B6CA8" strokeWidth={5} strokeLinecap="round"/>
      {/* Arms */}
      <path d="M6 20 L34 20" stroke="#7B6CA8" strokeWidth={4} strokeLinecap="round"/>
      {/* Head */}
      <circle cx={20} cy={6} r={4} fill="#7B6CA8"/>
      {/* Pedestal */}
      <rect x={16} y={36} width={8} height={6} fill="#9B89C4"/>
      <rect x={12} y={40} width={16} height={4} fill="#9B89C4" opacity="0.7"/>
      {/* Mountain */}
      <polygon points="20,44 8,56 32,56" fill="#C4B5D9" opacity="0.5"/>
    </g>
  ),

  // Palace of Culture (Poland)
  pl: (
    <g transform="translate(10, 14) scale(0.55)">
      {/* Central spire */}
      <rect x={17} y={2} width={6} height={38} fill="#7B6CA8"/>
      <polygon points="20,0 24,4 16,4" fill="#7B6CA8"/>
      {/* Wings */}
      <rect x={8} y={18} width={8} height={22} fill="#9B89C4" opacity="0.85"/>
      <rect x={24} y={18} width={8} height={22} fill="#9B89C4" opacity="0.85"/>
      {/* Star on top */}
      <polygon points="20,0 21,2.5 23.5,2.5 21.5,4 22.5,6.5 20,5 17.5,6.5 18.5,4 16.5,2.5 19,2.5" fill="#C4B5D9"/>
      {/* Windows */}
      {[0,1,2].map(i => (
        <rect key={i} x={19} y={12 + i*8} width={2} height={3} fill="#C4B5D9" opacity="0.8"/>
      ))}
    </g>
  ),

  // Mount Fuji (Japan)
  ja: (
    <g transform="translate(9, 18) scale(0.58)">
      {/* Mountain */}
      <polygon points="20,4 38,42 2,42" fill="#7B6CA8" opacity="0.85"/>
      {/* Snow cap */}
      <polygon points="20,4 26,18 14,18" fill="#F7EFE4"/>
      <path d="M14 18 Q16 14 20 12 Q24 14 26 18" fill="#F7EFE4"/>
      {/* Cloud layer */}
      <path d="M6 30 Q14 26 20 28 Q26 26 34 30" fill="none" stroke="#C4B5D9" strokeWidth={1.5}/>
      {/* Ground / water */}
      <line x1={2} y1={42} x2={38} y2={42} stroke="#9B89C4" strokeWidth={2}/>
      <path d="M2 44 Q10 42 20 44 Q30 46 38 44" fill="none" stroke="#C4B5D9" strokeWidth={1}/>
    </g>
  ),
}

// Fallback: generic open book
const FALLBACK = (
  <g>
    <rect x={18} y={20} width={12} height={14} rx={1} fill="#7B6CA8" opacity="0.7"/>
    <line x1={24} y1={20} x2={24} y2={34} stroke="#9B89C4" strokeWidth={1}/>
  </g>
)

export default function LanguageIllustration({ code, size = 'md', className = '' }: Props) {
  const { px, viewBox } = SIZES[size]
  const landmark = LANDMARKS[code] ?? FALLBACK

  return (
    <svg
      width={px}
      height={px}
      viewBox={viewBox}
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label={code}
    >
      <BookBase />
      {landmark}
    </svg>
  )
}
