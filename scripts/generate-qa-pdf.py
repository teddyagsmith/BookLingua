#!/usr/bin/env python3
"""
BookLingua QA Report PDF Generator
====================================
Takes a JSON report (from /api/qa-report) via stdin or file arg,
produces a branded PDF at the output path.

Usage (from Next.js API route via child_process):
  python3 scripts/generate-qa-pdf.py input.json output.pdf

The JSON shape is defined by the /api/qa-report route.
"""

import json
import sys
import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor, white, black
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, HRFlowable,
    Table, TableStyle, KeepTogether
)
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
from reportlab.platypus import Flowable

# ── Brand colours ───────────────────────────────────────────────────────────
CREAM       = HexColor('#F7EFE4')
PURPLE      = HexColor('#7B6CA8')
PURPLE_MID  = HexColor('#9B89C4')
PURPLE_LIGHT= HexColor('#E8E2F5')
PURPLE_PALE = HexColor('#F3F0FA')
DARK        = HexColor('#1A1A1A')
MID         = HexColor('#3A3A3A')
GREY        = HexColor('#7A7A7A')
LIGHT_GREY  = HexColor('#E8E0D8')
SCORE_LOW   = HexColor('#C0392B')   # red-ish for scores ≤ 6
SCORE_MID   = HexColor('#7B6CA8')   # purple for 7-8
SCORE_HIGH  = HexColor('#27AE60')   # green for 9-10

PAGE_W, PAGE_H = A4
MARGIN_L = 20 * mm
MARGIN_R = 20 * mm
MARGIN_T = 18 * mm
MARGIN_B = 18 * mm
CONTENT_W = PAGE_W - MARGIN_L - MARGIN_R


# ── Styles ───────────────────────────────────────────────────────────────────
def make_styles():
    return {
        'title': ParagraphStyle('title',
            fontName='Times-Bold', fontSize=26, leading=30,
            textColor=DARK, spaceAfter=2*mm),
        'subtitle': ParagraphStyle('subtitle',
            fontName='Times-Italic', fontSize=13, leading=17,
            textColor=PURPLE, spaceAfter=6*mm),
        'meta': ParagraphStyle('meta',
            fontName='Helvetica', fontSize=9, leading=13,
            textColor=GREY, spaceAfter=0),
        'section_label': ParagraphStyle('section_label',
            fontName='Helvetica-Bold', fontSize=8, leading=10,
            textColor=PURPLE, spaceBefore=7*mm, spaceAfter=2*mm,
            charSpace=1.5),
        'section_title': ParagraphStyle('section_title',
            fontName='Times-Bold', fontSize=15, leading=19,
            textColor=DARK, spaceAfter=3*mm),
        'body': ParagraphStyle('body',
            fontName='Times-Roman', fontSize=10.5, leading=16,
            textColor=MID, spaceAfter=3*mm),
        'body_sm': ParagraphStyle('body_sm',
            fontName='Times-Roman', fontSize=9.5, leading=14,
            textColor=MID, spaceAfter=2*mm),
        'italic': ParagraphStyle('italic',
            fontName='Times-Italic', fontSize=11, leading=16,
            textColor=PURPLE, spaceAfter=3*mm),
        'score_label': ParagraphStyle('score_label',
            fontName='Helvetica-Bold', fontSize=8, leading=11,
            textColor=GREY, charSpace=0.8),
        'score_num': ParagraphStyle('score_num',
            fontName='Times-Bold', fontSize=28, leading=30,
            textColor=PURPLE),
        'score_rationale': ParagraphStyle('score_rationale',
            fontName='Times-Italic', fontSize=9, leading=13,
            textColor=MID),
        'callout': ParagraphStyle('callout',
            fontName='Times-Roman', fontSize=10.5, leading=16,
            textColor=MID, leftIndent=4*mm),
        'comp_title': ParagraphStyle('comp_title',
            fontName='Times-Bold', fontSize=10.5, leading=14,
            textColor=DARK),
        'comp_author': ParagraphStyle('comp_author',
            fontName='Helvetica', fontSize=8.5, leading=12,
            textColor=GREY),
        'comp_note': ParagraphStyle('comp_note',
            fontName='Times-Italic', fontSize=9.5, leading=13,
            textColor=MID),
        'footer': ParagraphStyle('footer',
            fontName='Helvetica', fontSize=8, leading=11,
            textColor=GREY),
        'verdict': ParagraphStyle('verdict',
            fontName='Times-Bold', fontSize=13, leading=18,
            textColor=DARK, spaceAfter=2*mm),
    }


