import { MetadataRoute } from 'next'
import { getAllSlugs } from '@/lib/posts'

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = 'https://booklingua.io'
  const slugs = getAllSlugs()

  const posts: MetadataRoute.Sitemap = slugs.map((slug) => ({
    url: `${siteUrl}/blog/${slug}`,
    lastModified: new Date(),
    changeFrequency: 'monthly',
    priority: 0.7,
  }))

  return [
    { url: siteUrl, lastModified: new Date(), changeFrequency: 'monthly', priority: 1 },
    { url: `${siteUrl}/examples`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.8 },
    { url: `${siteUrl}/publishers`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.8 },
    { url: `${siteUrl}/blog`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.9 },
    { url: `${siteUrl}/feed.xml`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.5 },
    ...posts,
  ]
}
