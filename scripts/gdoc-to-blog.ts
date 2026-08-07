/**
 * BookLingua — Google Doc to Blog MDX Converter
 *
 * Watches a Google Drive folder called "Ready to Publish",
 * converts any Docs found there to .mdx files for the Next.js blog,
 * and moves them to a "Published" folder when done.
 *
 * Preserves:
 *   - headings, paragraphs, line breaks
 *   - bold, italic, links
 *   - bullet lists
 *   - blockquote indentation
 *   - inline images (exported to public/images/blog/<slug>/)
 *   - YouTube links → <YouTube id="..." /> component
 *
 * Usage:
 *   npx ts-node -P tsconfig.scripts.json scripts/gdoc-to-blog.ts
 *   npx ts-node -P tsconfig.scripts.json scripts/gdoc-to-blog.ts --dry-run
 *   npx ts-node -P tsconfig.scripts.json scripts/gdoc-to-blog.ts --slug my-custom-slug
 */

import { google } from 'googleapis'
import { docs_v1, drive_v3 } from 'googleapis'
import * as fs from 'fs'
import * as path from 'path'
import fetch from 'node-fetch'

// ── Config ────────────────────────────────────────────────────────────────────

const PARENT_FOLDER_NAME  = 'BookLingua'
const READY_FOLDER_NAME   = 'Ready to Publish'
const DONE_FOLDER_NAME    = 'Published'
const OUT_DIR             = 'content/blog'        // where .mdx files go
const PUBLIC_IMAGES_DIR   = 'public/images/blog'  // where exported images go
const DEFAULT_AUTHOR      = 'BookLingua'

// ── Auth ──────────────────────────────────────────────────────────────────────

function getGillyAuth(): any {
  const tokenPath = path.resolve('/Users/gilbert/.openclaw/workspace/gilly_token.json')
  if (!fs.existsSync(tokenPath)) {
    console.log(`[gdoc-to-blog] No gilly_token.json found at ${tokenPath}; falling back to GOOGLE_APPLICATION_CREDENTIALS / gcloud default credentials.`)
    return null
  }

  const token = JSON.parse(fs.readFileSync(tokenPath, 'utf-8'))
  if (!token.refresh_token) {
    console.log('[gdoc-to-blog] gilly_token.json has no refresh_token; falling back.')
    return null
  }

  const oauth2Client = new google.auth.OAuth2(
    token.client_id,
    token.client_secret
  )

  oauth2Client.setCredentials({
    refresh_token: token.refresh_token,
  })

  console.log('[gdoc-to-blog] Authenticating as gilly@myromancereads.com')
  return oauth2Client
}

async function getClients() {
  let auth: any = getGillyAuth()

  if (!auth) {
    auth = new google.auth.GoogleAuth({
      scopes: [
        'https://www.googleapis.com/auth/documents.readonly',
        'https://www.googleapis.com/auth/drive',
      ],
    })
  }

  const drive = google.drive({ version: 'v3', auth })
  const docs  = google.docs({ version: 'v1', auth })
  return { drive, docs, auth }
}

// ── Drive helpers ─────────────────────────────────────────────────────────────

async function findFolderByName(
  drive: drive_v3.Drive,
  name: string,
  parentId?: string
): Promise<string | null> {
  let q = `name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
  if (parentId) {
    q += ` and '${parentId}' in parents`
  }
  const res = await drive.files.list({
    q,
    fields: 'files(id, name)',
  })
  return res.data.files?.[0]?.id ?? null
}

async function getOrCreateFolder(
  drive: drive_v3.Drive,
  name: string,
  parentId?: string
): Promise<string> {
  const existing = await findFolderByName(drive, name, parentId)
  if (existing) return existing

  const res = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: parentId ? [parentId] : undefined,
    },
    fields: 'id',
  })
  console.log(`Created folder: "${name}"`)
  return res.data.id!
}

async function getDocsInFolder(
  drive: drive_v3.Drive,
  folderId: string
): Promise<Array<{ id: string; name: string; mimeType: string }>> {
  const res = await drive.files.list({
    q: `'${folderId}' in parents and (mimeType = 'application/vnd.google-apps.document' or mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') and trashed = false`,
    fields: 'files(id, name, mimeType)',
    orderBy: 'createdTime asc',
  })
  return (res.data.files ?? []).map(f => ({
    id: f.id!,
    name: f.name!,
    mimeType: f.mimeType!,
  }))
}

