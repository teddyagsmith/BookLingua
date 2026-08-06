import { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { getAllPosts } from '@/lib/posts'

const siteUrl = 'https://booklingua.io'

export const metadata: Metadata = {
  title: 'Book Translation Guides | BookLingua',
  description:
    'Practical guides and articles on AI book translation, self-publishing in foreign markets, and launching your book globally.',
  metadataBase: new URL(siteUrl),
  alternates: {
    canonical: '/blog',
  },
  openGraph: {
    title: 'Book Translation Guides | BookLingua',
    description:
      'Practical guides and articles on AI book translation, self-publishing in foreign markets, and launching your book globally.',
    url: `${siteUrl}/blog`,
    siteName: 'BookLingua',
    type: 'website',
    images: ['/og-image.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Book Translation Guides | BookLingua',
    description:
      'Practical guides and articles on AI book translation, self-publishing in foreign markets, and launching your book globally.',
    images: ['/og-image.png'],
  },
}

const serifFont = { fontFamily: "'EB Garamond', Georgia, serif" }

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

export default function BlogPage() {
  const posts = getAllPosts()

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Book Translation Guides',
    url: `${siteUrl}/blog`,
    description:
      'Practical guides and articles on AI book translation, self-publishing in foreign markets, and launching your book globally.',
    isPartOf: {
      '@type': 'WebSite',
      name: 'BookLingua',
      url: siteUrl,
    },
    hasPart: posts.map((post) => ({
      '@type': 'BlogPosting',
      headline: post.title,
      url: `${siteUrl}/blog/${post.slug}`,
      datePublished: post.date,
      author: {
        '@type': 'Organization',
        name: post.author,
      },
      description: post.description,
      keywords: post.keywords.join(', '),
    })),
  }

  return (
    <div className="min-h-screen bg-cream">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400&display=swap');`}</style>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-4 sm:px-8 py-6 max-w-7xl mx-auto">
        <Link href="/" className="flex items-center gap-3">
          <Logo size="lg" />
        </Link>
        <div className="flex items-center gap-3 sm:gap-6">
          <Link href="/blog" className="text-gray-600 hover:text-brand-dark font-medium transition-colors hidden sm:block">
            Guides
          </Link>
          <Link href="/examples" className="text-gray-600 hover:text-brand-dark font-medium transition-colors hidden sm:block">
            Examples
          </Link>
          <Link href="/publishers" className="text-gray-600 hover:text-brand-dark font-medium transition-colors hidden sm:block">
            Publishers
          </Link>
          <Link
            href="/"
            className="px-4 py-2 sm:px-6 sm:py-2.5 bg-brand text-white rounded-full text-sm sm:text-base font-semibold shadow-lg hover:shadow-xl transition-all whitespace-nowrap"
          >
            Start Translating
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <header className="relative overflow-hidden">
        <div className="absolute inset-0 opacity-30">
          <div className="absolute top-20 left-10 w-72 h-72 bg-amber-200 rounded-full blur-3xl" />
          <div className="absolute top-40 right-20 w-96 h-96 bg-brand-light rounded-full blur-3xl" />
        </div>

        <div className="relative z-10 max-w-4xl mx-auto px-8 pt-12 pb-16 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/80 rounded-full text-sm font-medium text-brand-dark mb-8">
            <span className="w-2 h-2 bg-brand rounded-full" />
            Guides, articles, and how-tos
          </div>

          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 leading-tight mb-6" style={serifFont}>
            Book Translation
            <span className="block bg-gradient-to-r from-brand to-brand-dark bg-clip-text text-transparent">
              Guides
            </span>
          </h1>

          <p className="text-xl text-gray-600 leading-relaxed max-w-2xl mx-auto">
            Practical advice on translating your book, publishing in foreign markets, and reaching readers around the world.
          </p>
        </div>
      </header>

      {/* Posts */}
      <section className="max-w-5xl mx-auto px-8 py-12">
        {posts.length === 0 ? (
          <div className="text-center py-24">
            <p className="text-gray-500">No guides yet. Check back soon.</p>
          </div>
        ) : (
          <div className="grid gap-8">
            {posts.map((post) => (
              <article
                key={post.slug}
                className="group bg-white rounded-3xl p-8 border border-[#EBE6F4] shadow-sm hover:shadow-xl transition-all"
              >
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide bg-brand-light text-brand-dark w-fit">
                    {post.category}
                  </span>
                  <div className="flex items-center gap-3 text-sm text-gray-500">
                    <time dateTime={post.date}>
                      {new Date(post.date).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}
                    </time>
                    <span>·</span>
                    <span>{post.readingTime}</span>
                  </div>
                </div>

                <Link href={`/blog/${post.slug}`}>
                  <h2
                    className="text-2xl md:text-3xl font-bold text-gray-900 mb-3 group-hover:text-brand-dark transition-colors"
                    style={serifFont}
                  >
                    {post.title}
                  </h2>
                </Link>

                <p className="text-gray-600 leading-relaxed mb-6">{post.description}</p>

                {post.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-6">
                    {post.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-3 py-1 bg-cream text-gray-700 rounded-full text-xs font-medium"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                <Link
                  href={`/blog/${post.slug}`}
                  className="inline-flex items-center gap-2 text-brand-dark font-semibold hover:text-brand transition-colors"
                >
                  Read guide <span>→</span>
                </Link>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* CTA */}
      <section className="py-20 bg-brand relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-10 left-20 w-64 h-64 bg-white rounded-full blur-3xl" />
        </div>
        <div className="relative z-10 max-w-3xl mx-auto px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4" style={serifFont}>
            Ready to translate your book?
          </h2>
          <p className="text-lg text-white/80 mb-8 max-w-xl mx-auto">
            Get a professional AI translation with editorial review — from $99 per language.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-8 py-4 bg-white text-brand-dark rounded-2xl font-bold text-lg shadow-xl hover:shadow-2xl hover:-translate-y-0.5 transition-all"
          >
            Start Translating <span>→</span>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-12">
        <div className="max-w-7xl mx-auto px-8 text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Logo size="md" />
          </div>
          <p className="mb-2">© 2026 BookLingua. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}
