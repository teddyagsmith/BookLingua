'use client'

import { useState, useCallback, useRef } from 'react'
import Image from 'next/image'

// Updated pricing tiers
const WORD_TIERS = {
  small: { maxWords: 40000, label: 'Up to 40k words', basePrice: 99 },
  medium: { maxWords: 80000, label: 'Up to 80k words', basePrice: 149 },
  large: { maxWords: 150000, label: 'Up to 150k words', basePrice: 199 },
}

const BUNDLE_DISCOUNTS = {
  1: { discount: 0, label: '1 Language' },
  2: { discount: 12, label: '2 Languages' },
  3: { discount: 25, label: '3 Languages' },
  4: { discount: 37, label: 'All 4 Languages' },
}

const CORE_LANGUAGES = [
  { code: 'es', name: 'Spanish', flag: '🇪🇸', market: '500M+ speakers' },
  { code: 'fr', name: 'French', flag: '🇫🇷', market: '300M+ speakers' },
  { code: 'de', name: 'German', flag: '🇩🇪', market: '100M+ speakers' },
  { code: 'pt', name: 'Portuguese', flag: '🇵🇹', market: '250M+ speakers' },
]

const UPSELLS: Array<{id: string; name: string; price: number; description: string; icon: string; popular?: boolean; perLanguage?: boolean; details?: string[]; priceAll?: number; savings?: string; originalPrice?: number}> = [
  { 
    id: 'launch-pack', 
    name: 'Launch Strategy Pack', 
    price: 29,
    priceAll: 49,
    description: 'Amazon keywords, ad strategy, category recommendations & review tactics for each market', 
    icon: '🚀',
    popular: true,
    perLanguage: true,
    details: ['7 backend keywords per market', 'Ad targeting keywords', 'Category recommendations', 'Review strategy guide', 'KDP upload checklist'],
  },
  { 
    id: 'newsletter', 
    name: 'Romance Reader Newsletter Feature', 
    price: 69,
    originalPrice: 90,
    description: 'Get featured in our romance reader newsletter — 20,000+ engaged romance readers. English language audience.', 
    icon: '📧',
    details: ['Dedicated feature in next available issue', 'Your book cover + blurb + buy link', '20,000+ romance readers', 'English language newsletter'],
  },
]

const BOOK_GENRES = [
  'Fiction', 'Non-Fiction', 'Mystery & Thriller', 'Science Fiction', 'Fantasy',
  'Biography & Memoir', 'Self-Help', 'Business', 'History', 'Science & Technology',
  'Health & Wellness', 'Travel', 'Cooking', 'Children\'s Books', 'Romance', 'Other',
]

const GENRE_INSTRUCTION_TIPS: Record<string, string[]> = {
  romance: [
    'Keep my pet names between characters exactly as written',
    'Use "member" consistently — do not vary intimate terminology',
    'Preserve all terms of endearment in English',
  ],
  'very_steamy': [
    'Match the heat and explicitness of intimate scenes exactly',
    'Keep intimate slang consistent — pick one word and use it throughout',
  ],
  erotica: [
    'Translate explicit content fully — do not soften or censor',
    'Keep intimate terminology consistent throughout',
  ],
  fantasy: [
    'Do NOT translate invented words: [list them here]',
    'Preserve archaic speech (thee/thou) for characters who speak it',
    'Keep all spell names and magic terms in the original invented form',
    'Keep all place names and character names exactly as written',
  ],
  thriller: [
    'Keep American legal terms (DA, Miranda, etc.) — do not replace with local equivalents',
    'Preserve law enforcement terminology (FBI, precinct, etc.) as American',
    'Keep weapon names in their standard form',
  ],
  'sci-fi': [
    'Do NOT translate invented terms: [list them here]',
    'Keep all spaceship names, alien species, and planet names exactly',
    'Preserve technical jargon as written',
  ],
  historical: [
    'Use place names contemporary to the era depicted',
    'Preserve period-appropriate titles and honorifics',
  ],
  children: [
    'Recreate rhymes and wordplay in the spirit of the original — do not translate literally',
    'Keep character names exactly as written',
  ],
  literary: [
    'Preserve all intentional stylistic choices — fragments, unusual punctuation, run-ons',
    'Recreate wordplay and alliteration in the spirit of the original',
  ],
  'non-fiction': [
    'Keep all Latin terms as Latin (et al., ibid., in vitro, etc.)',
    'Preserve all citations and bibliography exactly',
    'Convert imperial measurements to metric for EU audience',
  ],
  general: [
    "Preserve the author's unique voice and style",
  ],
}

function normalizeGenreKey(genre: string): string {
  const map: Record<string, string> = {
    'romance': 'romance',
    'fantasy': 'fantasy',
    'science fiction': 'sci-fi',
    'mystery & thriller': 'thriller',
    "children's books": 'children',
    'non-fiction': 'non-fiction',
    'history': 'historical',
    'fiction': 'general',
    'other': 'general',
  }
  return map[genre.toLowerCase()] || genre.toLowerCase().replace(/\s+/g, '-')
}

const SUPPORTED_FORMATS = [
  { ext: '.epub', name: 'EPUB', icon: '📱', desc: 'E-book format - formatting preserved' },
  { ext: '.pdf', name: 'PDF', icon: '📄', desc: 'Paperback format - layout preserved' },
  { ext: '.docx', name: 'DOCX', icon: '📝', desc: 'Word document' },
  { ext: '.txt', name: 'TXT', icon: '📃', desc: 'Plain text' },
]