async function convertWordToGoogleDoc(
  drive: drive_v3.Drive,
  fileId: string,
  name: string
): Promise<string> {
  const res = await drive.files.copy({
    fileId,
    requestBody: {
      name: `${name} (converted)`,
      mimeType: 'application/vnd.google-apps.document',
    },
  })
  console.log(`  Converted Word doc to Google Doc: ${res.data.id}`)
  return res.data.id!
}

async function moveFile(
  drive: drive_v3.Drive,
  fileId: string,
  fromFolderId: string,
  toFolderId: string
): Promise<void> {
  await drive.files.update({
    fileId,
    addParents: toFolderId,
    removeParents: fromFolderId,
    fields: 'id, parents',
  })
}

// ── Slug helpers ──────────────────────────────────────────────────────────────

function titleToSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

// ── YouTube helpers ──────────────────────────────────────────────────────────

function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/watch\?.*[?&]v=([a-zA-Z0-9_-]{11})/,
  ]
  for (const p of patterns) {
    const m = url.match(p)
    if (m) return m[1]
  }
  return null
}

function convertYouTubeLinks(md: string): string {
  // Convert standalone YouTube URLs (paragraphs that contain only a YouTube link)
  return md.replace(/^(\s*)\[([^\]]*)\]\((https?:\/\/[^)]+)\)(\s*)$/gm, (match, before, text, url, after) => {
    const id = extractYouTubeId(url)
    if (!id) return match
    return `${before}<YouTube id="${id}" />${after}`
  })
}

// ── Image helpers ────────────────────────────────────────────────────────────

async function downloadImage(url: string, auth: any): Promise<Buffer> {
  // For contentUri signed URLs, the access token is baked into the URL.
  // If it ever needs an Authorization header, we add it here.
  const headers: any = {}
  if (auth?.credentials?.access_token) {
    const token = await auth.getAccessToken()
    headers.Authorization = `Bearer ${token}`
  }
  const res = await fetch(url, { headers })
  if (!res.ok) throw new Error(`Image download failed: ${res.status} ${res.statusText}`)
  return Buffer.from(await res.arrayBuffer())
}

function imageExtFromMime(mime?: string): string {
  if (!mime) return 'png'
  if (mime.includes('png')) return 'png'
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg'
  if (mime.includes('gif')) return 'gif'
  if (mime.includes('svg')) return 'svg'
  if (mime.includes('webp')) return 'webp'
  return 'png'
}

async function exportImages(
  doc: docs_v1.Schema$Document,
  slug: string,
  dryRun: boolean,
  auth: any
): Promise<Map<string, string>> {
  const inlineObjects = doc.inlineObjects ?? {}
  const imageMap = new Map<string, string>() // inlineObjectId -> public image path

  if (Object.keys(inlineObjects).length === 0) return imageMap

  const outDir = path.resolve(PUBLIC_IMAGES_DIR, slug)
  if (!dryRun) {
    fs.mkdirSync(outDir, { recursive: true })
  }

  let index = 0
  for (const [objectId, obj] of Object.entries(inlineObjects)) {
    const props = obj.inlineObjectProperties?.embeddedObject
    const imageProps = props?.imageProperties
    if (!imageProps) continue

    const contentUri = imageProps.contentUri
    if (!contentUri) {
      console.warn(`  [Image] No contentUri for ${objectId} — skipping`)
      continue
    }

    const mimeType = imageProps.contentUri ? undefined : 'image/png'
    const ext = imageExtFromMime(mimeType)
    const filename = `image-${String(index).padStart(2, '0')}.${ext}`
    const publicPath = `/images/blog/${slug}/${filename}`
    const outPath = path.join(outDir, filename)

    if (!dryRun) {
      try {
        const buf = await downloadImage(contentUri, auth)
        fs.writeFileSync(outPath, buf)
        console.log(`  [Image] Exported ${publicPath}`)
      } catch (err) {
        console.warn(`  [Image] Failed to export ${objectId}:`, err)
        continue
      }
    } else {
      console.log(`  [Image] Would export ${publicPath}`)
    }

    imageMap.set(objectId, publicPath)
    index++
  }

  return imageMap
}

