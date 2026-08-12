import AdmZip from 'adm-zip'

export function assertSupportedSourcePackage(format: string, bytes: Buffer): void {
  if (format === 'txt') return
  let names: Set<string>
  try {
    names = new Set(new AdmZip(bytes).getEntries().map(entry => entry.entryName))
  } catch {
    throw new Error('The uploaded source is not a readable ZIP-based document')
  }
  if (format === 'docx') {
    if (!names.has('[Content_Types].xml') || !names.has('_rels/.rels') || !names.has('word/document.xml')) {
      throw new Error('The uploaded DOCX is missing required package parts')
    }
    return
  }
  if (format === 'epub') {
    if (!names.has('META-INF/container.xml')) throw new Error('The uploaded EPUB is missing META-INF/container.xml')
    if (!Array.from(names).some(name => name.toLowerCase().endsWith('.opf'))) {
      throw new Error('The uploaded EPUB is missing its package document')
    }
  }
}
