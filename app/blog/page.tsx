import { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import ResourcesMenu from '@/components/ResourcesMenu'
import SiteFooter from '@/components/SiteFooter'
import { getAllPosts, isPostCategory, postCategoryLabels, PostCategory } from '@/lib/posts'

const siteUrl = 'https://booklingua.io'
const serifFont = { fontFamily: "'EB Garamond', Georgia, serif" }

const categoryContent: Record<PostCategory, { title: string; description: string }> = {
  'translation-advice': {
    title: 'Translation Advice',
    description: 'Expert guidance on AI translation, international publishing, book markets and opportunities for authors.',
  },
  'using-booklingua': {
    title: 'Using BookLingua',
    description: 'Practical, step-by-step guidance to help you prepare for, use and understand the BookLingua service.',
  },
}

interface BlogPageProps {
  searchParams?: { category?: string }
}

function selectedCategory(searchParams?: BlogPageProps['searchParams']): PostCategory | undefined {
  return isPostCategory(searchParams?.category) ? searchParams.category : undefined
}

export function generateMetadata({ searchParams }: BlogPageProps): Metadata {
  const category = selectedCategory(searchParams)
  const title = category ? `${postCategoryLabels[category]} | BookLingua Resources` : 'Book Translation Resources | BookLingua'
  const description = category
    ? categoryContent[category].description
    : 'Practical advice on translating and publishing your book, plus step-by-step guidance to help you get the most from BookLingua.'
  const canonical = category ? `/blog?category=${category}` : '/blog'

  return {
    title,
    description,
    metadataBase: new URL(siteUrl),
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: `${siteUrl}${canonical}`,
      siteName: 'BookLingua',
      type: 'website',
      images: ['/og-image.png'],
    },
    twitter: { card: 'summary_large_image', title, description, images: ['/og-image.png'] },
  }
}

const Logo = () => (
  <Image src="/logo.png" alt="BookLingua" width={300} height={300} className="object-contain" />
)

const filters: Array<{ label: string; href: string; category?: PostCategory }> = [
  { label: 'All', href: '/blog' },
  { label: 'Translation Advice', href: '/blog?category=translation-advice', category: 'translation-advice' },
  { label: 'Using BookLingua', href: '/blog?category=using-booklingua', category: 'using-booklingua' },
]

