import AdmZip from 'adm-zip'
import {createClient} from '@supabase/supabase-js'
const ORDER='6b47fdde-389a-49ad-ab94-fcc2e1ea08cc',LANG='de'
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}})
const text=(xml:string)=>xml.replace(/<w:tab\/?\s*>/g,'\t').replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
async function bytes(buildId:string,type:string){const q=await db.from('artifacts').select('storage_bucket,storage_path,sha256').eq('order_id',ORDER).eq('language',LANG).eq('build_id',buildId).eq('artifact_type',type).single();if(q.error)throw q.error;const b=await db.storage.from(q.data.storage_bucket).download(q.data.storage_path);if(b.error||!b.data)throw b.error;return{buffer:Buffer.from(await b.data.arrayBuffer()),sha256:q.data.sha256}}
async function main(){
 const current=await db.from('order_language_builds').select('id,state').eq('order_id',ORDER).eq('language',LANG).eq('is_current',true).single();if(current.error||current.data.state!=='passed')throw current.error||new Error('German build not passed')
 const buildId=current.data.id,doc=await bytes(buildId,'final_docx'),zip:any=new (AdmZip as any)(doc.buffer),xml=zip.getEntry('word/document.xml')!.getData().toString('utf8'),plain=text(xml)
 const forbidden=plain.match(/\b(?:du|dich|dir|dein(?:e|em|en|er|es)?)\b/gi)||[]
 const headings=Array.from(xml.matchAll(/<w:pStyle w:val="(Title|Heading1|Heading2|Heading3)"/g) as IterableIterator<RegExpMatchArray>).reduce((a:any,m)=>(a[m[1]]=(a[m[1]]||0)+1,a),{})
 const epub=await bytes(buildId,'final_epub'),ezip:any=new (AdmZip as any)(epub.buffer),xhtml:string[]=ezip.getEntries().filter((e:any)=>/\.xhtml?$/i.test(e.entryName)).map((e:any)=>e.getData().toString('utf8'))
 const report=await db.from('validation_reports').select('metrics').eq('order_id',ORDER).eq('language',LANG).eq('build_id',buildId).eq('stage','editorial_pass').single()
 console.log(JSON.stringify({buildId,docxSha256:doc.sha256,forbiddenInformal:forbidden.length,chapterOneFormal:/Ihres Körpers/.test(plain)&&!/deines Körpers/i.test(plain),paragraphs:(xml.match(/<w:p(?:\s|>)/g)||[]).length,headings,italic:(xml.match(/<w:i(?:\s[^>]*)?\/>/g)||[]).length,bold:(xml.match(/<w:b(?:\s[^>]*)?\/>/g)||[]).length,superscript:(xml.match(/<w:vertAlign w:val="superscript"/g)||[]).length,badFootnoteSpacing:/ ¹ \./.test(plain),splitPower:/powe r/i.test(plain),epubSha256:epub.sha256,xhtmlFiles:xhtml.length,wrongXhtmlLanguage:xhtml.filter(x=>!/<body\b[^>]*\blang=["']de["']/i.test(x)||!/<html\b[^>]*(?:\blang|\bxml:lang)=["']de["']/i.test(x)).length,editorial:report.data?.metrics},null,2))
}
main().catch(e=>{console.error(e);process.exit(1)})