# ── Custom flowables ─────────────────────────────────────────────────────────
class ColorBlock(Flowable):
    """A filled rectangle, used for section backgrounds."""
    def __init__(self, w, h, color, radius=2*mm):
        Flowable.__init__(self)
        self.width = w; self.height = h
        self.color = color; self.radius = radius

    def draw(self):
        self.canv.setFillColor(self.color)
        self.canv.roundRect(0, 0, self.width, self.height,
                            self.radius, fill=1, stroke=0)


class ScoreCard(Flowable):
    """Single score tile: label / number / dot-bar / rationale."""
    def __init__(self, label, score, rationale, width, styles):
        Flowable.__init__(self)
        self.label = label
        self.score = score
        self.rationale = rationale
        self.width = width
        self.height = 60 * mm
        self.styles = styles

    def draw(self):
        c = self.canv
        w, h = self.width, self.height
        # background
        c.setFillColor(PURPLE_PALE)
        c.roundRect(0, 0, w, h, 2*mm, fill=1, stroke=0)
        # border
        c.setStrokeColor(PURPLE_LIGHT)
        c.setLineWidth(0.5)
        c.roundRect(0, 0, w, h, 2*mm, fill=0, stroke=1)

        score_color = (SCORE_LOW if self.score <= 6
                       else SCORE_HIGH if self.score >= 9
                       else SCORE_MID)

        PAD = 3 * mm   # internal padding

        # ── top-to-bottom layout, all measured from top (h) downward ──

        # 1. Label — 7.5pt, sits near top
        label_y = h - PAD - 4*mm
        c.setFillColor(GREY)
        c.setFont('Helvetica-Bold', 7.5)
        c.drawString(PAD, label_y, self.label.upper())

        # 2. Score number + "/10" — below label
        score_y = label_y - 11*mm
        c.setFillColor(score_color)
        c.setFont('Times-Bold', 28)
        c.drawString(PAD, score_y, str(self.score))
        c.setFillColor(GREY)
        c.setFont('Times-Roman', 10)
        c.drawString(PAD + 16*mm, score_y + 3*mm, '/ 10')

        # 3. Dot bar — below score number
        dot_y = score_y - 6*mm
        filled = self.score
        for i in range(10):
            c.setFillColor(score_color if i < filled else LIGHT_GREY)
            c.circle(PAD + i * 4.5*mm + 2*mm, dot_y, 1.4*mm, fill=1, stroke=0)

        # 4. Rationale — fills remaining space below dot bar
        rationale_top = dot_y - 4*mm   # start just below dots
        rationale_h   = rationale_top - PAD  # height available down to bottom padding
        if rationale_h > 4*mm:
            p = Paragraph(self.rationale, self.styles['score_rationale'])
            pw, ph = p.wrapOn(c, w - 2*PAD, rationale_h)
            # drawOn y is bottom-left of the paragraph
            p.drawOn(c, PAD, rationale_top - ph)


# ── Section builder helpers ───────────────────────────────────────────────────
def divider(story):
    story.append(Spacer(1, 2*mm))
    story.append(HRFlowable(width=CONTENT_W, thickness=0.5,
                             color=LIGHT_GREY, spaceAfter=3*mm))


def section_heading(story, label, title, S):
    story.append(Spacer(1, 2*mm))
    story.append(Paragraph(label.upper(), S['section_label']))
    story.append(Paragraph(title, S['section_title']))


