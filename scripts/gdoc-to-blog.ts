/**
 * BookLingua — Google Doc to Blog MDX Converter
 *
 * Watches a Google Drive folder called "Ready to Publish",
 * converts any Docs found there to .mdx files for the Next.js blog,
 * and moves them to a "Published" folder when done.
 *
 * Usage:
 *   npx ts-node scripts/gdoc-to-blog.ts
 *   npx ts-node scripts/gdoc-to-blog.ts --dry-run   (preview without writing)
 *   npx ts-node scripts/gdoc-to-blog.ts --slug my-custom-slug  (one specific file)
 *
 * Requires: GOOGLE_APPLICATION_CREDENTIALS env var or default credentials.
 */

import { google } from 'googleapis'
import { docs_v1, drive_v3 } from 'googleapis'
import * as fs from 'fs'
import * as path from 'path'

// ── Config ────────────────────────────────────────────────────────────────────

const PARENT_FOLDER_NAME  = 'BookLingua'
const READY_FOLDER_NAME   = 'Ready to Publish'
const DONE_FOLDER_NAME    = 'Published'
const OUT_DIR             = 'content/blog'        // where .mdx files go
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
  return { drive, docs }
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
): Promise<Array<{ id: string; name: string }>> {
  const res = await drive.files.list({
    q: `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.document' and trashed = false`,
    fields: 'files(id, name)',
    orderBy: 'createdTime asc',
  })
  return (res.data.files ?? []).map(f => ({ id: f.id!, name: f.name! }))
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

// ── Doc content converter ─────────────────────────────────────────────────────

function runsToMarkdown(elements: docs_v1.Schema$ParagraphElement[]): string {
  return elements.map(el => {
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

function listItemToMarkdown(para: docs_v1.Schema$Paragraph): string {
  const level  = para.bullet?.nestingLevel ?? 0
  const indent = '  '.repeat(level)
  const text   = runsToMarkdown(para.elements ?? [])
  return `${indent}- ${text}`
}

function paragraphToMarkdown(para: docs_v1.Schema$Paragraph): string | null {
  const style = para.paragraphStyle?.namedStyleType ?? 'NORMAL_TEXT'
  const text  = runsToMarkdown(para.elements ?? [])

  if (!text.trim()) return null

  // HEADING_1 → ## (H2 in article, since page title is H1)
  // HEADING_2 → ### etc.
  switch (style) {
    case 'TITLE':     return null        // handled via frontmatter title
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
  docId: string,
  slug: string,
  dryRun: boolean
): Promise<string> {
  const res  = await docs.documents.get({ documentId: docId })
  const body = res.data.body?.content ?? []
  const docTitle = res.data.title ?? slug

  // Extract the first TITLE-style paragraph as the article title
  let articleTitle = docTitle
  for (const el of body) {
    if (!el.paragraph) continue
    const style = el.paragraph.paragraphStyle?.namedStyleType
    if (style === 'TITLE' || style === 'HEADING_1') {
      articleTitle = runsToMarkdown(el.paragraph.elements ?? [])
      break
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
      lines.push(listItemToMarkdown(para))
      continue
    }

    const style = para.paragraphStyle?.namedStyleType ?? 'NORMAL_TEXT'
    const raw   = runsToMarkdown(para.elements ?? [])

    // Empty paragraph — close blockquote if open, add blank line
    if (!raw.trim()) {
      if (inBlockquote) inBlockquote = false
      lines.push('')
      continue
    }

    // Heading — always close any open blockquote first
    if (style.startsWith('HEADING_') || style === 'TITLE') {
      if (inBlockquote) { inBlockquote = false; lines.push('') }
      const md = paragraphToMarkdown(para)
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

  const mdx = frontmatter + lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'

  if (dryRun) {
    console.log('\n── PREVIEW ──────────────────────────────────────\n')
    console.log(mdx.slice(0, 2000))
    if (mdx.length > 2000) console.log(`\n... (${mdx.length - 2000} more chars)`)
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

  const { drive, docs } = await getClients()

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
    const slug = forceSlug ?? titleToSlug(file.name)
    console.log(`Processing: "${file.name}" → slug: "${slug}"`)

    try {
      await convertDocToMdx(docs, file.id, slug, dryRun)

      if (!dryRun) {
        // Move from Ready to Publish → Published
        await moveFile(drive, file.id, readyFolderId, publishedFolderId)
        console.log(`Moved to "${DONE_FOLDER_NAME}" folder`)
      }
    } catch (err) {
      console.error(`Failed to process "${file.name}":`, err)
    }

    console.log()
  }

  if (!dryRun) {
    console.log('Done. Commit the new .mdx files and deploy.')
  }
}

main().catch(console.error)
