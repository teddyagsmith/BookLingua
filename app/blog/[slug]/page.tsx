import { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import { MDXRemote } from 'next-mdx-remote/rsc'
import { getPostBySlug, getAllSlugs } from '@/lib/posts'
import { mdxComponents } from '@/components/mdx-components'
import NewsletterPopup from '@/components/NewsletterPopup'

const siteUrl = 'https://booklingua.io'

interface BlogPostPageProps {
  params: { slug: string }
}

export async function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }))
}

export async function generateMetadata({ params }: BlogPostPageProps): Promise<Metadata> {
  const post = getPostBySlug(params.slug)
  if (!post) return {}

  const url = `${siteUrl}/blog/${post.slug}`

  return {
    title: `${post.title} | BookLingua`,
    description: post.description,
    keywords: post.keywords,
    metadataBase: new URL(siteUrl),
    alternates: {
      canonical: `/blog/${post.slug}`,
    },
    openGraph: {
      title: post.title,
      description: post.description,
      url,
      siteName: 'BookLingua',
      type: 'article',
      publishedTime: post.date,
      authors: [post.author],
      images: post.image ? [post.image] : ['/og-image.png'],
      locale: 'en_GB',
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.description,
      images: post.image ? [post.image] : ['/og-image.png'],
    },
  }
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

export default function BlogPostPage({ params }: BlogPostPageProps) {
  const post = getPostBySlug(params.slug)
  if (!post) {
    notFound()
  }

  const url = `${siteUrl}/blog/${post.slug}`
  const formattedDate = new Date(post.date).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.description,
    url,
    datePublished: post.date,
    dateModified: post.date,
    author: {
      '@type': 'Organization',
      name: post.author,
    },
    publisher: {
      '@type': 'Organization',
      name: 'BookLingua',
      logo: {
        '@type': 'ImageObject',
        url: `${siteUrl}/logo.png`,
      },
    },
    image: post.image ? `${siteUrl}${post.image}` : `${siteUrl}/og-image.png`,
    keywords: post.keywords.join(', '),
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': url,
    },
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

      {/* Breadcrumbs */}
      <nav aria-label="Breadcrumb" className="max-w-3xl mx-auto px-8 pt-4 pb-2">
        <ol className="flex items-center gap-2 text-sm text-gray-500">
          <li>
            <Link href="/" className="hover:text-brand-dark transition-colors">
              Home
            </Link>
          </li>
          <li>→</li>
          <li>
            <Link href="/blog" className="hover:text-brand-dark transition-colors">
              Guides
            </Link>
          </li>
          <li>→</li>
          <li aria-current="page" className="text-gray-700 font-medium truncate">
            {post.title}
          </li>
        </ol>
      </nav>

      {/* Article */}
      <article className="max-w-3xl mx-auto px-8 py-12">
        <header className="mb-10">
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide bg-brand-light text-brand-dark mb-4">
            {post.category}
          </span>
          <h1
            className="text-4xl md:text-5xl font-bold text-gray-900 leading-tight mb-6"
            style={serifFont}
          >
            {post.title}
          </h1>
          <p className="text-xl text-gray-600 leading-relaxed mb-6">{post.description}</p>
          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
            <span className="font-medium text-gray-700">{post.author}</span>
            <span>·</span>
            <time dateTime={post.date}>{formattedDate}</time>
            <span>·</span>
            <span>{post.readingTime}</span>
          </div>
        </header>

        {post.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-10">
            {post.tags.map((tag) => (
              <span
                key={tag}
                className="px-3 py-1 bg-white border border-[#EBE6F4] text-gray-700 rounded-full text-xs font-medium"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        <div className="prose prose-lg max-w-none mx-auto px-4 sm:px-6 lg:px-8 prose-headings:font-serif">
          <MDXRemote source={post.content} components={mdxComponents} />
        </div>

        <NewsletterPopup
          source={`blog-${post.slug}`}
          title="Want more guides like this?"
          description="Get practical translation and book-launch tips from BookLingua. One email when it matters."
        />
      </article>

      {/* CTA */}
      <section className="py-20 bg-brand relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-10 left-20 w-64 h-64 bg-white rounded-full blur-3xl" />
        </div>
        <div className="relative z-10 max-w-3xl mx-auto px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4" style={serifFont}>
            Ready to reach readers in new languages?
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
