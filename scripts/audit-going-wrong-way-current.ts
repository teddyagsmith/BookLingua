import {createClient} from '@supabase/supabase-js'
import {createHash} from 'node:crypto'
import {inspectDeliveredDocx} from '../lib/delivery-contract'
import {epubEmphasisByLocation} from '../lib/semantic-artifacts'
import {parseSemanticEpub} from '../lib/semantic-parser'

const ORDER='a3341608-0fd7-4341-b74f-3f2905d1ce72',LANGUAGE='es-es',BUILD='c9b3e93e-8552-54d5-81c4-1652a8778130'
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}})

async function bytes(type:string){const row=await db.from('artifacts').select('*').eq('order_id',ORDER).eq('language',LANGUAGE).eq('build_id',BUILD).eq('artifact_type',type).single();if(row.error)throw row.error;const blob=await db.storage.from(row.data.storage_bucket).download(row.data.storage_path);if(blob.error||!blob.data)throw blob.error;const data=Buffer.from(await blob.data.arrayBuffer());const sha256=createHash('sha256').update(data).digest('hex');if(sha256!==row.data.sha256)throw new Error(`${type} checksum mismatch`);return{data,row:row.data,sha256}}
function emphasis(buffer:Buffer){let italic=0,bold=0,superscript=0;for(const runs of Array.from(epubEmphasisByLocation(buffer).values()))for(const run of runs){if(run.italic)italic++;if(run.bold)bold++;if(run.superscript)superscript++}return{italic,bold,superscript}}
async function main(){
  const [docx,epub,map,sourceRow]=await Promise.all([bytes('final_docx'),bytes('final_epub'),bytes('chapter_map_csv'),db.from('files').select('file_url,original_content').eq('order_id',ORDER).eq('type','original').single()])
  if(sourceRow.error)throw sourceRow.error;const metadata=JSON.parse(sourceRow.data.original_content||'{}'),sourceBlob=await db.storage.from(metadata.storageBucket||'booklingua-private-sources').download(sourceRow.data.file_url);if(sourceBlob.error||!sourceBlob.data)throw sourceBlob.error;const source=Buffer.from(await sourceBlob.data.arrayBuffer())
  const docxFacts=inspectDeliveredDocx(docx.data),epubDocument=parseSemanticEpub(epub.data,epub.sha256),csv=map.data.toString('utf8').trim().split(/\r?\n/)
  console.log(JSON.stringify({buildId:BUILD,docx:{filename:docx.row.filename,sizeBytes:docx.data.length,sha256:docx.sha256,...docxFacts,text:undefined,corruption:{spacedPunctuation:(docxFacts.text.match(/ [.,;:!?]/g)||[]).length,doubleSpaces:(docxFacts.text.match(/\S {2,}\S/g)||[]).length,asciiApostrophes:(docxFacts.text.match(/[A-Za-zÀ-ÿ]'[A-Za-zÀ-ÿ]/g)||[]).length}},chapterMap:{rows:Math.max(0,csv.length-1),header:csv[0]},epub:{filename:epub.row.filename,sizeBytes:epub.data.length,sha256:epub.sha256,nodes:epubDocument.nodes.length,headings:epubDocument.nodes.filter(node=>node.type==='heading').length,emphasis:emphasis(epub.data)},source:{emphasis:emphasis(source)}},null,2))
}
main().catch(error=>{console.error(error);process.exit(1)})