export default function BlogPage({ searchParams }: BlogPageProps) {
  const category = selectedCategory(searchParams)
  const allPosts = getAllPosts()
  const posts = category ? allPosts.filter((post) => post.category === category) : allPosts
  const pageTitle = category ? categoryContent[category].title : 'Book Translation Resources'
  const pageDescription = category
    ? categoryContent[category].description
    : 'Practical advice on translating and publishing your book, plus step-by-step guidance to help you get the most from BookLingua.'

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: pageTitle,
    url: `${siteUrl}/blog${category ? `?category=${category}` : ''}`,
    description: pageDescription,
    isPartOf: { '@type': 'WebSite', name: 'BookLingua', url: siteUrl },
    hasPart: posts.map((post) => ({
      '@type': 'BlogPosting',
      headline: post.title,
      url: `${siteUrl}/blog/${post.slug}`,
      datePublished: post.date,
      author: { '@type': 'Organization', name: post.author },
      description: post.description,
      keywords: post.keywords.join(', '),
    })),
  }

  return (
    <div className="min-h-screen bg-cream">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400&display=swap');`}</style>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <nav className="relative z-10 flex items-center justify-between px-4 sm:px-8 py-6 max-w-7xl mx-auto">
        <Link href="/" className="flex items-center gap-3"><Logo /></Link>
        <div className="flex items-center gap-3 sm:gap-6">
          <ResourcesMenu />
          <Link href="/examples" className="text-gray-600 hover:text-brand-dark font-medium transition-colors hidden sm:block">Examples</Link>
          <Link href="/publishers" className="text-gray-600 hover:text-brand-dark font-medium transition-colors hidden sm:block">Publishers</Link>
          <Link href="/" className="px-4 py-2 sm:px-6 sm:py-2.5 bg-brand text-white rounded-full text-sm sm:text-base font-semibold shadow-lg hover:shadow-xl transition-all whitespace-nowrap">Start Translating</Link>
        </div>
      </nav>

      <header className="relative overflow-hidden">
        <div className="absolute inset-0 opacity-30">
          <div className="absolute top-20 left-10 w-72 h-72 bg-amber-200 rounded-full blur-3xl" />
          <div className="absolute top-40 right-20 w-96 h-96 bg-brand-light rounded-full blur-3xl" />
        </div>
        <div className="relative z-10 max-w-4xl mx-auto px-8 pt-12 pb-12 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/80 rounded-full text-sm font-medium text-brand-dark mb-8">
            <span className="w-2 h-2 bg-brand rounded-full" /> Advice, guides and how-tos
          </div>
          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 leading-tight mb-6" style={serifFont}>{pageTitle}</h1>
          <p className="text-xl text-gray-600 leading-relaxed max-w-3xl mx-auto">{pageDescription}</p>
        </div>
      </header>

      <section className="max-w-5xl mx-auto px-8 pt-6 pb-12">
        <nav aria-label="Filter resources" className="flex flex-wrap justify-center gap-3 mb-12">
          {filters.map((filter) => {
            const active = filter.category === category || (!filter.category && !category)
            return (
              <Link
                key={filter.label}
                href={filter.href}
                aria-current={active ? 'page' : undefined}
                className={`rounded-full px-5 py-2.5 text-sm font-semibold transition-colors ${active ? 'bg-brand text-white shadow-md' : 'bg-white text-gray-700 border border-[#EBE6F4] hover:border-brand hover:text-brand-dark'}`}
              >
                {filter.label}
              </Link>
            )
          })}
        </nav>

        <div className="grid gap-8">
          {posts.map((post) => (
            <article key={post.slug} className="group bg-white rounded-3xl p-8 border border-[#EBE6F4] shadow-sm hover:shadow-xl transition-all">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
                <Link href={`/blog?category=${post.category}`} className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide bg-brand-light text-brand-dark w-fit hover:bg-brand hover:text-white transition-colors">
                  {postCategoryLabels[post.category]}
                </Link>
                <div className="flex items-center gap-3 text-sm text-gray-500">
                  <time dateTime={post.date}>{new Date(post.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</time>
                  <span>·</span><span>{post.readingTime}</span>
                </div>
              </div>
              <Link href={`/blog/${post.slug}`}>
                <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3 group-hover:text-brand-dark transition-colors" style={serifFont}>{post.title}</h2>
              </Link>
              <p className="text-gray-600 leading-relaxed mb-6">{post.description}</p>
              {post.tags.length > 0 && <div className="flex flex-wrap gap-2 mb-6">{post.tags.map((tag) => <span key={tag} className="px-3 py-1 bg-cream text-gray-700 rounded-full text-xs font-medium">{tag}</span>)}</div>}
              <Link href={`/blog/${post.slug}`} className="inline-flex items-center gap-2 text-brand-dark font-semibold hover:text-brand transition-colors">Read resource <span>→</span></Link>
            </article>
          ))}
        </div>
      </section>

      <section className="py-20 bg-brand relative overflow-hidden">
        <div className="relative z-10 max-w-3xl mx-auto px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4" style={serifFont}>Ready to translate your book?</h2>
          <p className="text-lg text-white/80 mb-8 max-w-xl mx-auto">Get a professional AI translation with editorial review — from $99 per language.</p>
          <Link href="/" className="inline-flex items-center gap-2 px-8 py-4 bg-white text-brand-dark rounded-2xl font-bold text-lg shadow-xl hover:shadow-2xl hover:-translate-y-0.5 transition-all">Start Translating <span>→</span></Link>
        </div>
      </section>
      <SiteFooter />
    </div>
  )
}
