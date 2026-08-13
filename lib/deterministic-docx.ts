import JSZip from 'jszip'

const CANONICAL_ZIP_DATE = new Date('2000-01-01T00:00:00.000Z')

/** Normalize volatile OOXML metadata so immutable artifact retries are byte-stable. */
export async function deterministicDocx(buffer: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buffer)
  const core = zip.file('docProps/core.xml')
  if (core) {
    const xml = (await core.async('string'))
      .replace(/<dcterms:created[^>]*>[\s\S]*?<\/dcterms:created>/g, '<dcterms:created xsi:type="dcterms:W3CDTF">2000-01-01T00:00:00Z</dcterms:created>')
      .replace(/<dcterms:modified[^>]*>[\s\S]*?<\/dcterms:modified>/g, '<dcterms:modified xsi:type="dcterms:W3CDTF">2000-01-01T00:00:00Z</dcterms:modified>')
    zip.file('docProps/core.xml', xml, { date: CANONICAL_ZIP_DATE })
  }
  for (const entry of Object.values(zip.files)) entry.date = CANONICAL_ZIP_DATE
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 }, platform: 'UNIX' })
}