# ── Main builder ─────────────────────────────────────────────────────────────
def build_report(report: dict, out_path: str):
    S = make_styles()
    meta   = report.get('meta', {})
    summ   = report.get('summary', {})
    chars  = report.get('characters', [])
    appr   = report.get('translationApproach', {})
    scores = report.get('scores', {})
    comps  = report.get('comparableTitles', [])
    readab = report.get('readabilityNote', '')
    honest = report.get('oneThing', '')
    rec    = report.get('recommendationForAuthor', '')
    verdct = report.get('verdict', '')

    doc = SimpleDocTemplate(
        out_path,
        pagesize=A4,
        leftMargin=MARGIN_L, rightMargin=MARGIN_R,
        topMargin=MARGIN_T,  bottomMargin=MARGIN_B,
        title=f"BookLingua QA Report — {meta.get('bookTitle','')}",
        author='BookLingua',
    )

    story = []

    # ── HEADER ────────────────────────────────────────────────────────────────
    # Purple band
    header_data = [[
        Paragraph('<font color="#FFFFFF"><b>BookLingua</b></font><br/>'
                  '<font color="#D5CBEB" size="8">Translation Quality Report</font>',
                  ParagraphStyle('hdr', fontName='Times-Bold', fontSize=16,
                                 textColor=white, leading=20)),
        Paragraph(
            f'<font color="#D5CBEB" size="8">{meta.get("targetLanguage","")}'
            f' · {meta.get("genre","")}'
            f'{" · " + str(meta.get("wordCount","")) + " words" if meta.get("wordCount") else ""}'
            f'</font>',
            ParagraphStyle('hdr2', fontName='Helvetica', fontSize=8,
                           textColor=white, leading=12, alignment=TA_RIGHT)),
    ]]
    ht = Table(header_data, colWidths=[CONTENT_W*0.6, CONTENT_W*0.4])
    ht.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), PURPLE),
        ('TOPPADDING',    (0,0), (-1,-1), 5*mm),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5*mm),
        ('LEFTPADDING',   (0,0), (0,-1),  5*mm),
        ('RIGHTPADDING',  (-1,0),(-1,-1), 5*mm),
        ('VALIGN',        (0,0), (-1,-1), 'MIDDLE'),
        ('ROUNDEDCORNERS', [2*mm]),
    ]))
    story.append(ht)
    story.append(Spacer(1, 5*mm))

    # Book title + author
    story.append(Paragraph(meta.get('bookTitle',''), S['title']))
    if meta.get('authorName'):
        story.append(Paragraph(meta['authorName'], S['subtitle']))

    divider(story)

    # ── 1. VERDICT ────────────────────────────────────────────────────────────
    if verdct:
        section_heading(story, 'Overall Assessment', 'The Verdict', S)
        # Cream callout box
        vdata = [[Paragraph(verdct, S['verdict'])]]
        vt = Table(vdata, colWidths=[CONTENT_W])
        vt.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,-1), CREAM),
            ('TOPPADDING',    (0,0), (-1,-1), 4*mm),
            ('BOTTOMPADDING', (0,0), (-1,-1), 4*mm),
            ('LEFTPADDING',   (0,0), (-1,-1), 5*mm),
            ('RIGHTPADDING',  (0,0), (-1,-1), 5*mm),
            ('LINEAFTER',     (0,0), (0,-1),  3, PURPLE),
        ]))
        story.append(vt)
        story.append(Spacer(1, 4*mm))

    # ── 2. HOW YOUR BOOK READS ────────────────────────────────────────────────
    section_heading(story, 'Language & Voice',
                    f'How your book reads in {meta.get("targetLanguage","")}', S)
    if summ.get('oneliner'):
        story.append(Paragraph(f'"{summ["oneliner"]}"', S['italic']))
    if summ.get('overview'):
        story.append(Paragraph(summ['overview'], S['body']))
    if summ.get('audience'):
        story.append(Paragraph(summ['audience'], S['body']))

    divider(story)

    # ── 3. CHARACTERS / KEY FIGURES ───────────────────────────────────────────
    if chars:
        section_heading(story, 'People & Characters', 'Key Figures', S)
        for ch in chars:
            row = [[
                Paragraph(f'<b>{ch.get("name","")}</b><br/>'
                          f'<font color="#7A7A7A" size="8">{ch.get("role","")}</font>',
                          S['body_sm']),
                Paragraph(ch.get('note',''), S['body_sm']),
            ]]
            ct = Table(row, colWidths=[CONTENT_W*0.28, CONTENT_W*0.72])
            ct.setStyle(TableStyle([
                ('VALIGN',        (0,0), (-1,-1), 'TOP'),
                ('TOPPADDING',    (0,0), (-1,-1), 2*mm),
                ('BOTTOMPADDING', (0,0), (-1,-1), 2*mm),
                ('LINEBELOW',     (0,0), (-1,-1), 0.5, LIGHT_GREY),
            ]))
            story.append(ct)
        story.append(Spacer(1, 3*mm))
        divider(story)

    # ── 4. APPROACH ───────────────────────────────────────────────────────────
    section_heading(story, 'Translation Approach',
                    'What We Kept and What We Adapted', S)
    approach_items = [
        ('Voice & Register',      appr.get('voiceAndRegister','')),
        ('Cultural Adaptations',  appr.get('culturalAdaptations','')),
        ('What We Kept',          appr.get('whatWasKept','')),
        ('Editorial Improvements',appr.get('editorialImprovements','')),
    ]
    for label, text in approach_items:
        if text:
            arow = [[
                Paragraph(label.upper(),
                          ParagraphStyle('albl', fontName='Helvetica-Bold',
                                         fontSize=7.5, textColor=PURPLE,
                                         leading=10, charSpace=0.8)),
                Paragraph(text, S['body_sm']),
            ]]
            at = Table(arow, colWidths=[CONTENT_W*0.22, CONTENT_W*0.78])
            at.setStyle(TableStyle([
                ('VALIGN',        (0,0), (-1,-1), 'TOP'),
                ('BACKGROUND',    (0,0), (0,-1),  PURPLE_PALE),
                ('TOPPADDING',    (0,0), (-1,-1), 3*mm),
                ('BOTTOMPADDING', (0,0), (-1,-1), 3*mm),
                ('LEFTPADDING',   (0,0), (-1,-1), 3*mm),
                ('RIGHTPADDING',  (0,0), (-1,-1), 3*mm),
                ('LINEBELOW',     (0,0), (-1,-1), 0.5, LIGHT_GREY),
            ]))
            story.append(at)
    story.append(Spacer(1, 3*mm))
    divider(story)

    # ── 5. SCORES ─────────────────────────────────────────────────────────────
    section_heading(story, 'Quality Assessment', 'Scores', S)
    score_keys = ['voicePreservation','fluencyAndReadability',
                  'culturalAdaptation','structuralIntegrity']
    score_w = (CONTENT_W - 3*3*mm) / 4  # 4 cards with 3 gaps
    cards = []
    for k in score_keys:
        s = scores.get(k, {})
        if s:
            cards.append(ScoreCard(
                s.get('label', k),
                s.get('score', 7),
                s.get('rationale', ''),
                score_w, S
            ))
    if cards:
        score_row = [cards]
        st = Table(score_row, colWidths=[score_w]*4,
                   rowHeights=[60*mm])
        st.setStyle(TableStyle([
            ('LEFTPADDING',  (0,0), (-1,-1), 1.5*mm),
            ('RIGHTPADDING', (0,0), (-1,-1), 1.5*mm),
            ('VALIGN',       (0,0), (-1,-1), 'TOP'),
        ]))
        story.append(st)
    story.append(Spacer(1, 3*mm))
    divider(story)

    # ── 6. COMPARABLE TITLES ─────────────────────────────────────────────────
    if comps:
        section_heading(story, 'Market Context',
                        f'Books like yours in {meta.get("targetLanguage","")}', S)
        story.append(Paragraph(
            f'Your translation sits alongside these published titles '
            f'in tone, register, and reader expectation.',
            S['body_sm']))
        story.append(Spacer(1, 2*mm))
        for comp in comps:
            crow = [[
                Paragraph(f'<b>{comp.get("title","")}</b><br/>'
                          f'<font color="#7A7A7A" size="8">{comp.get("author","")}</font>',
                          S['comp_title']),
                Paragraph(comp.get('note',''), S['comp_note']),
            ]]
            ct2 = Table(crow, colWidths=[CONTENT_W*0.35, CONTENT_W*0.65])
            ct2.setStyle(TableStyle([
                ('VALIGN',        (0,0), (-1,-1), 'TOP'),
                ('TOPPADDING',    (0,0), (-1,-1), 2.5*mm),
                ('BOTTOMPADDING', (0,0), (-1,-1), 2.5*mm),
                ('LEFTPADDING',   (0,0), (-1,-1), 0),
                ('LINEBELOW',     (0,0), (-1,-1), 0.5, LIGHT_GREY),
            ]))
            story.append(ct2)
        story.append(Spacer(1, 3*mm))
        divider(story)

    # ── 7. READABILITY ────────────────────────────────────────────────────────
    if readab:
        section_heading(story, 'Readability',
                        'How accessible is it to read?', S)
        story.append(Paragraph(readab, S['body']))
        divider(story)

    # ── 8. ONE THING TO KNOW ─────────────────────────────────────────────────
    if honest:
        section_heading(story, 'One Thing to Know', 'A Note from Us', S)
        hdata = [[Paragraph(honest, S['callout'])]]
        ht2 = Table(hdata, colWidths=[CONTENT_W])
        ht2.setStyle(TableStyle([
            ('BACKGROUND',    (0,0), (-1,-1), CREAM),
            ('TOPPADDING',    (0,0), (-1,-1), 4*mm),
            ('BOTTOMPADDING', (0,0), (-1,-1), 4*mm),
            ('LEFTPADDING',   (0,0), (-1,-1), 5*mm),
            ('RIGHTPADDING',  (0,0), (-1,-1), 5*mm),
            ('LINEBEFORE',    (0,0), (0,-1),  3, PURPLE),
        ]))
        story.append(ht2)
        story.append(Spacer(1, 4*mm))
        divider(story)

    # ── 9. YOUR FILES ─────────────────────────────────────────────────────────
    section_heading(story, 'Your Delivery', 'Your Files', S)
    files_text = (
        'You are receiving two files. <b>The Clean file</b> is your '
        'publication-ready translation — formatted, structured, and ready to '
        'upload. <b>The Review file</b> contains the identical text with every '
        'editorial improvement highlighted in yellow, so you can see exactly '
        'what was refined. If you have any questions about the translation, '
        'email us at hello@booklingua.io.'
    )
    story.append(Paragraph(files_text, S['body']))

    # ── RECOMMENDATION ────────────────────────────────────────────────────────
    if rec:
        story.append(Spacer(1, 2*mm))
        rdata = [[Paragraph(rec, S['body'])]]
        rt = Table(rdata, colWidths=[CONTENT_W])
        rt.setStyle(TableStyle([
            ('BACKGROUND',    (0,0), (-1,-1), PURPLE_LIGHT),
            ('TOPPADDING',    (0,0), (-1,-1), 4*mm),
            ('BOTTOMPADDING', (0,0), (-1,-1), 4*mm),
            ('LEFTPADDING',   (0,0), (-1,-1), 5*mm),
            ('RIGHTPADDING',  (0,0), (-1,-1), 5*mm),
            ('ROUNDEDCORNERS', [2*mm]),
        ]))
        story.append(rt)

    story.append(Spacer(1, 6*mm))

    # ── FOOTER ────────────────────────────────────────────────────────────────
    from datetime import datetime
    date_str = datetime.now().strftime('%-d %B %Y')
    story.append(HRFlowable(width=CONTENT_W, thickness=0.5,
                             color=LIGHT_GREY, spaceAfter=2*mm))
    fdata = [[
        Paragraph('BookLingua · booklingua.io · hello@booklingua.io',
                  S['footer']),
        Paragraph(f'Generated {date_str}', 
                  ParagraphStyle('fr', fontName='Helvetica', fontSize=8,
                                 textColor=GREY, alignment=TA_RIGHT)),
    ]]
    ft = Table(fdata, colWidths=[CONTENT_W*0.6, CONTENT_W*0.4])
    ft.setStyle(TableStyle([
        ('LEFTPADDING',  (0,0), (-1,-1), 0),
        ('RIGHTPADDING', (0,0), (-1,-1), 0),
        ('TOPPADDING',   (0,0), (-1,-1), 0),
    ]))
    story.append(ft)

    doc.build(story)
    return out_path


# ── Entry point ──────────────────────────────────────────────────────────────
if __name__ == '__main__':
    if len(sys.argv) < 3:
        print('Usage: python3 generate-qa-pdf.py input.json output.pdf')
        sys.exit(1)
    with open(sys.argv[1]) as f:
        report = json.load(f)
    out = build_report(report, sys.argv[2])
    print(f'PDF written to {out}')