// ── Doc content converter ─────────────────────────────────────────────────────

function runsToMarkdown(
  elements: docs_v1.Schema$ParagraphElement[],
  imageMap: Map<string, string>,
  altText: string = 'Image'
): string {
  return elements.map(el => {
    // Inline image
    if (el.inlineObjectElement) {
      const objectId = el.inlineObjectElement.inlineObjectId
      const src = objectId ? imageMap.get(objectId) : null
      if (src) return `![${altText}](${src})`
      return ''
    }

    const content = el.textRun?.content ?? ''
    const style   = el.textRun?.textStyle ?? {}
    const link    = style.link?.url
    let out = content.replace(/\n$/, '')
    if (!out) return ''
    if (style.bold && style.italic) out = `***${out}***`
    else if (style.bold)            out = `**${out}**`
    else if (style.italic)          out = `*${out}*`
    if (link)                       out = `[${out}](${link})`
    return out
  }).join('')
}

function listItemToMarkdown(para: docs_v1.Schema$Paragraph, imageMap: Map<string, string>): string {
  const level  = para.bullet?.nestingLevel ?? 0
  const indent = '  '.repeat(level)
  const text   = runsToMarkdown(para.elements ?? [], imageMap)
  return `${indent}- ${text}`
}

function paragraphToMarkdown(para: docs_v1.Schema$Paragraph, imageMap: Map<string, string>): string | null {
  const style = para.paragraphStyle?.namedStyleType ?? 'NORMAL_TEXT'
  const text  = runsToMarkdown(para.elements ?? [], imageMap)

  if (!text.trim()) return null

  switch (style) {
    case 'TITLE':     return null
    case 'HEADING_1': return `## ${text}`
    case 'HEADING_2': return `### ${text}`
    case 'HEADING_3': return `#### ${text}`
    case 'HEADING_4': return `##### ${text}`
    default:          return text
  }
}

// ── Main converter ────────────────────────────────────────────────────────────

async function convertDocToMdx(
  docs: any,
  drive: any,
  auth: any,
  docId: string,
  slug: string,
  dryRun: boolean
): Promise<string> {
  const res  = await docs.documents.get({ documentId: docId })
  const doc = res.data
  const body = doc.body?.content ?? []

  // Export images first so we can reference them in the MDX
  const imageMap = await exportImages(doc, slug, dryRun, auth)

  // Extract the first TITLE-style paragraph as the article title
  let articleTitle = doc.title ?? slug
  for (const el of body) {
    if (!el.paragraph) continue
    const style = el.paragraph.paragraphStyle?.namedStyleType
    if (style === 'TITLE' || style === 'HEADING_1') {
      const t = runsToMarkdown(el.paragraph.elements ?? [], imageMap)
      if (t.trim()) {
        articleTitle = t
        break
      }
    }
  }

  const lines: string[] = []
  let inBlockquote = false

  for (const el of body) {
    if (!el.paragraph) continue
    const para = el.paragraph

    // List items
    if (para.bullet) {
      if (inBlockquote) { inBlockquote = false; lines.push('') }
      lines.push(listItemToMarkdown(para, imageMap))
      continue
    }

    const style = para.paragraphStyle?.namedStyleType ?? 'NORMAL_TEXT'
    const raw   = runsToMarkdown(para.elements ?? [], imageMap, articleTitle)

    // Empty paragraph — close blockquote if open, add blank line
    if (!raw.trim()) {
      if (inBlockquote) inBlockquote = false
      lines.push('')
      continue
    }

    // Heading
    if (style.startsWith('HEADING_') || style === 'TITLE') {
      if (inBlockquote) { inBlockquote = false; lines.push('') }
      const md = paragraphToMarkdown(para, imageMap)
      if (md) lines.push(md, '')
      continue
    }

    // Blockquote paragraphs (indented in Google Docs)
    const indentStart = para.paragraphStyle?.indentStart?.magnitude ?? 0
    if (indentStart > 0) {
      inBlockquote = true
      lines.push(`> ${raw}`)
      continue
    }

    // Close blockquote if we were in one and this is a normal para
    if (inBlockquote) {
      inBlockquote = false
      lines.push('')
    }

    lines.push(raw, '')
  }

  // Build frontmatter
  const date = new Date().toISOString().split('T')[0]
  const frontmatter = [
    '---',
    `title: "${articleTitle.replace(/"/g, '\\"')}"`,
    `description: ""`,
    `date: "${date}"`,
    `author: "${DEFAULT_AUTHOR}"`,
    `slug: "${slug}"`,
    '---',
    '',
  ].join('\n')

  let mdxBody = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()

  // Convert standalone YouTube links to YouTube component
  mdxBody = convertYouTubeLinks(mdxBody)

  const mdx = frontmatter + '\n\n' + mdxBody + '\n'

  if (dryRun) {
    console.log('\n── PREVIEW ──────────────────────────────────────\n')
    console.log(mdx.slice(0, 2500))
    if (mdx.length > 2500) console.log(`\n... (${mdx.length - 2500} more chars)`)
  } else {
    fs.mkdirSync(OUT_DIR, { recursive: true })
    const outPath = path.join(OUT_DIR, `${slug}.mdx`)
    fs.writeFileSync(outPath, mdx, 'utf-8')
    console.log(`Written: ${outPath}`)
  }

  return mdx
}