// Logo component
const Logo = ({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) => {
  const sizes = { sm: 32, md: 48, lg: 64 }
  return (
    <Image 
      src="/logo.png" 
      alt="BookLingua" 
      width={sizes[size]} 
      height={sizes[size]}
      className="object-contain"
    />
  )
}

export default function Home() {
  const [currentView, setCurrentView] = useState<'landing' | 'upload'>('landing')
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [fileFormat, setFileFormat] = useState<string>('')
  const [wordCount, setWordCount] = useState(0)
  const [selectedTier, setSelectedTier] = useState<'small' | 'medium' | 'large' | null>(null)
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([])
  const [selectedGenre, setSelectedGenre] = useState('')
  const [heatLevel, setHeatLevel] = useState<string>('')
  const [bookSetting, setBookSetting] = useState('')
  const [selectedUpsells, setSelectedUpsells] = useState<string[]>([])
  const [authorName, setAuthorName] = useState('')
  const [bookTitle, setBookTitle] = useState('')
  const [email, setEmail] = useState('')
  const [specialInstructions, setSpecialInstructions] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [checkoutStep, setCheckoutStep] = useState(1)
  const [dragActive, setDragActive] = useState(false)
  const [voucherCode, setVoucherCode] = useState('')
  const [voucherApplied, setVoucherApplied] = useState<{ code: string; discount: number; type: string; discountAmount: string } | null>(null)
  const [voucherError, setVoucherError] = useState('')
  const [voucherLoading, setVoucherLoading] = useState(false)
  const sessionIdRef = useRef<string>(crypto.randomUUID())
  const [uploadComplete, setUploadComplete] = useState(false)
  const [uploadError, setUploadError] = useState('')

  const determineTier = (words: number): 'small' | 'medium' | 'large' => {
    if (words <= 30000) return 'small'
    if (words <= 80000) return 'medium'
    return 'large'
  }

  const calculatePrice = (tier: 'small' | 'medium' | 'large' | null, numLanguages: number) => {
    if (!tier || numLanguages === 0) return '0.00'
    const tierInfo = WORD_TIERS[tier]
    const discountInfo = BUNDLE_DISCOUNTS[Math.min(numLanguages, 4) as keyof typeof BUNDLE_DISCOUNTS]
    const baseTotal = tierInfo.basePrice * numLanguages
    const discount = baseTotal * (discountInfo.discount / 100)
    return (baseTotal - discount).toFixed(2)
  }

  const calculateUpsellTotal = () => {
    return selectedUpsells.reduce((total, id) => {
      const upsell = UPSELLS.find(u => u.id === id)
      if (!upsell) return total
      if (upsell.id === 'launch-pack') {
        return total + (selectedLanguages.length > 1 ? upsell.priceAll! : upsell.price)
      }
      return total + upsell.price
    }, 0)
  }

  const calculateTotal = () => {
    const translationCost = parseFloat(calculatePrice(selectedTier, selectedLanguages.length))
    const upsellCost = calculateUpsellTotal()
    return (translationCost + upsellCost).toFixed(2)
  }

  const calculateFinalTotal = () => {
    const subtotal = parseFloat(calculateTotal())
    if (voucherApplied) {
      const discountAmount = parseFloat(voucherApplied.discountAmount)
      return Math.max(subtotal - discountAmount, 1).toFixed(2)
    }
    return subtotal.toFixed(2)
  }

  const applyVoucher = async () => {
    if (!voucherCode.trim()) return
    
    setVoucherLoading(true)
    setVoucherError('')
    
    try {
      const response = await fetch('/api/validate-voucher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          code: voucherCode, 
          subtotal: parseFloat(calculateTotal()) 
        }),
      })
      
      const result = await response.json()
      
      if (result.valid) {
        setVoucherApplied({
          code: result.code,
          discount: result.discount,
          type: result.type,
          discountAmount: result.discountAmount,
        })
        setVoucherError('')
      } else {
        setVoucherError(result.error || 'Invalid voucher code')
        setVoucherApplied(null)
      }
    } catch (error) {
      setVoucherError('Failed to validate voucher')
      setVoucherApplied(null)
    }
    
    setVoucherLoading(false)
  }

  const removeVoucher = () => {
    setVoucherApplied(null)
    setVoucherCode('')
    setVoucherError('')
  }

  const toggleLanguage = (code: string) => {
    setSelectedLanguages(prev =>
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
    )
  }

  const selectAllCore = () => {
    setSelectedLanguages(CORE_LANGUAGES.map(l => l.code))
  }

  const toggleUpsell = (id: string) => {
    setSelectedUpsells(prev =>
      prev.includes(id) ? prev.filter(u => u !== id) : [...prev, id]
    )
  }

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent | React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault()
    if ('stopPropagation' in e) e.stopPropagation()
    setDragActive(false)

    const file = 'dataTransfer' in e 
      ? e.dataTransfer?.files?.[0] 
      : (e.target as HTMLInputElement)?.files?.[0]
    
    if (file) {
      const ext = '.' + file.name.split('.').pop()?.toLowerCase()
      setFileFormat(ext)
      setUploadedFile(file)
      setIsProcessing(true)
      setUploadComplete(false)
      setUploadError('')

      let words = 0

      if (ext === '.txt' || ext === '.docx') {
        const text = await file.text()
        words = text.trim().split(/\s+/).filter(word => word.length > 0).length
      } else if (ext === '.epub' || ext === '.pdf') {
        words = Math.round(file.size / 6)
      }

      setWordCount(words)
      setSelectedTier(determineTier(words))
      
      const titleFromFile = file.name.replace(/\.[^/.]+$/, '').replace(/_/g, ' ')
      setBookTitle(titleFromFile)

      // Upload file to server so it's available after payment
      try {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('sessionId', sessionIdRef.current)

        const res = await fetch('/api/upload', { method: 'POST', body: formData })
        if (!res.ok) throw new Error('Upload failed')
        const result = await res.json()
        // Use server-calculated word count for txt/docx (more accurate)
        if (result.wordCount && (ext === '.txt' || ext === '.docx')) {
          setWordCount(result.wordCount)
          setSelectedTier(determineTier(result.wordCount))
        }
        setUploadComplete(true)
      } catch (err) {
        console.error('File upload error:', err)
        setUploadError('File upload failed. Please try again.')
      }

      setIsProcessing(false)
    }
  }, [])

  const handleCheckout = async () => {
    if (!uploadComplete) {
      alert('Please wait for your file to finish uploading before proceeding.')
      return
    }
    setIsProcessing(true)
    
    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          authorName,
          bookTitle,
          wordCount,
          tier: selectedTier,
          fileFormat,
          selectedLanguages,
          selectedGenre,
          heatLevel,
          selectedUpsells,
          specialInstructions,
          totalAmount: calculateTotal(),
          voucherCode: voucherApplied?.code || '',
          sessionId: sessionIdRef.current,
          bookSetting,
        }),
      })

      const { url, error } = await response.json()
      if (error) throw new Error(error)
      window.location.href = url
    } catch (error) {
      console.error('Checkout error:', error)
      alert('Something went wrong. Please try again.')
    }
    
    setIsProcessing(false)
  }

  // Serif font style
  const serifFont = { fontFamily: "'Instrument Serif', Georgia, serif" }

  // Landing Page
  if (currentView === 'landing') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-violet-50">
        {/* Google Font */}
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=swap');`}</style>

        {/* Top pricing bar */}
        <div className="bg-gradient-to-r from-blue-600 to-violet-600 text-white text-sm py-2 px-4 text-center">
          <span className="font-semibold">From $99 per language</span>
          <span className="mx-2 opacity-60">·</span>
          Novellas from $99 · Novels from $149 · Up to 150k words $199
          <span className="mx-2 opacity-60">·</span>
          <a href="/examples" className="underline underline-offset-2 hover:opacity-80 font-medium">See examples →</a>
        </div>

        <header className="relative overflow-hidden">
          <div className="absolute inset-0 opacity-30">
            <div className="absolute top-20 left-10 w-72 h-72 bg-blue-200 rounded-full blur-3xl" />
            <div className="absolute top-40 right-20 w-96 h-96 bg-violet-200 rounded-full blur-3xl" />
          </div>

          <nav className="relative z-10 flex items-center justify-between px-8 py-6 max-w-7xl mx-auto">
            <div className="flex items-center gap-3">
              <Logo size="md" />
              <span className="text-2xl font-bold text-gray-800" style={serifFont}>BookLingua</span>
            </div>
            <div className="flex items-center gap-6">
              <a href="/examples" className="text-gray-600 hover:text-violet-700 font-medium transition-colors hidden sm:block">
                Examples
              </a>
              <a href="/publishers" className="text-gray-600 hover:text-violet-700 font-medium transition-colors hidden sm:block">
                Publishers
              </a>
              <button
                onClick={() => setCurrentView('upload')}
                className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-violet-600 text-white rounded-full font-semibold shadow-lg hover:shadow-xl transition-all"
              >
                Start Translating
              </button>
            </div>
          </nav>

          <div className="relative z-10 max-w-7xl mx-auto px-8 pt-20 pb-32">
            <div className="grid lg:grid-cols-2 gap-16 items-center">
              <div>
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/80 rounded-full text-sm font-medium text-violet-700 mb-8">
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  From $99 per language · Editorial review included
                </div>

                <h1 className="text-6xl font-bold text-gray-900 leading-tight mb-6" style={serifFont}>
                  Translate Your Book
                  <span className="block bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-transparent">
                    in Hours, Not Months
                  </span>
                </h1>

                <p className="text-xl text-gray-600 leading-relaxed mb-10 max-w-lg">
                  Professional AI translation for indie authors. From $99 per language — vs $5,000–$20,000 with a human agency. Two-pass editorial review included.
                </p>

                <div className="flex flex-wrap gap-3 mb-8">
                  {SUPPORTED_FORMATS.map(format => (
                    <span key={format.ext} className="px-3 py-1.5 bg-white/80 rounded-full text-sm font-medium text-gray-700 flex items-center gap-2">
                      {format.icon} {format.name}
                    </span>
                  ))}
                </div>

                <div className="flex flex-wrap gap-4 items-center">
                  <button
                    onClick={() => setCurrentView('upload')}
                    className="px-8 py-4 bg-gradient-to-r from-blue-600 to-violet-600 text-white rounded-2xl font-bold text-lg shadow-xl hover:shadow-2xl transition-all hover:-translate-y-1"
                  >
                    Upload Your Book →
                  </button>
                  <a
                    href="/examples"
                    className="px-8 py-4 bg-white border-2 border-violet-200 text-violet-700 rounded-2xl font-bold text-lg hover:border-violet-400 hover:bg-violet-50 transition-all"
                  >
                    See Examples
                  </a>
                </div>
              </div>

              <div className="relative">
                <div className="absolute -inset-4 bg-gradient-to-r from-blue-400/20 to-violet-400/20 rounded-3xl blur-2xl" />
                <div className="relative bg-white rounded-3xl shadow-2xl p-8 border border-blue-100/50">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-16 h-20 bg-gradient-to-br from-blue-500 to-violet-600 rounded-lg shadow-lg flex items-center justify-center">
                      <span className="text-white text-2xl">📘</span>
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900" style={serifFont}>The Art of Clear Thinking</h3>
                      <p className="text-sm text-gray-500">65,000 words • EPUB</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mb-4">
                    {CORE_LANGUAGES.map(l => (
                      <span key={l.code} className="text-2xl">{l.flag}</span>
                    ))}
                    <span className="ml-2 px-2 py-1 bg-violet-100 text-violet-700 text-xs font-semibold rounded-full">
                      4 Languages
                    </span>
                  </div>

                  <div className="flex justify-between items-center py-3 border-t border-gray-100">
                    <span className="text-gray-600">Translation + Editorial</span>
                    <span className="font-bold text-2xl text-violet-600">$882</span>
                  </div>

                  <div className="bg-green-50 rounded-xl p-4 border border-green-200 mt-4">
                    <div className="flex items-center gap-2 text-green-700 font-medium">
                      <span>✓</span> Formatting preserved • Changes highlighted
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Trust Bar */}
        <section className="py-8 bg-white border-b border-gray-100">
          <div className="max-w-7xl mx-auto px-8">
            <div className="flex flex-col md:flex-row items-center justify-center gap-8 md:gap-20">
              <div className="flex items-center gap-3 text-gray-700 font-semibold text-lg">
                <span className="text-2xl">⚡</span>
                <span>Delivered in hours</span>
              </div>
              <div className="flex items-center gap-3 text-gray-700 font-semibold text-lg">
                <span className="text-2xl">✏️</span>
                <span>Editorial review included</span>
              </div>
              <div className="flex items-center gap-3 text-gray-700 font-semibold text-lg">
                <span className="text-2xl">🔒</span>
                <span>Secure & private</span>
              </div>
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section className="py-24 bg-white">
          <div className="max-w-7xl mx-auto px-8">
            <div className="text-center mb-16">
              <h2 className="text-4xl font-bold text-gray-900 mb-4" style={serifFont}>How BookLingua Works</h2>
              <p className="text-xl text-gray-600">Our two-pass system ensures your translated book reads naturally</p>
            </div>

            <div className="grid md:grid-cols-2 gap-8 mb-16">
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-3xl p-8 border border-blue-200">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center text-white text-2xl font-bold shadow-lg">1</div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900" style={serifFont}>Translation Pass</h3>
                    <p className="text-sm text-blue-600">AI-powered accuracy</p>
                  </div>
                </div>
                <p className="text-gray-700 mb-4">
                  Your entire book is translated while preserving your unique writing style, tone, and voice.
                </p>
                <ul className="space-y-2">
                  {['Preserves author voice & style', 'Maintains book formatting', 'Handles technical terms accurately', 'Keeps proper nouns consistent'].map((item, i) => (
                    <li key={i} className="flex items-center gap-2 text-gray-700 text-sm">
                      <span className="text-blue-600">✓</span>{item}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="bg-gradient-to-br from-violet-50 to-violet-100 rounded-3xl p-8 border border-violet-200">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-14 h-14 bg-violet-600 rounded-2xl flex items-center justify-center text-white text-2xl font-bold shadow-lg">2</div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900" style={serifFont}>Editorial Review</h3>
                    <p className="text-sm text-violet-600">Premium quality check</p>
                  </div>
                </div>
                <p className="text-gray-700 mb-4">
                  A premium AI editor reviews every sentence, matching your book's unique tone and style.
                </p>
                <ul className="space-y-2">
                  {['Matches your book\'s tone', 'Region-specific language settings', 'Natural phrasing & idioms', 'All changes highlighted in yellow'].map((item, i) => (
                    <li key={i} className="flex items-center gap-2 text-gray-700 text-sm">
                      <span className="text-violet-600">✓</span>{item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Editorial Preview */}
            <div className="max-w-3xl mx-auto">
              <div className="text-center mb-6">
                <h3 className="text-xl font-bold text-gray-900 mb-2" style={serifFont}>See Editorial Changes in Action</h3>
                <p className="text-gray-600">Every improvement is highlighted in yellow so you can review and approve</p>
              </div>
              <div className="bg-white rounded-2xl border-2 border-gray-200 overflow-hidden shadow-xl">
                <div className="bg-gray-100 px-4 py-2 border-b border-gray-200 flex items-center gap-2">
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-red-400" />
                    <div className="w-3 h-3 rounded-full bg-yellow-400" />
                    <div className="w-3 h-3 rounded-full bg-green-400" />
                  </div>
                  <span className="text-sm text-gray-600 ml-2">chapter_3_spanish.docx</span>
                </div>
                <div className="p-6 text-gray-800 leading-relaxed" style={serifFont}>
                  <p className="mb-4">
                    El método científico requiere una observación cuidadosa y{' '}
                    <span className="bg-yellow-200 px-1">una mentalidad abierta hacia resultados inesperados</span>
                    . Los investigadores deben documentar cada paso del proceso.
                  </p>
                  <p className="mb-4">
                    "La verdad se encuentra en los datos,"{' '}
                    <span className="bg-yellow-200 px-1">explicó la Dra. Martínez con convicción</span>
                    , "no en nuestras suposiciones previas."
                  </p>
                </div>
                <div className="bg-violet-50 px-4 py-3 border-t border-violet-100">
                  <p className="text-sm text-violet-700">
                    <span className="font-semibold">💡 2 editorial improvements highlighted</span> — Review and approve each change
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section className="py-24 bg-gradient-to-b from-white to-slate-50">
          <div className="max-w-7xl mx-auto px-8">
            <div className="text-center mb-16">
              <h2 className="text-4xl font-bold text-gray-900 mb-4" style={serifFont}>Simple, transparent pricing</h2>
              <p className="text-xl text-gray-600">Per language • Includes editorial review</p>
            </div>

            <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto mb-16">
              {Object.entries(WORD_TIERS).map(([key, tier]) => (
                <div
                  key={key}
                  className={`relative bg-white rounded-3xl p-8 border-2 ${
                    key === 'medium' ? 'border-violet-400 shadow-lg' : 'border-gray-100'
                  }`}
                >
                  {key === 'medium' && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-gradient-to-r from-blue-600 to-violet-600 text-white text-sm font-bold rounded-full">
                      Most Popular
                    </div>
                  )}
                  <div className="text-center">
                    <p className="text-gray-500 text-sm mb-2">{tier.label}</p>
                    <div className="flex items-baseline justify-center gap-1 mb-2">
                      <span className="text-4xl font-bold text-gray-900">${tier.basePrice}</span>
                      <span className="text-gray-500">/language</span>
                    </div>
                    <p className="text-sm text-gray-400">
                      {key === 'small' && 'Short books & novellas'}
                      {key === 'medium' && 'Standard books'}
                      {key === 'large' && 'Large books & textbooks'}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Bundle discounts */}
            <div className="bg-gradient-to-br from-violet-50 to-blue-50 rounded-3xl p-8 max-w-4xl mx-auto">
              <h3 className="text-2xl font-bold text-gray-900 text-center mb-6" style={serifFont}>Bundle & Save</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Object.entries(BUNDLE_DISCOUNTS).map(([num, info]) => (
                  <div key={num} className="bg-white rounded-xl p-4 text-center">
                    <p className="font-bold text-gray-900">{info.label}</p>
                    {info.discount > 0 ? (
                      <p className="text-green-600 font-semibold">Save {info.discount}%</p>
                    ) : (
                      <p className="text-gray-400">Standard price</p>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-center text-gray-600 mt-6">
                Example: 80k book → All 4 languages = <span className="font-bold text-violet-600">${(149 * 4 * 0.63).toFixed(0)}</span> <span className="text-gray-400 line-through">${149 * 4}</span>
              </p>
            </div>

            <div className="text-center mt-12">
              <button
                onClick={() => setCurrentView('upload')}
                className="px-10 py-4 bg-gradient-to-r from-blue-600 to-violet-600 text-white rounded-2xl font-bold text-lg shadow-xl hover:shadow-2xl transition-all"
              >
                Get Started →
              </button>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="py-24 bg-white">
          <div className="max-w-3xl mx-auto px-8">
            <div className="text-center mb-16">
              <h2 className="text-4xl font-bold text-gray-900 mb-4" style={serifFont}>Frequently Asked Questions</h2>
              <p className="text-xl text-gray-600">Everything you need to know before you get started</p>
            </div>
            <div className="space-y-5">
              {[
                {
                  q: 'Is this better than Google Translate?',
                  a: 'Yes — significantly. BookLingua uses a proprietary two-pass system: the first pass produces a faithful translation; the second is an editorial review that refines idioms, adapts cultural context, and ensures your book reads naturally to native speakers. Every change is highlighted so you stay in control.',
                },
                {
                  q: 'What file formats do you support?',
                  a: 'EPUB, PDF, DOCX, and TXT. We recommend DOCX for best results — it gives the most accurate word count and preserves formatting perfectly.',
                },
                {
                  q: 'How long does translation take?',
                  a: 'Most books complete within 2–6 hours depending on length. You\'ll receive an email with your download link as soon as it\'s ready.',
                },
                {
                  q: 'Can I see examples before I buy?',
                  a: 'Absolutely — visit our Examples page to see real side-by-side translations with editorial highlights.',
                  link: { href: '/examples', label: 'View Examples →' },
                },
                {
                  q: 'What if I\'m not happy with the translation?',
                  a: 'Email us within 7 days and we\'ll work with you to make it right.',
                },
                {
                  q: 'Do you offer pricing for publishers with larger catalogues?',
                  a: 'Yes — if you have 10 or more books, we offer custom bulk pricing and a hands-off pipeline.',
                  link: { href: '/publishers', label: 'Learn more →' },
                },
              ].map((item, i) => (
                <div key={i} className="bg-gradient-to-br from-slate-50 to-blue-50 rounded-2xl p-6 border border-blue-100">
                  <h3 className="text-lg font-bold text-gray-900 mb-3" style={serifFont}>{item.q}</h3>
                  <p className="text-gray-600 leading-relaxed">{item.a}</p>
                  {'link' in item && item.link && (
                    <a href={item.link.href} className="inline-block mt-3 text-sm font-semibold text-violet-600 hover:text-violet-800 transition-colors">
                      {item.link.label}
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="bg-gray-900 text-gray-400 py-12">
          <div className="max-w-7xl mx-auto px-8 text-center">
            <div className="flex items-center justify-center gap-3 mb-4">
              <Logo size="sm" />
              <span className="text-xl font-bold text-white" style={serifFont}>BookLingua</span>
            </div>
            <p>© 2025 BookLingua. All rights reserved.</p>
          </div>
        </footer>
      </div>
    )
  }

  // Upload Flow
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-violet-50">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=swap');`}</style>
      
      <nav className="flex items-center justify-between px-8 py-6 max-w-5xl mx-auto">
        <button onClick={() => { setCurrentView('landing'); setCheckoutStep(1) }} className="flex items-center gap-3">
          <Logo size="md" />
          <span className="text-2xl font-bold text-gray-800" style={serifFont}>BookLingua</span>
        </button>

        <div className="flex items-center gap-4">
          {['Upload', 'Languages', 'Checkout'].map((step, i) => (
            <div key={step} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                checkoutStep > i ? 'bg-green-500 text-white' :
                checkoutStep === i + 1 ? 'bg-violet-600 text-white' : 'bg-gray-200 text-gray-500'
              }`}>
                {checkoutStep > i ? '✓' : i + 1}
              </div>
              <span className={`font-medium ${checkoutStep === i + 1 ? 'text-gray-900' : 'text-gray-400'}`}>
                {step}
              </span>
              {i < 2 && <div className="w-8 h-0.5 bg-gray-200 mx-2" />}
            </div>
          ))}
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-8 py-8">
        {/* Step 1: Upload */}
        {checkoutStep === 1 && (
          <>
            <div className="text-center mb-8">
              <h1 className="text-4xl font-bold text-gray-900 mb-4" style={serifFont}>Upload Your Book</h1>
              <p className="text-gray-600 text-lg">EPUB, PDF, DOCX, or TXT — formatting preserved</p>
            </div>

            {!uploadedFile ? (
              <div
                className={`relative border-2 border-dashed rounded-3xl p-16 text-center transition-all cursor-pointer ${
                  dragActive ? 'border-violet-500 bg-violet-50' : 'border-gray-300 bg-white hover:border-violet-400'
                }`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              >
                <input
                  type="file"
                  accept=".epub,.pdf,.docx,.txt"
                  onChange={handleDrop}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <div className="w-24 h-24 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-blue-100 to-violet-100 flex items-center justify-center">
                  <span className="text-5xl">📤</span>
                </div>
                <h3 className="text-2xl font-bold text-gray-800 mb-2" style={serifFont}>Drag & drop your manuscript</h3>
                <p className="text-gray-500 mb-6">or click to browse files</p>
                <div className="flex items-center justify-center gap-3">
                  {SUPPORTED_FORMATS.map(format => (
                    <span key={format.ext} className="px-3 py-1.5 bg-gray-100 rounded-full text-sm text-gray-600 flex items-center gap-1">
                      {format.icon} {format.ext}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-3xl shadow-xl p-8 border border-blue-100">
                {isProcessing ? (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 mx-auto mb-6 rounded-full border-4 border-violet-200 border-t-violet-600 animate-spin" />
                    <p className="text-gray-600">Processing your manuscript...</p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start gap-6 mb-8 pb-8 border-b border-gray-100">
                      <div className="w-20 h-24 bg-gradient-to-br from-blue-500 to-violet-600 rounded-xl shadow-lg flex items-center justify-center">
                        <span className="text-white text-3xl">
                          {fileFormat === '.epub' ? '📱' : fileFormat === '.pdf' ? '📄' : '📕'}
                        </span>
                      </div>
                      <div className="flex-1">
                        <input
                          type="text"
                          value={bookTitle}
                          onChange={(e) => setBookTitle(e.target.value)}
                          className="text-2xl font-bold text-gray-900 w-full bg-transparent border-b-2 border-transparent hover:border-gray-200 focus:border-violet-400 focus:outline-none pb-1 mb-2"
                          style={serifFont}
                          placeholder="Book Title"
                        />
                        <p className="text-gray-500">{uploadedFile.name}</p>
                        <div className="flex items-center gap-4 mt-2">
                          <span className="text-violet-600 font-semibold">{wordCount.toLocaleString()} words</span>
                          <span className="px-2 py-1 bg-violet-100 text-violet-700 text-xs font-semibold rounded-full">
                            {WORD_TIERS[selectedTier!]?.label}
                          </span>
                          <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs font-semibold rounded-full">
                            {fileFormat.toUpperCase()} — formatting preserved
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => { setUploadedFile(null); setWordCount(0); setSelectedTier(null); setUploadComplete(false); setUploadError(''); sessionIdRef.current = crypto.randomUUID() }}
                        className="text-gray-400 hover:text-red-500 transition"
                      >
                        ✕
                      </button>
                    </div>

                    <div className="grid md:grid-cols-2 gap-6 mb-6">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Author Name</label>
                        <input
                          type="text"
                          value={authorName}
                          onChange={(e) => setAuthorName(e.target.value)}
                          className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-violet-400 focus:ring-2 focus:ring-violet-100 outline-none"
                          placeholder="Your name"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-violet-400 focus:ring-2 focus:ring-violet-100 outline-none"
                          placeholder="you@example.com"
                        />
                      </div>
                    </div>

                    <div className="mb-6">
                      <label className="block text-sm font-medium text-gray-700 mb-2">Genre</label>
                      <select
                        value={selectedGenre}
                        onChange={(e) => setSelectedGenre(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-violet-400 outline-none"
                      >
                        <option value="">Select genre...</option>
                        {BOOK_GENRES.map(genre => (
                          <option key={genre} value={genre}>{genre}</option>
                        ))}
                      </select>
                    </div>

                    {(selectedGenre === 'Romance' || selectedGenre === 'Erotica') && (
                      <div className="mt-4 mb-6">
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                          Heat Level <span className="text-red-400">*</span>
                          <span className="ml-2 text-xs font-normal text-gray-500">This helps us match the language register of intimate scenes perfectly</span>
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                          {[
                            { value: 'sweet', label: '💛 Sweet / Clean', desc: 'No explicit content' },
                            { value: 'steamy', label: '🌶️ Steamy', desc: 'Suggestive, open door' },
                            { value: 'very_steamy', label: '🔥 Very Steamy', desc: 'Explicit, erotic language' },
                            { value: 'erotica', label: '🔥🔥 Erotica', desc: 'Maximum explicit' },
                          ].map(opt => (
                            <button
                              key={opt.value}
                              onClick={() => setHeatLevel(opt.value)}
                              className={`p-3 rounded-xl border-2 text-left transition-all ${
                                heatLevel === opt.value
                                  ? 'border-violet-500 bg-violet-50'
                                  : 'border-gray-200 hover:border-violet-300'
                              }`}
                            >
                              <div className="font-semibold text-sm text-gray-900">{opt.label}</div>
                              <div className="text-xs text-gray-500">{opt.desc}</div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Book Setting */}
                    <div className="mb-6">
                      <label className="block text-sm font-semibold text-gray-700 mb-1">
                        Where is your book set, and what local language should we keep?
                        <span className="ml-2 text-xs font-normal text-gray-500">Optional — helps preserve cultural authenticity</span>
                      </label>
                      <textarea
                        value={bookSetting}
                        onChange={e => setBookSetting(e.target.value)}
                        rows={3}
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white text-gray-800 resize-none"
                        placeholder={`Examples:\n• Set in America — keep DA, precinct, Secretary of State, the Oval Office as-is\n• Set in the UK — keep Prime Minister (don't translate to Chancellor), NHS, barrister\n• Fantasy world — all place names and invented words are untranslatable\n• Historical France — use period titles (Monsieur le Président, not President)`}
                      />
                    </div>

                    {/* Special Instructions with genre tips */}
                    <div className="mb-8">
                      <label className="block text-sm font-medium text-gray-700 mb-2">Special Instructions (optional)</label>
                      {/* Genre-specific clickable tip chips */}
                      {selectedGenre && GENRE_INSTRUCTION_TIPS[normalizeGenreKey(selectedGenre)] && (
                        <div className="mb-2">
                          <p className="text-xs font-medium text-gray-500 mb-1.5">💡 Suggested instructions — click to add:</p>
                          <div className="flex flex-wrap gap-2 mb-2">
                            {[
                              ...(GENRE_INSTRUCTION_TIPS[normalizeGenreKey(selectedGenre)] || []),
                              ...(heatLevel && GENRE_INSTRUCTION_TIPS[heatLevel] ? GENRE_INSTRUCTION_TIPS[heatLevel] : []),
                            ].map((tip, i) => (
                              <button
                                key={i}
                                type="button"
                                onClick={() => setSpecialInstructions(prev => prev ? `${prev}\n${tip}` : tip)}
                                className="text-xs px-3 py-1.5 rounded-full bg-violet-50 border border-violet-200 text-violet-700 hover:bg-violet-100 transition-colors text-left"
                              >
                                + {tip}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      <textarea
                        value={specialInstructions}
                        onChange={(e) => setSpecialInstructions(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-violet-400 outline-none resize-none"
                        rows={3}
                        placeholder="Any specific instructions for your translator…"
                      />
                    </div>

                    {/* Upload status indicator */}
                    {!uploadComplete && !uploadError && (
                      <div className="flex items-center gap-2 text-sm text-blue-600 mb-4 px-1">
                        <div className="w-4 h-4 border-2 border-blue-400 border-t-blue-600 rounded-full animate-spin" />
                        Uploading your file securely…
                      </div>
                    )}
                    {uploadComplete && (
                      <div className="flex items-center gap-2 text-sm text-green-600 mb-4 px-1">
                        <span>✓</span> File uploaded securely
                      </div>
                    )}
                    {uploadError && (
                      <div className="flex items-center gap-2 text-sm text-red-600 mb-4 px-1">
                        <span>✕</span> {uploadError}
                      </div>
                    )}

                    <button
                      onClick={() => setCheckoutStep(2)}
                      disabled={!email || !bookTitle || !uploadComplete}
                      className={`w-full py-4 rounded-2xl font-bold text-lg transition-all ${
                        email && bookTitle && uploadComplete
                          ? 'bg-gradient-to-r from-blue-600 to-violet-600 text-white shadow-xl hover:shadow-2xl'
                          : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      }`}
                    >
                      Continue to Language Selection →
                    </button>
                  </>
                )}
              </div>
            )}
          </>
        )}

        {/* Step 2: Language Selection */}
        {checkoutStep === 2 && (
          <>
            <div className="text-center mb-8">
              <h1 className="text-4xl font-bold text-gray-900 mb-4" style={serifFont}>Select Languages</h1>
              <p className="text-gray-600 text-lg">Choose one or bundle multiple for bigger savings</p>
            </div>

            <div className="bg-white rounded-3xl shadow-xl p-8 border border-blue-100">
              <div className="bg-gradient-to-r from-blue-600 to-violet-600 rounded-2xl p-6 mb-8 text-white">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-bold mb-1">🎉 Bundle All 4 Languages & Save 37%</h3>
                    <p className="text-white/80">Spanish, French, German & Portuguese</p>
                  </div>
                  <button
                    onClick={selectAllCore}
                    className="px-6 py-3 bg-white text-violet-600 rounded-xl font-bold hover:shadow-lg transition-all"
                  >
                    Select All 4
                  </button>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4 mb-8">
                {CORE_LANGUAGES.map((lang) => (
                  <button
                    key={lang.code}
                    onClick={() => toggleLanguage(lang.code)}
                    className={`p-4 rounded-2xl border-2 text-left transition-all ${
                      selectedLanguages.includes(lang.code)
                        ? 'border-violet-500 bg-violet-50'
                        : 'border-gray-200 hover:border-violet-300'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <span className="text-4xl">{lang.flag}</span>
                      <div className="flex-1">
                        <p className="font-bold text-gray-900">{lang.name}</p>
                        <p className="text-sm text-gray-500">{lang.market}</p>
                      </div>
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                        selectedLanguages.includes(lang.code)
                          ? 'border-violet-500 bg-violet-500 text-white'
                          : 'border-gray-300'
                      }`}>
                        {selectedLanguages.includes(lang.code) && '✓'}
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {selectedLanguages.length > 0 && selectedTier && (
                <div className="bg-gradient-to-br from-blue-50 via-violet-50 to-slate-50 rounded-2xl p-6 mb-8">
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-gray-600">Book tier</span>
                    <span className="font-semibold text-gray-900">{WORD_TIERS[selectedTier].label}</span>
                  </div>
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-gray-600">Languages selected</span>
                    <span className="font-semibold text-gray-900">{selectedLanguages.length}</span>
                  </div>
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-gray-600">Price per language</span>
                    <span className="font-semibold text-gray-900">${WORD_TIERS[selectedTier].basePrice}</span>
                  </div>
                  {BUNDLE_DISCOUNTS[Math.min(selectedLanguages.length, 4) as keyof typeof BUNDLE_DISCOUNTS].discount > 0 && (
                    <div className="flex justify-between items-center mb-4 text-green-600">
                      <span>Bundle discount</span>
                      <span className="font-semibold">-{BUNDLE_DISCOUNTS[Math.min(selectedLanguages.length, 4) as keyof typeof BUNDLE_DISCOUNTS].discount}%</span>
                    </div>
                  )}
                  <div className="border-t border-gray-200 pt-4 flex justify-between items-center">
                    <span className="text-lg font-bold text-gray-900">Total</span>
                    <span className="text-3xl font-bold text-violet-600">
                      ${calculatePrice(selectedTier, selectedLanguages.length)}
                    </span>
                  </div>
                </div>
              )}

              <div className="flex gap-4">
                <button
                  onClick={() => setCheckoutStep(1)}
                  className="px-6 py-4 border-2 border-gray-200 text-gray-700 rounded-2xl font-bold"
                >
                  ← Back
                </button>
                <button
                  onClick={() => setCheckoutStep(3)}
                  disabled={selectedLanguages.length === 0}
                  className={`flex-1 py-4 rounded-2xl font-bold text-lg transition-all ${
                    selectedLanguages.length > 0
                      ? 'bg-gradient-to-r from-blue-600 to-violet-600 text-white shadow-xl'
                      : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  Continue to Checkout →
                </button>
              </div>
            </div>
          </>
        )}

        {/* Step 3: Checkout with Upsells */}
        {checkoutStep === 3 && (
          <>
            <div className="text-center mb-8">
              <h1 className="text-4xl font-bold text-gray-900 mb-4" style={serifFont}>Complete Your Order</h1>
              <p className="text-gray-600 text-lg">Review your order and add optional extras</p>
            </div>

            <div className="grid lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-6">
                <div className="bg-white rounded-3xl shadow-xl p-8 border border-blue-100">
                  <h3 className="text-xl font-bold text-gray-900 mb-6" style={serifFont}>Order Summary</h3>

                  <div className="flex items-start gap-4 mb-6 pb-6 border-b border-gray-100">
                    <div className="w-16 h-20 bg-gradient-to-br from-blue-500 to-violet-600 rounded-xl shadow-lg flex items-center justify-center">
                      <span className="text-white text-2xl">
                        {fileFormat === '.epub' ? '📱' : fileFormat === '.pdf' ? '📄' : '📕'}
                      </span>
                    </div>
                    <div className="flex-1">
                      <h4 className="font-bold text-gray-900" style={serifFont}>{bookTitle}</h4>
                      <p className="text-sm text-gray-500">{wordCount.toLocaleString()} words • {selectedTier && WORD_TIERS[selectedTier].label} • {fileFormat.toUpperCase()}</p>
                      <div className="flex gap-2 mt-2">
                        {selectedLanguages.map(code => {
                          const lang = CORE_LANGUAGES.find(l => l.code === code)
                          return <span key={code} className="text-xl">{lang?.flag}</span>
                        })}
                      </div>
                    </div>
                    <p className="text-xl font-bold text-gray-900">
                      ${calculatePrice(selectedTier, selectedLanguages.length)}
                    </p>
                  </div>

                  <div className="bg-yellow-50 rounded-xl p-4 border border-yellow-200">
                    <p className="text-sm text-yellow-800">
                      <span className="font-semibold">📝 Editorial changes highlighted:</span> You'll receive your translations with all improvements marked in yellow for easy review.
                    </p>
                  </div>
                </div>

                <div className="bg-white rounded-3xl shadow-xl p-8 border border-blue-100">
                  <div className="flex items-center gap-3 mb-6">
                    <span className="text-2xl">🚀</span>
                    <div>
                      <h3 className="text-xl font-bold text-gray-900" style={serifFont}>Boost Your Launch</h3>
                      <p className="text-sm text-gray-500">Optional add-ons to help your book succeed</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {UPSELLS.map((upsell) => (
                      <button
                        key={upsell.id}
                        onClick={() => toggleUpsell(upsell.id)}
                        className={`w-full p-5 rounded-2xl border-2 text-left transition-all ${
                          selectedUpsells.includes(upsell.id)
                            ? 'border-violet-500 bg-violet-50'
                            : 'border-gray-200 hover:border-violet-300'
                        }`}
                      >
                        <div className="flex items-start gap-4">
                          <span className="text-3xl">{upsell.icon}</span>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <h4 className="font-bold text-gray-900">{upsell.name}</h4>
                              {upsell.popular && (
                                <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-semibold rounded-full">
                                  Recommended
                                </span>
                              )}
                              {upsell.savings && (
                                <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-semibold rounded-full">
                                  {upsell.savings}
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-gray-500">{upsell.description}</p>
                            {upsell.id === 'launch-pack' && selectedUpsells.includes('launch-pack') && upsell.details && (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {upsell.details.map((d, i) => (
                                  <span key={i} className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded">✓ {d}</span>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="text-right">
                            {upsell.id === 'launch-pack' ? (
                              <div>
                                <p className="text-xl font-bold text-gray-900">{selectedLanguages.length > 1 ? '$49' : '$29'}</p>
                                <p className="text-xs text-gray-500">{selectedLanguages.length > 1 ? 'all languages' : '1 language'}</p>
                                {selectedLanguages.length === 1 && <p className="text-xs text-green-600">$49 for 2+</p>}
                              </div>
                            ) : (
                              <div>
                                <p className="text-xl font-bold text-gray-900">${upsell.price}</p>
                                {upsell.originalPrice && (
                                  <p className="text-xs text-gray-400 line-through">${upsell.originalPrice}</p>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="lg:col-span-1">
                <div className="bg-white rounded-3xl shadow-xl p-6 border border-blue-100 sticky top-8">
                  <h3 className="text-lg font-bold text-gray-900 mb-4" style={serifFont}>Order Total</h3>

                  <div className="space-y-3 mb-6">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Translation + Editorial</span>
                      <span className="font-medium">${calculatePrice(selectedTier, selectedLanguages.length)}</span>
                    </div>
                    {selectedUpsells.length > 0 && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Add-ons</span>
                        <span className="font-medium">${calculateUpsellTotal()}</span>
                      </div>
                    )}
                    {voucherApplied && (
                      <div className="flex justify-between text-green-600">
                        <span className="flex items-center gap-2">
                          Voucher ({voucherApplied.code})
                          <button onClick={removeVoucher} className="text-red-500 hover:text-red-700 text-xs">✕</button>
                        </span>
                        <span className="font-medium">-${voucherApplied.discountAmount}</span>
                      </div>
                    )}
                    <div className="border-t border-gray-200 pt-3 flex justify-between">
                      <span className="text-lg font-bold text-gray-900">Total</span>
                      <div className="text-right">
                        {voucherApplied && (
                          <span className="text-gray-400 line-through text-sm mr-2">${calculateTotal()}</span>
                        )}
                        <span className="text-2xl font-bold text-violet-600">${calculateFinalTotal()}</span>
                      </div>
                    </div>
                  </div>

                  {/* Voucher Code Input */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Voucher Code</label>
                    {!voucherApplied ? (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={voucherCode}
                          onChange={(e) => setVoucherCode(e.target.value.toUpperCase())}
                          placeholder="Enter code"
                          className="flex-1 px-3 py-2 rounded-xl border border-gray-200 focus:border-violet-400 outline-none text-sm"
                        />
                        <button
                          onClick={applyVoucher}
                          disabled={voucherLoading || !voucherCode.trim()}
                          className="px-4 py-2 bg-violet-100 text-violet-700 rounded-xl font-medium text-sm hover:bg-violet-200 disabled:opacity-50"
                        >
                          {voucherLoading ? '...' : 'Apply'}
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 px-3 py-2 bg-green-50 rounded-xl border border-green-200">
                        <span className="text-green-600">✓</span>
                        <span className="text-green-700 font-medium">{voucherApplied.code}</span>
                        <span className="text-green-600 text-sm">
                          ({voucherApplied.type === 'percent' ? `${voucherApplied.discount}% off` : `$${voucherApplied.discount} off`})
                        </span>
                      </div>
                    )}
                    {voucherError && (
                      <p className="text-red-500 text-sm mt-1">{voucherError}</p>
                    )}
                  </div>

                  <button
                    onClick={handleCheckout}
                    disabled={isProcessing}
                    className="w-full py-4 bg-gradient-to-r from-blue-600 to-violet-600 text-white rounded-2xl font-bold text-lg shadow-xl hover:shadow-2xl transition-all mb-4 disabled:opacity-50"
                  >
                    {isProcessing ? 'Processing...' : `Pay $${calculateFinalTotal()} →`}
                  </button>

                  <button
                    onClick={() => setCheckoutStep(2)}
                    className="w-full py-3 text-gray-500 hover:text-gray-700 font-medium"
                  >
                    ← Back to Languages
                  </button>

                  <div className="mt-6 pt-6 border-t border-gray-100">
                    <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                      <span>🔒</span> Secure payment via Stripe
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                      <span>📁</span> Original formatting preserved
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <span>✏️</span> Changes highlighted for review
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
