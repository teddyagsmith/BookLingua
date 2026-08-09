const sharp = require('sharp')
const fs = require('fs')

const svg = `
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#F7EFE4"/>
      <stop offset="100%" stop-color="#EBE6F4"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="8" stdDeviation="16" flood-color="#7B6CA8" flood-opacity="0.15"/>
    </filter>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  
  <!-- Decorative top-right blob -->
  <circle cx="1050" cy="120" r="220" fill="#EBE6F4" opacity="0.6"/>
  <circle cx="150" cy="520" r="180" fill="#F7EFE4" opacity="0.8"/>
  
  <!-- BookLingua wordmark -->
  <text x="80" y="90" font-family="Georgia, 'EB Garamond', serif" font-size="40" font-weight="600" fill="#5E5090">BookLingua</text>
  
  <!-- Main headline -->
  <text x="80" y="240" font-family="Georgia, 'EB Garamond', serif" font-size="72" font-weight="500" fill="#1A1A1A">Translate Your Book</text>
  <text x="80" y="330" font-family="Georgia, 'EB Garamond', serif" font-size="72" font-weight="500" fill="#1A1A1A">in Hours, Not Months</text>
  
  <!-- Subheadline -->
  <text x="80" y="410" font-family="Inter, system-ui, sans-serif" font-size="28" fill="#4A3F6B">AI book translation with human editorial review.</text>
  <text x="80" y="450" font-family="Inter, system-ui, sans-serif" font-size="28" fill="#4A3F6B">From $99 per language for indie authors and publishers.</text>
  
  <!-- CTA pill -->
  <rect x="80" y="500" width="320" height="60" rx="30" fill="#7B6CA8" filter="url(#shadow)"/>
  <text x="240" y="540" font-family="Inter, system-ui, sans-serif" font-size="22" font-weight="600" fill="#FFFFFF" text-anchor="middle">Upload Your Book →</text>
  
  <!-- Decorative book icon on right -->
  <g transform="translate(820, 180)">
    <rect x="0" y="40" width="240" height="320" rx="12" fill="#7B6CA8"/>
    <rect x="20" y="20" width="240" height="320" rx="12" fill="#FFFFFF" stroke="#7B6CA8" stroke-width="4"/>
    <path d="M60 80 Q140 120 220 80" stroke="#7B6CA8" stroke-width="6" fill="none"/>
    <path d="M60 220 Q140 260 220 220" stroke="#7B6CA8" stroke-width="6" fill="none"/>
    <text x="130" y="180" font-family="Georgia, serif" font-size="60" fill="#5E5090" text-anchor="middle">A → 文</text>
  </g>
</svg>
`

sharp(Buffer.from(svg))
  .png()
  .toFile('public/og-image.png')
  .then(() => console.log('Generated public/og-image.png'))
  .catch(err => {
    console.error(err)
    process.exit(1)
  })