// ── Entry point ───────────────────────────────────────────────────────────────

async function main() {
  const args    = process.argv.slice(2)
  const dryRun  = args.includes('--dry-run')
  const forceSlug = (() => { const i = args.indexOf('--slug'); return i !== -1 ? args[i+1] : null })()

  const { drive, docs, auth } = await getClients()

  // Find or create the parent folder, then the working folders inside it
  const parentFolderId = await getOrCreateFolder(drive, PARENT_FOLDER_NAME)
  const readyFolderId   = await getOrCreateFolder(drive, READY_FOLDER_NAME, parentFolderId)
  const publishedFolderId = await getOrCreateFolder(drive, DONE_FOLDER_NAME, parentFolderId)

  // Get all docs in Ready to Publish
  const pending = await getDocsInFolder(drive, readyFolderId)

  if (pending.length === 0) {
    console.log(`No documents found in "${READY_FOLDER_NAME}". Move a Google Doc into that folder and try again.`)
    return
  }

  console.log(`Found ${pending.length} document(s) in "${READY_FOLDER_NAME}":`)
  pending.forEach(f => console.log(`  - ${f.name} (${f.id})`))
  console.log()

  for (const file of pending) {
    let docId = file.id
    let docName = file.name

    // Convert Word docs to Google Docs first
    if (file.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      console.log(`Word doc detected: "${file.name}" — converting to Google Doc`)
      docId = await convertWordToGoogleDoc(drive, file.id, file.name)
      docName = `${file.name} (converted)`
    }

    const slug = forceSlug ?? titleToSlug(docName.replace(' (converted)', '').replace(/\.docx$/i, ''))
    console.log(`Processing: "${docName}" → slug: "${slug}"`)

    try {
      await convertDocToMdx(docs, drive, auth, docId, slug, dryRun)

      if (!dryRun) {
        await moveFile(drive, docId, readyFolderId, publishedFolderId)
        console.log(`Moved converted doc to "${DONE_FOLDER_NAME}" folder`)

        // Also move the original Word doc to Published
        if (file.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
          await moveFile(drive, file.id, readyFolderId, publishedFolderId)
          console.log(`Moved original Word doc to "${DONE_FOLDER_NAME}" folder`)
        }
      }
    } catch (err) {
      console.error(`Failed to process "${docName}":`, err)
    }

    console.log()
  }

  if (!dryRun) {
    console.log('Done. Commit the new .mdx files and images, then deploy.')
  }
}

main().catch(console.error)
