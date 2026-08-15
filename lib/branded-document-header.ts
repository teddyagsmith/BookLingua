import { AlignmentType, BorderStyle, ImageRun, Paragraph, TextRun } from 'docx'
import { readFileSync } from 'fs'
import path from 'path'

export const BRANDED_DOCUMENT_LOGO_ASSET='public/logo-doc-safe.png'
export const BRANDED_DOCUMENT_LOGO_INTRINSIC={width:1029,height:369} as const
export const BRANDED_DOCUMENT_LOGO_WIDTH_MM=60
export const BRANDED_DOCUMENT_LOGO_WIDTH_PX=BRANDED_DOCUMENT_LOGO_WIDTH_MM/25.4*96
export const BRANDED_DOCUMENT_LOGO_HEIGHT_PX=BRANDED_DOCUMENT_LOGO_WIDTH_PX*BRANDED_DOCUMENT_LOGO_INTRINSIC.height/BRANDED_DOCUMENT_LOGO_INTRINSIC.width

const logo=readFileSync(path.join(process.cwd(),BRANDED_DOCUMENT_LOGO_ASSET))

export function brandedDocumentHeader():Paragraph[]{
  return [
    new Paragraph({
      alignment:AlignmentType.CENTER,
      children:[new ImageRun({
        data:logo,
        transformation:{width:BRANDED_DOCUMENT_LOGO_WIDTH_PX,height:BRANDED_DOCUMENT_LOGO_HEIGHT_PX},
        altText:{title:'BookLingua',description:'BookLingua logo',name:'BookLingua logo'},
      })],
      spacing:{before:0,after:360},
    }),
    new Paragraph({
      alignment:AlignmentType.CENTER,
      children:[new TextRun({text:' ',font:'Georgia',size:4})],
      border:{bottom:{style:BorderStyle.SINGLE,size:8,color:'6D28D9',space:1}},
      spacing:{before:0,after:260},
      indent:{left:2700,right:2700},
    }),
  ]
}
