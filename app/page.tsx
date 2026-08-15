'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import Image from 'next/image'
import EmailSignupPopup from '@/components/EmailSignupPopup'
import ResourcesMenu from '@/components/ResourcesMenu'
import SiteFooter from '@/components/SiteFooter'

// GA4 event helper for CTA buttons
function trackStartTranslation(location: string) {
  if (typeof window !== 'undefined') {
    const gtag = (window as any).gtag
    if (gtag) {
      gtag('event', 'start_translation_click', {
        event_category: 'cta',
        event_label: location,
      })
    }
  }
}

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
  4: { discount: 30, label: '4 Languages' },
  5: { discount: 35, label: '5 Languages' },
  6: { discount: 40, label: 'All 6 Languages' },
}

const CORE_LANGUAGES = [
  { code: 'es-es', name: 'Spanish (Spain)', flag: '🇪🇸', market: 'Spain · Castilian' },
  { code: 'es-latam', name: 'Spanish (Latin America)', flag: '🌎', market: 'Mexico, Colombia, Argentina+' },
  { code: 'fr', name: 'French', flag: '🇫🇷', market: '300M+ speakers' },
  { code: 'de', name: 'German', flag: '🇩🇪', market: '100M+ speakers' },
  { code: 'it', name: 'Italian', flag: '🇮🇹', market: '65M+ speakers' },
  { code: 'pl', name: 'Polish', flag: '🇵🇱', market: '50M+ speakers' },
  { code: 'ja', name: 'Japanese', flag: '🇯🇵', market: '125M+ speakers' },
  { code: 'pt-pt', name: 'Portuguese (Portugal)', flag: '🇵🇹', market: 'Portugal · European' },
  { code: 'pt-br', name: 'Portuguese (Brazil)', flag: '🇧🇷', market: 'Brazil · 215M speakers' },
]

