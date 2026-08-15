import JSZip from 'jszip'
import { createHash } from 'crypto'

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
  // docx assigns random relationship ids to external hyperlinks. Rewrite them
  // from their target so otherwise identical customer artifacts remain byte-stable.
  const replacements=new Map<string,string>()
  for(const [name,entry] of Object.entries(zip.files)){
    if(!name.endsWith('.rels')||entry.dir)continue
    const xml=await entry.async('string')
    const pattern=/<Relationship Id="([^"]+)"[^>]*Type="[^"]*\/(?:hyperlink|image)"[^>]*Target="([^"]+)"/g
    let match:RegExpExecArray|null
    while((match=pattern.exec(xml))!==null)replacements.set(match[1],`rIdAsset${createHash('sha256').update(match[2]).digest('hex').slice(0,20)}`)
  }
  if(replacements.size)for(const [name,entry] of Object.entries(zip.files)){
    if(!name.endsWith('.xml')&&!name.endsWith('.rels')||entry.dir)continue
    let xml=await entry.async('string')
    replacements.forEach((to,from)=>{xml=xml.split(from).join(to)})
    zip.file(name,xml,{date:CANONICAL_ZIP_DATE})
  }
  // docx also assigns random filenames to embedded media. Canonicalize each
  // filename from its bytes and update every relationship target.
  for(const [name,entry] of Object.entries({...zip.files})){
    if(entry.dir||!name.startsWith('word/media/'))continue
    const bytes=await entry.async('nodebuffer')
    const extension=name.includes('.')?name.slice(name.lastIndexOf('.')):''
    const canonical=`word/media/image-${createHash('sha256').update(bytes).digest('hex').slice(0,20)}${extension}`
    if(canonical===name)continue
    zip.file(canonical,bytes,{date:CANONICAL_ZIP_DATE})
    zip.remove(name)
    const oldBase=name.slice('word/media/'.length),newBase=canonical.slice('word/media/'.length)
    for(const [relName,relEntry] of Object.entries(zip.files)){
      if(relEntry.dir||!relName.endsWith('.rels'))continue
      const xml=(await relEntry.async('string')).split(oldBase).join(newBase)
      zip.file(relName,xml,{date:CANONICAL_ZIP_DATE})
    }
  }
  // Re-key image relationships after canonical media filenames are in place.
  const imageIds=new Map<string,string>()
  for(const [name,entry] of Object.entries(zip.files)){
    if(entry.dir||!name.endsWith('.rels'))continue
    const xml=await entry.async('string')
    const pattern=/<Relationship Id="([^"]+)"[^>]*Type="[^"]*\/image"[^>]*Target="([^"]+)"/g
    let match:RegExpExecArray|null
    while((match=pattern.exec(xml))!==null)imageIds.set(match[1],`rIdImage${createHash('sha256').update(match[2]).digest('hex').slice(0,20)}`)
  }
  if(imageIds.size)for(const [name,entry] of Object.entries(zip.files)){
    if(entry.dir||(!name.endsWith('.xml')&&!name.endsWith('.rels')))continue
    let xml=await entry.async('string')
    imageIds.forEach((to,from)=>{xml=xml.split(from).join(to)})
    zip.file(name,xml,{date:CANONICAL_ZIP_DATE})
  }
  for (const entry of Object.values(zip.files)) entry.date = CANONICAL_ZIP_DATE
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 }, platform: 'UNIX' })
}
