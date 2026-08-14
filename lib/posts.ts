import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'

const postsDirectory = path.join(process.cwd(), 'content', 'blog')

export interface BlogPost {
  slug: string
  title: string
  description: string
  date: string
  author: string
  category: PostCategory
  tags: string[]
  keywords: string[]
  image?: string
  youtube?: string
  content: string
  readingTime: string
}

export type PostCategory = 'translation-advice' | 'using-booklingua'

export const postCategoryLabels: Record<PostCategory, string> = {
  'translation-advice': 'Translation Advice',
  'using-booklingua': 'Using BookLingua',
}

export function isPostCategory(value: string | undefined): value is PostCategory {
  return value === 'translation-advice' || value === 'using-booklingua'
}

export function getAllPosts(): BlogPost[] {
  if (!fs.existsSync(postsDirectory)) {
    return []
  }

  const fileNames = fs.readdirSync(postsDirectory).filter((name) => name.endsWith('.mdx'))

  const posts = fileNames.map((fileName) => {
    const slug = fileName.replace(/\.mdx$/, '')
    const fullPath = path.join(postsDirectory, fileName)
    const fileContents = fs.readFileSync(fullPath, 'utf8')
    const { data, content } = matter(fileContents)

    return {
      slug,
      title: data.title || slug,
      description: data.description || '',
      date: data.date ? new Date(data.date).toISOString() : new Date().toISOString(),
      author: data.author || 'BookLingua',
      category: isPostCategory(data.category) ? data.category : 'translation-advice',
      tags: Array.isArray(data.tags) ? data.tags : [],
      keywords: Array.isArray(data.keywords) ? data.keywords : [],
      image: data.image,
      youtube: data.youtube,
      content,
      readingTime: estimateReadingTime(content),
    } as BlogPost
  })

  return posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}

export function getPostBySlug(slug: string): BlogPost | null {
  const posts = getAllPosts()
  return posts.find((post) => post.slug === slug) || null
}

export function getAllSlugs(): string[] {
  return getAllPosts().map((post) => post.slug)
}

function estimateReadingTime(content: string): string {
  const wordsPerMinute = 200
  const wordCount = content.split(/\s+/).filter(Boolean).length
  const minutes = Math.max(1, Math.ceil(wordCount / wordsPerMinute))
  return `${minutes} min read`
}