const UPSELLS: Array<{id: string; name: string; price: number; description: string; icon: string; popular?: boolean; perLanguage?: boolean; details?: string[]; priceAll?: number; savings?: string; originalPrice?: number}> = [
  {
    id: 'launch-pack',
    name: 'Launch Strategy Pack',
    price: 29,
    priceAll: 49,
    description: 'Everything you need to launch and rank on Amazon in each foreign market — keywords, ads, categories, and launch plan.',
    icon: '🚀',
    popular: true,
    perLanguage: true,
    details: ['7 Amazon backend keywords (per market)', 'Foreign language ad targeting keywords', 'Local market category recommendations', 'Market-specific launch timeline', 'Review acquisition strategy', 'KDP upload checklist'],
  },
  {
    id: 'dual-format',
    name: 'Dual Format Delivery',
    price: 29,
    description: 'Get your translated book in both EPUB and DOCX formats. Upload one, receive both — ready for ebook and print.',
    icon: '📦',
    details: ['Final EPUB (ebook-ready)', 'Final DOCX (print-ready)', 'No extra translation cost'],
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
    'Use "member" consistently - do not vary intimate terminology',
    'Preserve all terms of endearment in English',
  ],
  'very_steamy': [
    'Match the heat and explicitness of intimate scenes exactly',
    'Keep intimate slang consistent - pick one word and use it throughout',
  ],
  erotica: [
    'Translate explicit content fully - do not soften or censor',
    'Keep intimate terminology consistent throughout',
  ],
  fantasy: [
    'Do NOT translate invented words: [list them here]',
    'Preserve archaic speech (thee/thou) for characters who speak it',
    'Keep all spell names and magic terms in the original invented form',
    'Keep all place names and character names exactly as written',
  ],
  thriller: [
    'Keep American legal terms (DA, Miranda, etc.) - do not replace with local equivalents',
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
    'Recreate rhymes and wordplay in the spirit of the original - do not translate literally',
    'Keep character names exactly as written',
  ],
  literary: [
    'Preserve all intentional stylistic choices - fragments, unusual punctuation, run-ons',
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
  { ext: '.docx', name: 'DOCX', icon: '📝', desc: 'Word document - best formatting' },
  { ext: '.txt', name: 'TXT', icon: '📃', desc: 'Plain text' },
]

// Logo component
const Logo = ({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) => {
  const sizes = { sm: 120, md: 200, lg: 300 }
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

function FooterSignup({ serifFont }: { serifFont: React.CSSProperties }) {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return
    setState('loading')
    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source: 'footer' }),
      })
      if (!res.ok) throw new Error()
      setState('done')
    } catch {
      setState('error')
    }
  }

  return (
    <div className="border-b border-gray-800 py-16 px-8">
      <div className="max-w-2xl mx-auto text-center">
        <h3 className="text-2xl font-bold text-white mb-2" style={serifFont}>
          Tips for publishing your book globally 🌍
        </h3>
        <p className="text-gray-400 mb-8 text-sm">
          Join indie authors already reaching readers in 6 languages. Get launch tips, market insights, and exclusive discounts - no spam.
        </p>

        {state === 'done' ? (
          <div className="inline-flex items-center gap-2 px-6 py-3 bg-green-900/40 border border-green-700 rounded-2xl text-green-400 font-medium">
            <span>✓</span> You're subscribed - thanks!
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              className="flex-1 px-4 py-3 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:border-brand focus:outline-none text-sm"
            />
            <button
              type="submit"
              disabled={state === 'loading'}
              className="px-6 py-3 bg-brand text-white rounded-xl font-bold text-sm shadow-lg hover:shadow-brand/25 transition-all disabled:opacity-60 whitespace-nowrap"
            >
              {state === 'loading' ? 'Subscribing…' : 'Subscribe free →'}
            </button>
          </form>
        )}

        {state === 'error' && (
          <p className="text-red-400 text-xs mt-2">Something went wrong - please try again.</p>
        )}
      </div>
    </div>
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
  const [copyrightConfirmed, setCopyrightConfirmed] = useState(false)
  const [checkoutStep, setCheckoutStep] = useState(1)
  const [dragActive, setDragActive] = useState(false)
  const [voucherCode, setVoucherCode] = useState('')
  const [voucherApplied, setVoucherApplied] = useState<{ code: string; discount: number; type: string; discountAmount: string } | null>(null)
  const [voucherError, setVoucherError] = useState('')
  const [voucherLoading, setVoucherLoading] = useState(false)
  const sessionIdRef = useRef<string>('')
  const uploadTokenRef = useRef<string>('')
  const briefApprovedRef = useRef(false)
  const scanCompletedRef = useRef(false)
  const hardenedUploadRef = useRef(false)
  const [uploadComplete, setUploadComplete] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [scanFindings, setScanFindings] = useState<any[]>([])
  const [scanQuality, setScanQuality] = useState<any | null>(null)
  const [scanResponses, setScanResponses] = useState<Record<string, string>>({})
  const [scanLoading, setScanLoading] = useState(false)
  const [showScanStep, setShowScanStep] = useState(false)
  const [affiliateCode, setAffiliateCode] = useState('')

  const determineTier = (words: number): 'small' | 'medium' | 'large' => {
    if (words <= 40000) return 'small'
    if (words <= 80000) return 'medium'
    return 'large'
  }

  const calculatePrice = (tier: 'small' | 'medium' | 'large' | null, numLanguages: number) => {
    if (!tier || numLanguages === 0) return '0.00'
    const tierInfo = WORD_TIERS[tier]
    const discountInfo = BUNDLE_DISCOUNTS[Math.min(numLanguages, 6) as keyof typeof BUNDLE_DISCOUNTS]
    const baseTotal = tierInfo.basePrice * numLanguages
    const discount = baseTotal * (discountInfo.discount / 100)
    return (baseTotal - discount).toFixed(2)
  }

  const calculateUpsellTotal = () => {
    return selectedUpsells.reduce((total, id) => {
      if (id === 'mrr-shoutout') return total + 69
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

  // Returns the amount that CAN be discounted (excludes MRR shoutout and Launch Pack which are never discounted)
  const calculateVoucherableSubtotal = () => {
    let nonVoucherable = 0
    if (selectedUpsells.includes('mrr-shoutout')) nonVoucherable += 69
    if (selectedUpsells.includes('launch-pack')) {
      nonVoucherable += selectedLanguages.length > 1 ? 49 : 29
    }
    return parseFloat(calculateTotal()) - nonVoucherable
  }

  // Returns the actual voucher discount amount to display (recalculates dynamically)
  const getVoucherDiscountAmount = () => {
    if (!voucherApplied) return '0.00'
    const voucherableSubtotal = calculateVoucherableSubtotal()
    if (voucherApplied.type === 'percent') {
      return (voucherableSubtotal * voucherApplied.discount / 100).toFixed(2)
    }
    return Math.min(parseFloat(voucherApplied.discountAmount), voucherableSubtotal).toFixed(2)
  }

  const calculateFinalTotal = () => {
    if (!voucherApplied) {
      return calculateTotal()
    }
    const mrrCost = selectedUpsells.includes('mrr-shoutout') ? 69 : 0
    const launchPackCost = selectedUpsells.includes('launch-pack')
      ? (selectedLanguages.length > 1 ? 49 : 29)
      : 0
    const voucherableSubtotal = calculateVoucherableSubtotal()
    let discountAmount: number
    if (voucherApplied.type === 'percent') {
      discountAmount = voucherableSubtotal * (voucherApplied.discount / 100)
    } else {
      discountAmount = Math.min(parseFloat(voucherApplied.discountAmount), voucherableSubtotal)
    }
    return Math.max(voucherableSubtotal - discountAmount + mrrCost + launchPackCost, 1).toFixed(2)
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
          subtotal: calculateVoucherableSubtotal()
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

  // Debounced email save - captures email in temp_uploads for abandoned checkout recovery
  useEffect(() => {
    if (!uploadComplete || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return
    const timer = setTimeout(() => {
      fetch('/api/save-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, sessionId: sessionIdRef.current }),
      }).catch(() => {/* silent fail */})
    }, 800)
    return () => clearTimeout(timer)
  }, [email, uploadComplete])

  // Capture affiliate ref from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const ref = params.get('ref')
    if (ref) setAffiliateCode(ref)
  }, [])

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
      } else if (ext === '.epub') {
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
        const res = await fetch('/api/upload', { method: 'POST', body: formData })
        if (!res.ok) throw new Error('Upload failed')
        const result = await res.json()
        sessionIdRef.current = result.sessionId
        uploadTokenRef.current = result.uploadToken
        briefApprovedRef.current = false
        scanCompletedRef.current = false
        hardenedUploadRef.current = result.pipelineVersion === 'hardened-v1'
        // Use server-calculated word count for all formats (backend extraction is more accurate)
        if (result.wordCount) {
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

  const runPreTranslationScan = async () => {
    if (!uploadComplete || selectedLanguages.length === 0) return
    setScanLoading(true)
    try {
      const response = await fetch('/api/scan-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sessionIdRef.current,
          uploadToken: uploadTokenRef.current,
          genre: selectedGenre,
          languages: selectedLanguages,
          maxFindings: 8,
        }),
      })

      if (!response.ok) throw new Error('Scan failed')
      const { findings, quality } = await response.json()
      scanCompletedRef.current = true
      setScanQuality(quality)

      if (findings.length > 0 || (quality && quality.issues && quality.issues.length > 0)) {
        setScanFindings(findings)
        const defaults: Record<string, string> = {}
        findings.forEach((f: any) => { defaults[f.original] = f.defaultOption })
        setScanResponses(defaults)
        setCheckoutStep(3)
      } else {
        setCheckoutStep(4)
      }
    } catch (err) {
      console.error('Scan error:', err)
      scanCompletedRef.current = false
      if (hardenedUploadRef.current) {
        alert('The pre-translation check could not be completed. Please try again before continuing.')
      } else {
        setCheckoutStep(4)
      }
    }
    setScanLoading(false)
  }

  const applyScanResponses = async (): Promise<boolean> => {
    const instructionLines: string[] = []
    scanFindings.forEach((finding) => {
      const response = scanResponses[finding.original]
      if (response === 'false_positive') {
        // Skip — user dismissed this as a false positive
        return
      }
      if (response === 'keep') {
        instructionLines.push(`Keep "${finding.original}" in English - do not translate or adapt`)
      } else if (response === 'adapt') {
        instructionLines.push(`Adapt "${finding.original}" to the nearest local equivalent`)
      } else if (response === 'convert') {
        instructionLines.push(`Convert "${finding.original}" to metric equivalent`)
      } else if (response === 'footnote') {
        instructionLines.push(`Keep "${finding.original}" in English + add local equivalent in brackets on first mention, then just the English term afterwards`)
      } else if (response === 'translator') {
        instructionLines.push(`For "${finding.original}": let the translator choose the best local equivalent based on context`)
      }
    })

    const decisions = scanFindings.map((finding) => ({
      term: finding.original,
      decision: scanResponses[finding.original],
      type: finding.type,
    }))

    // Save glossary decisions to the server so they are available after payment
    try {
      const response = await fetch('/api/save-glossary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sessionIdRef.current,
          uploadToken: uploadTokenRef.current,
          decisions,
        }),
      })
      if (!response.ok) throw new Error('Translation choices were not saved')
      briefApprovedRef.current = true
    } catch (err) {
      console.error('[scan] Failed to save glossary decisions:', err)
      alert('We could not save your translation choices. Please try again before continuing.')
      return false
    }

    if (instructionLines.length > 0) {
      const scanBlock = `AUTO-DETECTED TRANSLATION PREFERENCES:\n${instructionLines.join('\n')}`
      setSpecialInstructions(prev => prev ? `${prev}\n\n${scanBlock}` : scanBlock)
    }
    return true
  }

  const handleCheckout = async () => {
    if (!uploadComplete) {
      alert('Please wait for your file to finish uploading before proceeding.')
      return
    }
    setIsProcessing(true)

    try {
      if (hardenedUploadRef.current && !scanCompletedRef.current) {
        alert('Please complete the pre-translation check before continuing.')
        setIsProcessing(false)
        return
      }
      if (!briefApprovedRef.current && !(await applyScanResponses())) {
        setIsProcessing(false)
        return
      }
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
          uploadToken: uploadTokenRef.current,
          bookSetting,
          affiliateCode,
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
  const serifFont = { fontFamily: "'EB Garamond', Georgia, serif" }

  // Landing Page
  if (currentView === 'landing') {
    return (
      <div className="min-h-screen bg-cream">
        {/* Google Font */}
        <style>{`@import url('https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400&display=swap');`}</style>

        <EmailSignupPopup />

        {/* Top pricing bar */}
        <div className="bg-brand text-white text-sm py-2 px-4 text-center">
          <span className="font-semibold">From $99 per language</span>
          <span className="hidden sm:inline">
            <span className="mx-2 opacity-60">·</span>
            Novellas $99 · Novels $149 · Up to 150k words $199
          </span>
          <span className="mx-2 opacity-60">·</span>
          <a href="/examples" className="underline underline-offset-2 hover:opacity-80 font-medium">See examples →</a>
        </div>

        <header className="relative overflow-hidden">
          <div className="absolute inset-0 opacity-30">
            <div className="absolute top-20 left-10 w-72 h-72 bg-amber-200 rounded-full blur-3xl" />
            <div className="absolute top-40 right-20 w-96 h-96 bg-brand-light rounded-full blur-3xl" />
          </div>

          <nav className="relative z-10 flex items-center justify-between px-4 sm:px-8 py-6 max-w-7xl mx-auto">
            <div className="flex items-center gap-3 min-w-0">
              <Logo size="lg" />
            </div>
            <div className="flex items-center gap-3 sm:gap-6">
              <ResourcesMenu />
              <a href="/examples" className="text-gray-600 hover:text-brand-dark font-medium transition-colors hidden sm:block">
                Examples
              </a>
              <a href="/publishers" className="text-gray-600 hover:text-brand-dark font-medium transition-colors hidden sm:block">
                Publishers
              </a>
              <button
                onClick={() => setCurrentView('upload')}
                className="px-4 py-2 sm:px-6 sm:py-2.5 bg-brand text-white rounded-full text-sm sm:text-base font-semibold shadow-lg hover:shadow-xl transition-all whitespace-nowrap"
              >
                Start Translating
              </button>
            </div>
          </nav>

          <div className="relative z-10 max-w-7xl mx-auto px-8 pt-12 pb-20">
            <div className="grid lg:grid-cols-2 gap-16 items-center">
              <div>
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/80 rounded-full text-sm font-medium text-brand-dark mb-8">
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  From $99 per language · Editorial review included
                </div>

                <h1 className="text-6xl font-bold text-gray-900 leading-tight mb-6" style={serifFont}>
                  Translate Your Book
                  <span className="block bg-brand bg-clip-text text-transparent">
                    in Hours, Not Months
                  </span>
                </h1>

                <p className="text-xl text-gray-600 leading-relaxed mb-10 max-w-lg">
                  Professional AI translation for indie authors. From $99 per language - vs $5,000-$20,000 with a human agency. Smart cultural scan + two-pass editorial review included.
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
                    onClick={() => { trackStartTranslation('hero'); setCurrentView('upload') }}
                    className="px-8 py-4 bg-brand text-white rounded-2xl font-bold text-lg shadow-xl hover:shadow-2xl transition-all hover:-translate-y-1"
                  >
                    Upload Your Book →
                  </button>
                  <a
                    href="/examples"
                    className="px-8 py-4 bg-white border-2 border-brand-light text-brand-dark rounded-2xl font-bold text-lg hover:border-brand-light hover:bg-[#F3F0F8] transition-all"
                  >
                    See Examples
                  </a>
                </div>

                {/* Supported languages */}
                <div className="mt-8">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Available languages</p>
                  <div className="flex flex-wrap gap-2">
                    {CORE_LANGUAGES.map(l => (
                      <span key={l.code} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-sm text-gray-700 shadow-sm">
                        <span>{l.flag}</span>
                        <span className="font-medium">{l.name}</span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="relative">
                <div className="absolute -inset-4 bg-gradient-to-r from-amber-300/20 to-brand/20 rounded-3xl blur-2xl" />
                <div className="relative bg-white rounded-3xl shadow-2xl p-8 border border-brand-light/50">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-16 h-20 bg-gradient-to-br from-brand to-brand-dark rounded-lg shadow-lg flex items-center justify-center">
                      <span className="text-white text-2xl">📘</span>
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900" style={serifFont}>The Art of Clear Thinking</h3>
                      <p className="text-sm text-gray-500">65,000 words · Non-Fiction · EPUB</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mb-4">
                    {CORE_LANGUAGES.slice(0, 4).map(l => (
                      <span key={l.code} className="text-2xl">{l.flag}</span>
                    ))}
                    <span className="text-lg">+</span>
                    <span className="ml-1 px-2 py-1 bg-brand-light text-brand-dark text-xs font-semibold rounded-full">
                      6 Languages
                    </span>
                  </div>

                  <div className="flex justify-between items-center py-3 border-t border-gray-100">
                    <div>
                      <span className="text-gray-600 text-sm block">Translation + Editorial Review</span>
                      <span className="text-xs text-green-600 font-medium">40% bundle discount applied when you translate to 6 languages</span>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-2xl text-brand">$89</span>
                      <span className="text-xs text-gray-400 line-through block">$149</span>
                      <span className="text-xs text-gray-500 block">per language</span>
                    </div>
                  </div>

                  <div className="bg-green-50 rounded-xl p-4 border border-green-200 mt-4">
                    <div className="flex items-center gap-2 text-green-700 font-medium text-sm">
                      <span>✓</span> Formatting preserved · Changes highlighted · vs $8,000+ with a human translator
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
                <span className="text-2xl">🔍</span>
                <span>Smart cultural scan</span>
              </div>
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
              <p className="text-xl text-gray-600">Three steps from upload to a translation that reads naturally in any language</p>
            </div>

            <div className="grid md:grid-cols-3 gap-6 mb-16">
              <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-3xl p-8 border border-amber-200">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-14 h-14 bg-amber-500 rounded-2xl flex items-center justify-center text-white text-2xl font-bold shadow-lg">1</div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900" style={serifFont}>Pre-Translation Scan</h3>
                    <p className="text-sm text-amber-600">Smart cultural detection</p>
                  </div>
                </div>
                <p className="text-gray-700 mb-4">
                  Before we translate, we scan your manuscript for country-specific terms, measurements, and cultural references that need your input.
                </p>
                <ul className="space-y-2">
                  {['Flags US/UK-specific terms (W-4, NHS, GPA)', 'Spots measurements (miles → km, pounds → kg)', 'Finds brand names & education terms', 'You choose: keep, adapt, or explain in brackets'].map((item, i) => (
                    <li key={i} className="flex items-center gap-2 text-gray-700 text-sm">
                      <span className="text-amber-600">✓</span>{item}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="bg-gradient-to-br from-[#F3F0F8] to-brand-light rounded-3xl p-8 border border-brand-light">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-14 h-14 bg-brand rounded-2xl flex items-center justify-center text-white text-2xl font-bold shadow-lg">2</div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900" style={serifFont}>Translation Pass</h3>
                    <p className="text-sm text-brand">AI-powered accuracy</p>
                  </div>
                </div>
                <p className="text-gray-700 mb-4">
                  Your entire book is translated while preserving your unique writing style, tone, and voice.
                </p>
                <ul className="space-y-2">
                  {['Preserves author voice & style', 'Maintains book formatting', 'Handles technical terms accurately', 'Keeps proper nouns consistent'].map((item, i) => (
                    <li key={i} className="flex items-center gap-2 text-gray-700 text-sm">
                      <span className="text-brand">✓</span>{item}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="bg-gradient-to-br from-violet-50 to-violet-100 rounded-3xl p-8 border border-brand-light">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-14 h-14 bg-brand rounded-2xl flex items-center justify-center text-white text-2xl font-bold shadow-lg">3</div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900" style={serifFont}>Editorial Review</h3>
                    <p className="text-sm text-brand">Premium quality check</p>
                  </div>
                </div>
                <p className="text-gray-700 mb-4">
                  A premium AI editor reviews every sentence, matching your book's unique tone and style.
                </p>
                <ul className="space-y-2">
                  {['Matches your book\'s tone', 'Region-specific language settings', 'Natural phrasing & idioms', 'All changes highlighted in yellow'].map((item, i) => (
                    <li key={i} className="flex items-center gap-2 text-gray-700 text-sm">
                      <span className="text-brand">✓</span>{item}
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
                <div className="bg-[#F3F0F8] px-4 py-3 border-t border-violet-100">
                  <p className="text-sm text-brand-dark">
                    <span className="font-semibold">💡 2 editorial improvements highlighted</span> - Review and approve each change
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Format Info */}
        <section className="py-16 bg-white border-t border-gray-100">
          <div className="max-w-4xl mx-auto px-8">
            <div className="text-center mb-10">
              <h2 className="text-2xl font-bold text-gray-900 mb-2" style={serifFont}>What You Get Back</h2>
              <p className="text-gray-600">Depending on what you upload</p>
            </div>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-gradient-to-br from-blue-50 to-white rounded-2xl p-6 border border-[#EBE6F4]">
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-2xl">📱</span>
                  <h3 className="font-bold text-gray-900">If you upload EPUB</h3>
                </div>
                <p className="text-gray-700 text-sm leading-relaxed mb-3">
                  Your translated EPUB will look great and read naturally - in the clean, standard ebook style readers are used to. Chapter structure and paragraphs are preserved.
                </p>
                <p className="text-gray-500 text-sm">
                  If your original has custom styling (special fonts, drop caps, complex layouts), you'll want to review and apply those in your formatting tool before publishing. Many authors go straight from BookLingua to KDP upload.
                </p>
              </div>
              <div className="bg-gradient-to-br from-violet-50 to-white rounded-2xl p-6 border border-violet-100">
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-2xl">📕</span>
                  <h3 className="font-bold text-gray-900">If you upload DOCX</h3>
                </div>
                <p className="text-gray-700 text-sm leading-relaxed mb-3">
                  We do our best to keep your original formatting - fonts, spacing, headings, bold and italic text - so your translated file looks as close to the original as possible.
                </p>
                <p className="text-gray-500 text-sm">
                  Most customers can go straight from BookLingua to KDP or print setup, but it's worth a quick review to make sure you're fully happy before going to print.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="py-24 bg-gradient-to-b from-white to-cream scroll-mt-8">
          <div className="max-w-7xl mx-auto px-8">
            <div className="text-center mb-16">
              <h2 className="text-4xl font-bold text-gray-900 mb-4" style={serifFont}>Simple, transparent pricing</h2>
              <p className="text-xl text-gray-600">Per language • Includes editorial review</p>
              <p className="text-lg text-brand font-medium mt-3">Upload your book and we automatically calculate your exact price — no need to pick a tier</p>
            </div>

            <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto mb-16">
              {Object.entries(WORD_TIERS).map(([key, tier]) => (
                <div
                  key={key}
                  className={`relative bg-white rounded-3xl p-8 border-2 cursor-default ${
                    key === 'medium' ? 'border-brand shadow-lg' : 'border-gray-100'
                  }`}
                >
                  {key === 'medium' && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-brand text-white text-sm font-bold rounded-full">
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
                    <p className="text-xs text-brand font-medium mt-3">Auto-detected after upload</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Bundle discounts */}
            <div className="bg-[#F3F0F8] rounded-3xl p-8 max-w-4xl mx-auto">
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
                Example: 80k novel → All 6 languages = <span className="font-bold text-brand">${(149 * 6 * 0.60).toFixed(0)}</span> <span className="text-gray-400 line-through">${149 * 6}</span> (40% bundle discount)
              </p>
            </div>

            <div className="text-center mt-12">
              <button
                onClick={() => { trackStartTranslation('pricing'); setCurrentView('upload') }}
                className="px-10 py-4 bg-brand text-white rounded-2xl font-bold text-lg shadow-xl hover:shadow-2xl transition-all"
              >
                Upload Your Book to See Your Price →
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
                  a: 'Yes - significantly. BookLingua uses a proprietary two-pass system: the first pass produces a faithful translation; the second is an editorial review that refines idioms, adapts cultural context, and ensures your book reads naturally to native speakers. Every change is highlighted so you stay in control.',
                },
                {
                  q: 'What file formats do you support?',
                  a: 'EPUB, DOCX, and TXT. We recommend DOCX for best results - it gives the most accurate word count and preserves formatting perfectly. PDF is not supported as formatting is lost during conversion.',
                },
                {
                  q: 'How long does translation take?',
                  a: 'Most books complete within 2-6 hours depending on length. You\'ll receive an email with your download link as soon as it\'s ready.',
                },
                {
                  q: 'Can I see examples before I buy?',
                  a: 'Absolutely - visit our Examples page to see real side-by-side translations with editorial highlights.',
                  link: { href: '/examples', label: 'View Examples →' },
                },
                {
                  q: 'What if I\'m not happy with the translation?',
                  a: 'Email us within 7 days and we\'ll work with you to make it right.',
                },
                {
                  q: 'Do you offer pricing for publishers with larger catalogues?',
                  a: 'Yes - if you have 10 or more books, we offer custom bulk pricing and a hands-off pipeline.',
                  link: { href: '/publishers', label: 'Learn more →' },
                },
                {
                  q: 'How much does AI book translation cost?',
                  a: 'Our pricing is based on word count: $99 for up to 40k words, $149 for up to 80k words, and $199 for up to 150k words — per language. If you translate into multiple languages, bundle discounts apply automatically, up to 40% off when you translate into all 6 core languages.',
                },
                {
                  q: 'Is AI book translation good enough to publish?',
                  a: 'It can be — with the right process. BookLingua runs a cultural scan, a two-pass editorial review, consistency checks, and optional native-language proofreading so the final manuscript is ready for publication.',
                },
                {
                  q: 'What languages can I translate my book into?',
                  a: 'We currently support Spanish (Spain), Spanish (Latin America), French, German, Italian, Portuguese (Portugal), Portuguese (Brazil), Polish, and Japanese.',
                },
                {
                  q: 'Can AI translate fiction and keep my author voice?',
                  a: 'Yes. We use genre-specific prompts and a translation brief to preserve your tone, style, character voices, and narrative pacing. The editorial review then refines idioms, dialogue, and cultural references so the book reads naturally.',
                },
                {
                  q: 'Will my manuscript formatting be preserved?',
                  a: 'DOCX gives the best formatting preservation. EPUB comes back ebook-ready. TXT is supported for plain text. PDF is not supported because formatting is lost during conversion.',
                },
                {
                  q: 'Do you include human proofreading?',
                  a: 'Every order includes a human editorial review with a proofreading report. You receive a Review DOCX showing every change highlighted in yellow, plus a final clean file ready to publish.',
                },
                {
                  q: 'Can I translate my whole book series?',
                  a: 'Yes. We build a shared glossary and style guide so character names, invented terms, place names, and voice stay consistent across every book in the series.',
                },
              ].map((item, i) => (
                <div key={i} className="bg-gradient-to-br from-cream to-[#F3F0F8] rounded-2xl p-6 border border-[#EBE6F4]">
                  <h3 className="text-lg font-bold text-gray-900 mb-3" style={serifFont}>{item.q}</h3>
                  <p className="text-gray-600 leading-relaxed">{item.a}</p>
                  {'link' in item && item.link && (
                    <a href={item.link.href} className="inline-block mt-3 text-sm font-semibold text-brand hover:text-brand-dark transition-colors">
                      {item.link.label}
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify({
                '@context': 'https://schema.org',
                '@type': 'FAQPage',
                mainEntity: [
                  {
                    '@type': 'Question',
                    name: 'Is this better than Google Translate?',
                    acceptedAnswer: {
                      '@type': 'Answer',
                      text: "Yes - significantly. BookLingua uses a proprietary two-pass system: the first pass produces a faithful translation; the second is an editorial review that refines idioms, adapts cultural context, and ensures your book reads naturally to native speakers. Every change is highlighted so you stay in control.",
                    },
                  },
                  {
                    '@type': 'Question',
                    name: 'What file formats do you support?',
                    acceptedAnswer: {
                      '@type': 'Answer',
                      text: 'EPUB, DOCX, and TXT. We recommend DOCX for best results - it gives the most accurate word count and preserves formatting perfectly. PDF is not supported as formatting is lost during conversion.',
                    },
                  },
                  {
                    '@type': 'Question',
                    name: 'How long does translation take?',
                    acceptedAnswer: {
                      '@type': 'Answer',
                      text: "Most books complete within 2-6 hours depending on length. You'll receive an email with your download link as soon as it's ready.",
                    },
                  },
                  {
                    '@type': 'Question',
                    name: 'Can I see examples before I buy?',
                    acceptedAnswer: {
                      '@type': 'Answer',
                      text: 'Absolutely - visit our Examples page to see real side-by-side translations with editorial highlights.',
                    },
                  },
                  {
                    '@type': 'Question',
                    name: "What if I'm not happy with the translation?",
                    acceptedAnswer: {
                      '@type': 'Answer',
                      text: 'Email us within 7 days and we’ll work with you to make it right.',
                    },
                  },
                  {
                    '@type': 'Question',
                    name: 'Do you offer pricing for publishers with larger catalogues?',
                    acceptedAnswer: {
                      '@type': 'Answer',
                      text: 'Yes - if you have 10 or more books, we offer custom bulk pricing and a hands-off pipeline.',
                    },
                  },
                  {
                    '@type': 'Question',
                    name: 'How much does AI book translation cost?',
                    acceptedAnswer: {
                      '@type': 'Answer',
                      text: 'Our pricing is based on word count: $99 for up to 40k words, $149 for up to 80k words, and $199 for up to 150k words — per language. Bundle discounts apply automatically, up to 40% off for all 6 languages.',
                    },
                  },
                  {
                    '@type': 'Question',
                    name: 'Is AI book translation good enough to publish?',
                    acceptedAnswer: {
                      '@type': 'Answer',
                      text: 'It can be — with the right process. BookLingua runs a cultural scan, a two-pass editorial review, consistency checks, and optional native-language proofreading so the final manuscript is ready for publication.',
                    },
                  },
                  {
                    '@type': 'Question',
                    name: 'What languages can I translate my book into?',
                    acceptedAnswer: {
                      '@type': 'Answer',
                      text: 'We currently support Spanish (Spain), Spanish (Latin America), French, German, Italian, Portuguese (Portugal), Portuguese (Brazil), Polish, and Japanese.',
                    },
                  },
                  {
                    '@type': 'Question',
                    name: 'Can AI translate fiction and keep my author voice?',
                    acceptedAnswer: {
                      '@type': 'Answer',
                      text: 'Yes. We use genre-specific prompts and a translation brief to preserve your tone, style, character voices, and narrative pacing. The editorial review then refines idioms, dialogue, and cultural references.',
                    },
                  },
                  {
                    '@type': 'Question',
                    name: 'Will my manuscript formatting be preserved?',
                    acceptedAnswer: {
                      '@type': 'Answer',
                      text: 'DOCX gives the best formatting preservation. EPUB comes back ebook-ready. TXT is supported for plain text. PDF is not supported because formatting is lost during conversion.',
                    },
                  },
                  {
                    '@type': 'Question',
                    name: 'Do you include human proofreading?',
                    acceptedAnswer: {
                      '@type': 'Answer',
                      text: 'Every order includes a human editorial review with a proofreading report. You receive a Review DOCX showing every change highlighted in yellow, plus a final clean file ready to publish.',
                    },
                  },
                  {
                    '@type': 'Question',
                    name: 'Can I translate my whole book series?',
                    acceptedAnswer: {
                      '@type': 'Answer',
                      text: 'Yes. We build a shared glossary and style guide so character names, invented terms, place names, and voice stay consistent across every book in the series.',
                    },
                  },
                ],
              }),
            }}
          />
        </section>

        {/* Footer */}
        <div className="bg-gray-900 text-gray-400">
          {/* Newsletter signup strip */}
          <FooterSignup serifFont={serifFont} />

          <SiteFooter />
        </div>
      </div>
    )
  }

  // Upload Flow
  return (
    <div className="min-h-screen bg-cream">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400&display=swap');`}</style>

      <nav className="flex items-center justify-between px-8 py-6 max-w-5xl mx-auto">
        <button onClick={() => { setCurrentView('landing'); setCheckoutStep(1) }} className="flex items-center gap-3">
          <Logo size="lg" />
        </button>

        <div className="flex items-center gap-4">
          {['Upload', 'Languages', 'Review', 'Checkout'].map((step, i) => (
            <div key={step} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                checkoutStep > i + 1 ? 'bg-green-500 text-white' :
                checkoutStep === i + 1 ? 'bg-brand text-white' : 'bg-gray-200 text-gray-500'
              }`}>
                {checkoutStep > i + 1 ? '✓' : i + 1}
              </div>
              <span className={`font-medium ${checkoutStep === i + 1 ? 'text-gray-900' : 'text-gray-400'}`}>
                {step}
              </span>
              {i < 3 && <div className="w-8 h-0.5 bg-gray-200 mx-2" />}
            </div>
          ))}
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-8 py-8">
        {/* Step 1: Upload */}
        {checkoutStep === 1 && (
          <>
            <div className="text-center mb-8">
              <h2 className="text-4xl font-bold text-gray-900 mb-4" style={serifFont}>Upload Your Book</h2>
              <p className="text-gray-600 text-lg">EPUB, DOCX, or TXT - formatting preserved</p>
            </div>

            {!uploadedFile ? (
              <div
                className={`relative border-2 border-dashed rounded-3xl p-16 text-center transition-all cursor-pointer ${
                  dragActive ? 'border-brand bg-[#F3F0F8]' : 'border-gray-300 bg-white hover:border-brand-light'
                }`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              >
                <input
                  type="file"
                  accept=".epub,.docx,.txt"
                  onChange={handleDrop}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <div className="w-24 h-24 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-amber-100 to-brand-light flex items-center justify-center">
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
                <p className="text-sm text-gray-500 mt-4 max-w-md mx-auto">
                  <strong>Tip:</strong> DOCX gives you the fastest turnaround and most accurate chapter structure. 
                  If you have both EPUB and DOCX, use DOCX. No DOCX? EPUB works great too — we manually verify 
                  structure before delivery.
                </p>
              </div>
            ) : (
              <div className="bg-white rounded-3xl shadow-xl p-8 border border-[#EBE6F4]">
                {isProcessing ? (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 mx-auto mb-6 rounded-full border-4 border-brand-light border-t-violet-600 animate-spin" />
                    <p className="text-gray-600">Processing your manuscript...</p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start gap-6 mb-8 pb-8 border-b border-gray-100">
                      <div className="w-20 h-24 bg-gradient-to-br from-brand to-brand-dark rounded-xl shadow-lg flex items-center justify-center">
                        <span className="text-white text-3xl">
                          {fileFormat === '.epub' ? '📱' : '📕'}
                        </span>
                      </div>
                      <div className="flex-1">
                        <input
                          type="text"
                          value={bookTitle}
                          onChange={(e) => setBookTitle(e.target.value)}
                          className="text-2xl font-bold text-gray-900 w-full bg-transparent border-b-2 border-transparent hover:border-gray-200 focus:border-brand-light focus:outline-none pb-1 mb-2"
                          style={serifFont}
                          placeholder="Book Title"
                        />
                        <p className="text-gray-500">{uploadedFile.name}</p>
                        <div className="flex items-center gap-4 mt-2">
                          <span className="text-brand font-semibold">{wordCount.toLocaleString()} words</span>
                          <span className="px-2 py-1 bg-brand-light text-brand-dark text-xs font-semibold rounded-full">
                            {WORD_TIERS[selectedTier!]?.label}
                          </span>
                          <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs font-semibold rounded-full">
                            {fileFormat.toUpperCase()} - formatting preserved
                          </span>
                        </div>
                      </div>
                      <button
                onClick={() => { setUploadedFile(null); setWordCount(0); setSelectedTier(null); setUploadComplete(false); setUploadError(''); sessionIdRef.current = ''; uploadTokenRef.current = ''; briefApprovedRef.current = false; scanCompletedRef.current = false; hardenedUploadRef.current = false }}
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
                          className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-brand-light focus:ring-2 focus:ring-brand-light outline-none"
                          placeholder="Your name"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-brand-light focus:ring-2 focus:ring-brand-light outline-none"
                          placeholder="you@example.com"
                        />
                      </div>
                    </div>

                    <div className="mb-6">
                      <label className="block text-sm font-medium text-gray-700 mb-2">Genre</label>
                      <select
                        value={selectedGenre}
                        onChange={(e) => setSelectedGenre(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-brand-light outline-none"
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
                                  ? 'border-brand bg-[#F3F0F8]'
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
                        <span className="ml-2 text-xs font-normal text-gray-500">Optional - helps preserve cultural authenticity</span>
                      </label>
                      <textarea
                        value={bookSetting}
                        onChange={e => setBookSetting(e.target.value)}
                        rows={3}
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white text-gray-800 resize-none"
                        placeholder={`Examples:\n• Set in America - keep DA, precinct, Secretary of State, the Oval Office as-is\n• Set in the UK - keep Prime Minister (don't translate to Chancellor), NHS, barrister\n• Fantasy world - all place names and invented words are untranslatable\n• Historical France - use period titles (Monsieur le Président, not President)`}
                      />
                    </div>

                    {/* Special Instructions with genre tips */}
                    <div className="mb-8">
                      <label className="block text-sm font-medium text-gray-700 mb-2">Special Instructions (optional)</label>
                      {/* Genre-specific clickable tip chips */}
                      {selectedGenre && GENRE_INSTRUCTION_TIPS[normalizeGenreKey(selectedGenre)] && (
                        <div className="mb-2">
                          <p className="text-xs font-medium text-gray-500 mb-1.5">💡 Suggested instructions - click to add:</p>
                          <div className="flex flex-wrap gap-2 mb-2">
                            {[
                              ...(GENRE_INSTRUCTION_TIPS[normalizeGenreKey(selectedGenre)] || []),
                              ...(heatLevel && GENRE_INSTRUCTION_TIPS[heatLevel] ? GENRE_INSTRUCTION_TIPS[heatLevel] : []),
                            ].map((tip, i) => (
                              <button
                                key={i}
                                type="button"
                                onClick={() => setSpecialInstructions(prev => prev ? `${prev}\n${tip}` : tip)}
                                className="text-xs px-3 py-1.5 rounded-full bg-[#F3F0F8] border border-brand-light text-brand-dark hover:bg-brand-light transition-colors text-left"
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
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-brand-light outline-none resize-none"
                        rows={3}
                        placeholder="Any specific instructions for your translator…"
                      />
                    </div>

                    {/* Upload status indicator */}
                    {!uploadComplete && !uploadError && (
                      <div className="flex items-center gap-2 text-sm text-brand mb-4 px-1">
                        <div className="w-4 h-4 border-2 border-brand-light border-t-brand rounded-full animate-spin" />
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

                    {/* Pre-Translation Scan Results */}
                    {showScanStep && scanFindings.length > 0 && (
                      <div className="mb-8 bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl p-6 border-2 border-amber-200">
                        <div className="flex items-center gap-3 mb-4">
                          <span className="text-2xl">🔍</span>
                          <div>
                            <h3 className="font-bold text-gray-900">We scanned your manuscript</h3>
                            <p className="text-sm text-gray-600">We found {scanFindings.length} item{scanFindings.length > 1 ? 's' : ''} that may need your input before translation</p>
                          </div>
                        </div>

                        <div className="space-y-4">
                          {scanFindings.map((finding, idx) => (
                            <div key={idx} className="bg-white rounded-xl p-4 border border-amber-100">
                              <div className="flex items-start gap-3 mb-3">
                                <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                                  finding.type === 'country_specific' ? 'bg-red-100 text-red-700' :
                                  finding.type === 'proper_name' ? 'bg-blue-100 text-blue-700' :
                                  finding.type === 'fantasy_element' ? 'bg-purple-100 text-purple-700' :
                                  'bg-gray-100 text-gray-700'
                                }`}>
                                  {finding.type === 'country_specific' ? 'COUNTRY-SPECIFIC' :
                                   finding.type === 'proper_name' ? 'PROPER NAME' :
                                   finding.type === 'fantasy_element' ? 'FANTASY' : 'AMBIGUOUS'}
                                </span>
                                <div className="flex-1">
                                  <p className="font-semibold text-gray-900 text-sm">{finding.question}</p>
                                  {finding.context && (
                                    <p className="text-xs text-gray-500 mt-1 italic">Context: "{finding.context.slice(0, 120)}..."</p>
                                  )}
                                </div>
                              </div>

                              <div className="grid gap-2">
                                {finding.options.map((opt: any) => (
                                  <label key={opt.value} className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                                    opt.value === 'false_positive'
                                      ? scanResponses[finding.original] === opt.value
                                        ? 'border-red-400 bg-red-50'
                                        : 'border-gray-200 hover:border-red-300'
                                      : scanResponses[finding.original] === opt.value
                                        ? 'border-brand bg-[#F3F0F8]'
                                        : 'border-gray-200 hover:border-violet-300'
                                  }`}>
                                    <input
                                      type="radio"
                                      name={`finding-${idx}`}
                                      value={opt.value}
                                      checked={scanResponses[finding.original] === opt.value}
                                      onChange={() => setScanResponses(prev => ({ ...prev, [finding.original]: opt.value }))}
                                      className={`mt-1 w-4 h-4 ${opt.value === 'false_positive' ? 'text-red-500' : 'text-brand'}`}
                                    />
                                    <div>
                                      <p className={`font-medium text-sm ${opt.value === 'false_positive' ? 'text-red-700' : 'text-gray-900'}`}>{opt.label}</p>
                                      <p className="text-xs text-gray-500">{opt.description}</p>
                                    </div>
                                  </label>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="flex gap-3 mt-6">
                          <button
                            onClick={() => { setShowScanStep(false); setScanFindings([]) }}
                            className="px-4 py-3 border-2 border-gray-200 text-gray-600 rounded-xl font-medium text-sm"
                          >
                            Skip & Continue →
                          </button>
                          <button
                            onClick={async () => { if (await applyScanResponses()) setCheckoutStep(4); }}
                            className="flex-1 py-3 bg-brand text-white rounded-xl font-bold text-sm shadow-lg hover:shadow-xl transition-all"
                          >
                            Save Preferences & Continue →
                          </button>
                        </div>
                      </div>
                    )}

                    <button
                      onClick={() => setCheckoutStep(2)}
                      disabled={!email || !bookTitle || !uploadComplete}
                      className={`w-full py-4 rounded-2xl font-bold text-lg transition-all ${
                        email && bookTitle && uploadComplete
                          ? 'bg-brand text-white shadow-xl hover:shadow-2xl'
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
              <h2 className="text-4xl font-bold text-gray-900 mb-4" style={serifFont}>Select Languages</h2>
              <p className="text-gray-600 text-lg">Choose one or bundle multiple for bigger savings</p>
            </div>

            <div className="bg-white rounded-3xl shadow-xl p-8 border border-[#EBE6F4]">
              <div className="bg-brand rounded-2xl p-6 mb-8 text-white">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-bold mb-1">🎉 Bundle All 6 Languages & Save 40%</h3>
                    <p className="text-white/80">Spanish, French, German, Italian, Polish, Japanese & Portuguese</p>
                  </div>
                  <button
                    onClick={selectAllCore}
                    className="px-6 py-3 bg-white text-brand rounded-xl font-bold hover:shadow-lg transition-all"
                  >
                    Select All 6
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
                        ? 'border-brand bg-[#F3F0F8]'
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
                          ? 'border-brand bg-[#F3F0F8]0 text-white'
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
                  {BUNDLE_DISCOUNTS[Math.min(selectedLanguages.length, 6) as keyof typeof BUNDLE_DISCOUNTS].discount > 0 && (
                    <div className="flex justify-between items-center mb-4 text-green-600">
                      <span>Bundle discount</span>
                      <span className="font-semibold">-{BUNDLE_DISCOUNTS[Math.min(selectedLanguages.length, 6) as keyof typeof BUNDLE_DISCOUNTS].discount}%</span>
                    </div>
                  )}
                  <div className="border-t border-gray-200 pt-4 flex justify-between items-center">
                    <span className="text-lg font-bold text-gray-900">Total</span>
                    <span className="text-3xl font-bold text-brand">
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
                  onClick={runPreTranslationScan}
                  disabled={selectedLanguages.length === 0 || scanLoading}
                  className={`flex-1 py-4 rounded-2xl font-bold text-lg transition-all ${
                    selectedLanguages.length > 0 && !scanLoading
                      ? 'bg-brand text-white shadow-xl'
                      : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  {scanLoading ? 'Scanning…' : 'Continue to Review →'}
                </button>
              </div>
            </div>
          </>
        )}

        {/* Step 3: Review Scanner Findings */}
        {checkoutStep === 3 && (
          <>
            <div className="text-center mb-8">
              <h2 className="text-4xl font-bold text-gray-900 mb-4" style={serifFont}>Review Translation Preferences</h2>
              <p className="text-gray-600 text-lg">We scanned your manuscript for terms that need your input</p>
            </div>

            <div className="max-w-3xl mx-auto">
              {/* Quality report */}
              {scanQuality && (
                <div className={`mb-6 rounded-2xl p-5 border-2 ${
                  scanQuality.status === 'unprocessable'
                    ? 'bg-red-50 border-red-200'
                    : scanQuality.status === 'needs_review'
                      ? 'bg-amber-50 border-amber-200'
                      : 'bg-green-50 border-green-200'
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className={`font-bold ${
                      scanQuality.status === 'unprocessable'
                        ? 'text-red-800'
                        : scanQuality.status === 'needs_review'
                          ? 'text-amber-800'
                          : 'text-green-800'
                    }`}>
                      {scanQuality.status === 'unprocessable'
                        ? '⚠️ Upload Quality: Unprocessable'
                        : scanQuality.status === 'needs_review'
                          ? '⚡ Upload Quality: Needs Review'
                          : '✅ Upload Quality: Clean'}
                    </h3>
                    <span className={`text-sm font-bold px-2.5 py-1 rounded-full ${
                      scanQuality.status === 'unprocessable'
                        ? 'bg-red-100 text-red-700'
                        : scanQuality.status === 'needs_review'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-green-100 text-green-700'
                    }`}>
                      Score: {scanQuality.score}/100
                    </span>
                  </div>
                  <div className="text-sm text-gray-600 grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                    <div><span className="font-semibold">{scanQuality.headingCount}</span> headings</div>
                    <div><span className="font-semibold">{scanQuality.paragraphCount}</span> paragraphs</div>
                    <div><span className="font-semibold">{Math.round(scanQuality.avgParagraphLength)}</span> avg words</div>
                    <div><span className="font-semibold">{scanQuality.hasProperStyles ? 'Yes' : 'No'}</span> proper styles</div>
                  </div>
                  {scanQuality.issues?.length > 0 && (
                    <ul className="space-y-1.5">
                      {scanQuality.issues.map((issue: string, i: number) => (
                        <li key={i} className={`text-sm flex items-start gap-2 ${
                          scanQuality.status === 'unprocessable' ? 'text-red-700' : 'text-amber-700'
                        }`}>
                          <span className="mt-0.5">•</span>
                          <span>{issue}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <div className="mb-8 bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl p-6 border-2 border-amber-200">
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-2xl">🔍</span>
                  <div>
                    <h3 className="font-bold text-gray-900">We found {scanFindings.length} items to review</h3>
                    <p className="text-sm text-gray-600">Your choices will be saved and applied to the translation</p>
                  </div>
                </div>

                <div className="space-y-4">
                  {scanFindings.map((finding, idx) => (
                    <div key={idx} className="bg-white rounded-xl p-4 border border-amber-100">
                      <div className="flex items-start gap-3 mb-3">
                        <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                          finding.type === 'country_specific' ? 'bg-red-100 text-red-700' :
                          finding.type === 'cultural_specific' ? 'bg-rose-100 text-rose-700' :
                          finding.type === 'proper_name' ? 'bg-blue-100 text-blue-700' :
                          finding.type === 'fantasy_element' ? 'bg-purple-100 text-purple-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {finding.type === 'country_specific' ? 'COUNTRY-SPECIFIC' :
                           finding.type === 'cultural_specific' ? 'CULTURAL REFERENCE' :
                           finding.type === 'proper_name' ? 'PROPER NAME' :
                           finding.type === 'fantasy_element' ? 'FANTASY' : 'MEASUREMENT/BRAND'}
                        </span>
                        <div className="flex-1">
                          <p className="font-semibold text-gray-900 text-sm">{finding.question}</p>
                          {finding.context && (
                            <p className="text-xs text-gray-500 mt-1 italic">Context: "{finding.context.slice(0, 120)}..."</p>
                          )}
                        </div>
                      </div>

                      <div className="grid gap-2">
                        {finding.options.map((opt: any) => (
                          <label key={opt.value} className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                            opt.value === 'false_positive'
                              ? scanResponses[finding.original] === opt.value
                                ? 'border-red-400 bg-red-50'
                                : 'border-gray-200 hover:border-red-300'
                              : scanResponses[finding.original] === opt.value
                                ? 'border-brand bg-[#F3F0F8]'
                                : 'border-gray-200 hover:border-violet-300'
                          }`}>
                            <input
                              type="radio"
                              name={`finding-${idx}`}
                              value={opt.value}
                              checked={scanResponses[finding.original] === opt.value}
                              onChange={() => setScanResponses(prev => ({ ...prev, [finding.original]: opt.value }))}
                              className={`mt-1 w-4 h-4 ${opt.value === 'false_positive' ? 'text-red-500' : 'text-brand'}`}
                            />
                            <div>
                              <p className={`font-medium text-sm ${opt.value === 'false_positive' ? 'text-red-700' : 'text-gray-900'}`}>{opt.label}</p>
                              <p className="text-xs text-gray-500">{opt.description}</p>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex gap-3 mt-6">
                  <button
                    onClick={() => setCheckoutStep(2)}
                    className="px-4 py-3 border-2 border-gray-200 text-gray-600 rounded-xl font-medium text-sm"
                  >
                    ← Back to Languages
                  </button>
                  <button
                    onClick={() => { setScanFindings([]); setCheckoutStep(4); }}
                    className="px-4 py-3 border-2 border-gray-200 text-gray-600 rounded-xl font-medium text-sm"
                  >
                    Skip & Continue →
                  </button>
                  <button
                    onClick={async () => { if (await applyScanResponses()) setCheckoutStep(4); }}
                    className="flex-1 py-3 bg-brand text-white rounded-xl font-bold text-sm shadow-lg hover:shadow-xl transition-all"
                  >
                    Save Preferences & Continue →
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Step 4: Checkout with Upsells */}
        {checkoutStep === 4 && (
          <>
            <div className="text-center mb-8">
              <h2 className="text-4xl font-bold text-gray-900 mb-4" style={serifFont}>Complete Your Order</h2>
              <p className="text-gray-600 text-lg">Review your order and add optional extras</p>
            </div>

            <div className="grid lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-6">
                <div className="bg-white rounded-3xl shadow-xl p-8 border border-[#EBE6F4]">
                  <h3 className="text-xl font-bold text-gray-900 mb-6" style={serifFont}>Order Summary</h3>

                  <div className="flex items-start gap-4 mb-6 pb-6 border-b border-gray-100">
                    <div className="w-16 h-20 bg-gradient-to-br from-brand to-brand-dark rounded-xl shadow-lg flex items-center justify-center">
                      <span className="text-white text-2xl">
                        {fileFormat === '.epub' ? '📱' : '📕'}
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
                      {affiliateCode && (
                        <p className="text-xs text-brand mt-1">Referred by: {affiliateCode}</p>
                      )}
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

                <div className="bg-white rounded-3xl shadow-xl p-8 border border-[#EBE6F4]">
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
                          upsell.id === 'launch-pack'
                            ? selectedUpsells.includes(upsell.id)
                              ? 'border-brand bg-[#F3F0F8]'
                              : 'border-brand-light bg-gradient-to-br from-violet-50/60 to-white hover:border-brand-light'
                            : upsell.id === 'dual-format'
                            ? selectedUpsells.includes(upsell.id)
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-brand-light bg-gradient-to-br from-blue-50/60 to-white hover:border-blue-400'
                            : selectedUpsells.includes(upsell.id)
                              ? 'border-brand bg-[#F3F0F8]'
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
                            {upsell.details && (
                              <div className="mt-3 grid grid-cols-1 gap-1">
                                {upsell.details.map((d, i) => (
                                  <div key={i} className="flex items-center gap-2 text-xs text-gray-700">
                                    <span className="text-brand font-bold flex-shrink-0">✓</span>
                                    <span>{d}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="text-right">
                            <p className="text-xl font-bold text-gray-900">${upsell.price}</p>
                            {upsell.originalPrice && (
                              <p className="text-xs text-gray-400 line-through">${upsell.originalPrice}</p>
                            )}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>

                  {/* MRR Romance Reader Promo - shows for romance/erotica only */}
                  {(selectedGenre === 'Romance' || selectedGenre === 'Erotica' || heatLevel) && (
                    <div className="mt-4 rounded-2xl border-2 border-pink-200 bg-gradient-to-br from-pink-50 to-rose-50 p-5">
                      <div className="flex items-start gap-3">
                        <span className="text-2xl">🌶️</span>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-bold text-gray-900 text-sm">Romance Reader Shoutout</h4>
                            <span className="px-2 py-0.5 bg-pink-100 text-pink-700 text-xs font-semibold rounded-full">Romance Special</span>
                          </div>
                          <p className="text-xs text-gray-600 mb-3">Get your translated romance featured to 20,000+ romance readers via My Romance Reads. English version live at myromancereads.com - MRR Europe coming soon.</p>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-gray-400 line-through mr-1">$90</span>
                              <span className="text-lg font-bold text-gray-900">$69</span>
                            </div>
                            <button
                              onClick={() => toggleUpsell('mrr-shoutout')}
                              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                                selectedUpsells.includes('mrr-shoutout')
                                  ? 'bg-pink-500 text-white'
                                  : 'bg-white border-2 border-pink-300 text-pink-700 hover:bg-pink-50'
                              }`}
                            >
                              {selectedUpsells.includes('mrr-shoutout') ? '✓ Added' : '+ Add'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="lg:col-span-1">
                <div className="bg-white rounded-3xl shadow-xl p-6 border border-[#EBE6F4] sticky top-8">
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
                        <span className="font-medium">-${getVoucherDiscountAmount()}</span>
                      </div>
                    )}
                    <div className="border-t border-gray-200 pt-3 flex justify-between">
                      <span className="text-lg font-bold text-gray-900">Total</span>
                      <div className="text-right">
                        {voucherApplied && (
                          <span className="text-gray-400 line-through text-sm mr-2">${calculateTotal()}</span>
                        )}
                        <span className="text-2xl font-bold text-brand">${calculateFinalTotal()}</span>
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
                          className="flex-1 px-3 py-2 rounded-xl border border-gray-200 focus:border-brand-light outline-none text-sm"
                        />
                        <button
                          onClick={applyVoucher}
                          disabled={voucherLoading || !voucherCode.trim()}
                          className="px-4 py-2 bg-brand-light text-brand-dark rounded-xl font-medium text-sm hover:bg-brand-light disabled:opacity-50"
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

                  <label className="flex items-start gap-3 mb-4 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={copyrightConfirmed}
                      onChange={e => setCopyrightConfirmed(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded border-gray-300 text-brand focus:ring-brand cursor-pointer"
                    />
                    <span className="text-sm text-gray-500 group-hover:text-gray-700 leading-snug">
                      I confirm I own the copyright to this content, or have permission to have it translated.
                    </span>
                  </label>

                  <button
                    onClick={handleCheckout}
                    disabled={isProcessing || !copyrightConfirmed}
                    className="w-full py-4 bg-brand text-white rounded-2xl font-bold text-lg shadow-xl hover:shadow-2xl transition-all mb-4 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isProcessing ? 'Processing...' : `Pay $${calculateFinalTotal()} →`}
                  </button>

                  <button
                    onClick={() => setCheckoutStep(3)}
                    className="w-full py-3 text-gray-500 hover:text-gray-700 font-medium"
                  >
                    ← Back to Review
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
