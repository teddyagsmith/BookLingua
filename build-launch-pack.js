const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType, ShadingType, PageBreak, LevelFormat,
} = require('docx');
const fs = require('fs');

const PURPLE = '7B6CA8', PURPLE_MID = '9B89C4', CREAM = 'F7EFE4', DARK = '2C2C2C', GREY = '7A7A7A', BORDER_GREY = 'CCCCCC', WHITE = 'FFFFFF';

const CONTENT = {
  bookTitleEnglish: 'Communicating with Adult Kids',
  authorName: 'Tina Routhier',
  generatedDate: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
  languages: [
    {
      language: 'German', market: 'Germany · Austria · Switzerland',
      translatedTitle: 'Kommunizieren mit erwachsenen Kindern: Von Konflikt zu Verbindung',
      backendKeywords: [
        { keyword: 'Kommunikation erwachsene Kinder Eltern', chars: 39 },
        { keyword: 'DISC Persönlichkeit Familie Ratgeber', chars: 37 },
        { keyword: 'Konflikt lösen erwachsene Söhne Töchter', chars: 40 },
        { keyword: 'Beziehung verbessern Eltern Kinder', chars: 35 },
        { keyword: 'Persönlichkeitstypen Kommunikation Familie', chars: 43 },
        { keyword: '30 Tage Plan Eltern Beziehung stärken', chars: 38 },
        { keyword: 'Familienkommunikation Konflikte überwinden', chars: 43 },
      ],
      keywordsNote: 'German shoppers on amazon.de use compound nouns heavily. These strings mirror natural German search patterns.',
      adKeywords: {
        highIntent: ['Kommunikation mit erwachsenen Kindern','Beziehung zu erwachsenen Kindern verbessern','Eltern erwachsene Kinder Konflikt','DISC Persönlichkeitsmodell Buch','Familienkonflikte lösen Ratgeber'],
        category: ['Erziehungsratgeber Erwachsene','Persönlichkeitstypen Buch Deutsch','Familienbeziehungen Ratgeber','Kommunikationstraining Eltern','Eltern-Kind-Beziehung Erwachsene','Persönlichkeitsentwicklung Familie','Selbsthilfe Familienkommunikation'],
        longTail: ['Wie kommuniziere ich mit meinem erwachsenen Kind','Entfremdung erwachsene Kinder Eltern','Beziehung zu Sohn oder Tochter verbessern','DISC Methode Kommunikation','Persönlichkeitsprofil Familie Ratgeber','30 Tage Beziehungsplan Familie','Verhaltenstypen verstehen Buch'],
      },
      adKeywordsNote: 'Run three campaigns: exact match on high-intent, broad match on DISC niche, product targeting on competitor ASINs. Start bids €0.35–0.55.',
      categories: [
        { priority: '1st', path: 'Bücher › Ratgeber › Familie & Beziehungen › Eltern & Kinder', rationale: 'Highest direct traffic; core audience' },
        { priority: '2nd', path: 'Bücher › Ratgeber › Persönlichkeitsentwicklung & Selbsthilfe › Kommunikation', rationale: 'Captures DISC/communication searchers' },
        { priority: '3rd', path: 'Bücher › Ratgeber › Familie & Beziehungen › Familienprobleme', rationale: 'Conflict-resolution searchers' },
        { priority: '4th', path: 'Bücher › Ratgeber › Psychologie › Persönlichkeitsentwicklung', rationale: 'DISC methodology audience' },
        { priority: '5th', path: 'Bücher › Ratgeber › Lebenshilfe & Alltagsprobleme', rationale: 'Broad self-help spillover traffic' },
      ],
      categoriesNote: 'Categories 3–5 have lower competition. Even modest sales (15–20 copies in week one) can achieve a bestseller flag.',
      pricing: {
        ebook: [
          { option: 'Launch Price', price: '€2.99', note: 'First 14–21 days to drive velocity and reviews' },
          { option: 'Standard Price', price: '€6.99', note: 'Post-launch ongoing price' },
          { option: 'KDP Select Free', price: '€0.00', note: 'Use in Week 3 to spike downloads and visibility' },
        ],
        paperback: [
          { format: 'Standard Paperback', price: '€16.99', royalty: '~€3.50–4.50 per copy' },
          { format: 'Premium/Larger', price: '€19.99', royalty: '~€4.50–5.50 per copy' },
        ],
        ebookNote: '€2.99 is the lowest KDP 70% royalty tier in DE, maximising early conversion. €6.99 is competitive for German self-help (comps €5.99–€9.99).',
        paperbackNote: 'German readers strongly prefer print. €16.99 positions the book as accessible yet professional, below the €20 impulse-purchase threshold.',
      },
      description: 'Warum ist die Beziehung zu Ihrem erwachsenen Kind so kompliziert geworden?\n\nSie lieben Ihr Kind bedingungslos — doch Gespräche enden im Streit, Missverständnisse häufen sich, und die Verbindung, die Sie sich wünschen, scheint unerreichbar. Das muss nicht so bleiben.\n\nKommunizieren mit erwachsenen Kindern zeigt Ihnen, wie Sie mithilfe des DISC-Persönlichkeitsmodells Ihren erwachsenen Sohn oder Ihre erwachsene Tochter wirklich verstehen — und endlich so kommunizieren, dass Sie gehört werden.\n\nIn diesem praxisnahen 30-Tage-Ratgeber lernen Sie die vier DISC-Persönlichkeitstypen kennen, individuelle Kommunikationsstrategien für jeden Typ anwenden, langjährige Konflikte auflösen und echte Verbindung aufbauen.',
      descriptionNote: 'Use KDP\'s HTML editor. Add <b> tags for bold phrases and <ul><li> for bullet points.',
      reviewTactics: [
        { name: 'German ARC Reader Team', body: 'Build a list of 20–30 German-speaking ARC readers before launch using BookFunnel or StoryOrigin. Target German Facebook parenting groups and Buchliebhaber communities.', steps: ['Recruit readers 4–6 weeks before launch','Distribute free copies via BookFunnel','Follow up at Day 7 and Day 14','Target: 15–20 verified reviews at launch'], timeline: 'Begin 4–6 weeks before launch' },
        { name: 'German Bookstagram and BookTok', body: 'Identify 10–15 micro-influencers (1,000–15,000 followers) in the German Ratgeber/Sachbuch niche. Search hashtags: #sachbuchliebe, #ratgeberbuch, #persönlichkeitsentwicklung.', steps: ['Send personalised DMs in German','Offer a complimentary copy for honest review','Target 3–5 Reels or TikToks at launch'], budget: 'Gifted copies only' },
        { name: 'DISC and Coaching Community Seeding', body: 'Reach out to German-speaking DISC-certified trainers, coaches, and HR professionals via XING and the DVCT coaching association. These readers are pre-sold on the methodology.', steps: ['Search XING groups for DISC and Kommunikationstraining','Offer free copies in exchange for review and recommendation','Ask for referral to their client base'], timeline: '4 weeks before launch' },
        { name: 'Author Email List — Erste-Leser-Programm', body: 'Create a landing page offering a free bonus chapter or DISC worksheet in German. Name it the Erste-Leser-Programm. Email at launch with a direct review link.', steps: ['Build landing page with free resource','Email list at launch with direct amazon.de review link','Follow up at Day 7 and Day 14','Target: 20–30% conversion to reviewers'], timeline: 'Build list 4 weeks before launch' },
        { name: 'German Podcast Guest Strategy', body: 'Pitch yourself as a guest to 3–5 German-language podcasts in parenting, family, or personal development. Offer listeners a free DISC worksheet via landing page to capture emails.', steps: ['Pitch podcasts 6–8 weeks before launch','Prepare a free downloadable resource for listeners','Episodes typically air 4–6 weeks after recording'], timeline: 'Pitch 6–8 weeks before launch' },
      ],
      checklist: {
        phases: [
          { phase: 'Phase 1 — Pre-Upload Preparation', items: [
            { title: 'Manuscript Formatting', detail: 'Verify German typography: „quotation marks", correct Umlauts (ä, ö, ü, ß), consistent 30-day plan formatting.' },
            { title: 'Cover Verification', detail: 'Confirm cover text is fully in German and legible at thumbnail size (~160px). Test on mobile.' },
            { title: 'ISBN Assignment', detail: 'Obtain a separate ISBN for the German paperback. KDP assigns a free ASIN but a dedicated ISBN adds credibility.' },
          ]},
          { phase: 'Phase 2 — KDP Backend Entry', items: [
            { title: 'Title and Subtitle', detail: 'Title: Kommunizieren mit erwachsenen Kindern. Subtitle: Von Konflikt zu Verbindung.' },
            { title: 'Author Details', detail: 'Enter "Tina Routhier." Add translator under Contributors as Übersetzer.' },
            { title: 'Keywords Entry', detail: 'Copy the 7 keyword strings from Section 1 exactly. Double-check character counts.' },
            { title: 'Category Selection', detail: 'Select top 2 categories during upload. Email KDP support for additional 3 after publishing.' },
            { title: 'Book Description', detail: 'Paste from Section 5 using KDP\'s HTML editor. Preview before saving.' },
          ]},
          { phase: 'Phase 3 — Pricing and Publishing', items: [
            { title: 'Pricing Configuration', detail: 'Set eBook at €2.99 launch price with KDP Select. Paperback at €16.99.' },
            { title: 'Proof Order', detail: 'Order a physical proof copy. Verify print quality and Umlaut rendering. Allow 7–10 business days.' },
          ]},
        ],
      },
      timeline: [
        { period: 'Week −6', action: 'Build ARC team; begin podcast pitching' },
        { period: 'Week −4', action: 'Send ARC copies via BookFunnel; begin influencer outreach' },
        { period: 'Week −2', action: 'Social media teaser campaign (Bookstagram, TikTok)' },
        { period: 'Week −1', action: 'Upload to KDP; set launch date; order proof copy' },
        { period: 'Day 1', action: 'Launch — email list notification; price at €2.99' },
        { period: 'Day 7', action: 'Follow up ARC and email list for reviews' },
        { period: 'Day 14', action: 'Second follow-up; activate KDP Select Free Days in Week 3' },
      ],
    },
    {
      language: 'Italian', market: 'Italy',
      translatedTitle: 'Comunicare con i Figli Adulti: Dal Conflitto alla Connessione',
      backendKeywords: [
        { keyword: 'Comunicazione figli adulti genitori', chars: 37 },
        { keyword: 'DISC personalità famiglia relazioni', chars: 36 },
        { keyword: 'Conflitti familiari soluzioni guida', chars: 37 },
        { keyword: 'Genitorialità figli adulti coaching', chars: 36 },
        { keyword: 'Migliorare relazione figli adulti', chars: 36 },
        { keyword: 'Famiglia gestione conflitti strategie', chars: 38 },
        { keyword: 'Guida genitori comunicazione efficace', chars: 38 },
      ],
      keywordsNote: 'Italian shoppers use phrase-based searches. These strings mirror natural Italian search patterns on amazon.it.',
      adKeywords: {
        highIntent: ['Comunicare con figli adulti','Relazione figli adulti migliorare','Genitori figli adulti conflitto','DISC personalità libro italiano','Famiglia conflitti soluzioni guida'],
        category: ['Libri famiglia relazioni','Sviluppo personale famiglia','Psicologia familiare','Comunicazione efficace famiglia','Educazione figli adulti','Crescita personale genitori','Problem solving famiglia'],
        longTail: ['Come comunicare con mio figlio adulto','Conflitto figli adulti genitori','Relazione con figlio o figlia migliorare','Metodo DISC comunicazione','Profilo personalità famiglia guida','Piano 30 giorni famiglia relazione','Capire i tipi di comportamento libro'],
      },
      adKeywordsNote: 'Run three campaigns: exact match on high-intent, broad match on DISC/personality niche, product targeting on competitor ASINs. Start bids €0.30–0.50.',
      categories: [
        { priority: '1st', path: 'Libri › Famiglia, salute e benessere › Famiglia e relazioni › Genitorialità', rationale: 'Highest direct traffic; core parenting audience' },
        { priority: '2nd', path: 'Libri › Famiglia, salute e benessere › Famiglia e relazioni › Comunicazione', rationale: 'Captures communication-focused searchers' },
        { priority: '3rd', path: 'Libri › Scienze sociali › Psicologia › Psicologia generale', rationale: 'DISC/personality psychology audience' },
        { priority: '4th', path: 'Libri › Famiglia, salute e benessere › Sviluppo personale', rationale: 'Self-help and personal growth readers' },
        { priority: '5th', path: 'Libri › Famiglia, salute e benessere › Famiglia e relazioni › Famiglia', rationale: 'Broad family relationship spillover traffic' },
      ],
      categoriesNote: 'Italian Amazon categories are less granular than German. Categories 3–5 capture broader audiences but still relevant.',
      pricing: {
        ebook: [
          { option: 'Launch Price', price: '€2.99', note: 'First 14–21 days to drive velocity and reviews' },
          { option: 'Standard Price', price: '€4.99', note: 'Post-launch ongoing price' },
          { option: 'KDP Select Free', price: '€0.00', note: 'Use in Week 3 to spike downloads and visibility' },
        ],
        paperback: [
          { format: 'Standard Paperback', price: '€14.99', royalty: '~€2.50–3.50 per copy' },
          { format: 'Premium/Larger', price: '€17.99', royalty: '~€3.50–4.50 per copy' },
        ],
        ebookNote: 'Italian market is price-sensitive. €2.99 at launch drives impulse buys. €4.99 is competitive for Italian self-help (comps €3.99–€6.99).',
        paperbackNote: 'Italian readers prefer paperback for non-fiction. €14.99 is accessible and positions the book as a serious investment without being expensive.',
      },
      description: 'Perché la relazione con il proprio figlio adulto è diventata così complicata?\n\nAmate incondizionatamente vostro figlio — ma le conversazioni finiscono in litigi, i malintesi si accumulano e il legame che desiderate sembra irraggiungibile. Non deve essere così.\n\nComunicare con i Figli Adulti vi mostra come utilizzare il modello DISC delle personalità per capire davvero vostro figlio adulto — e finalmente comunicare in modo da essere ascoltati.\n\nIn questa guida pratica di 30 giorni imparerete a conoscere i quattro tipi di personalità DISC, applicare strategie di comunicazione individuali per ogni tipo, risolvere conflitti di lunga data e costruire una connessione autentica.',
      descriptionNote: 'Use KDP\'s HTML editor. Add <b> tags for bold phrases and <ul><li> for bullet points.',
      reviewTactics: [
        { name: 'Italian ARC Reader Team', body: 'Build a list of 15–25 Italian ARC readers before launch using BookFunnel. Target Italian Facebook parenting groups and book blogger communities.', steps: ['Recruit readers 4–6 weeks before launch','Distribute free copies via BookFunnel','Follow up at Day 7 and Day 14','Target: 10–15 verified reviews at launch'], timeline: 'Begin 4–6 weeks before launch' },
        { name: 'Italian Bookstagram and BookTok', body: 'Identify 10–15 micro-influencers (1,000–10,000 followers) in Italian self-help and parenting niches. Search hashtags: #libribenessere, #crescitapersonale, #genitorifigli.', steps: ['Send personalised DMs in Italian','Offer a complimentary copy for honest review','Target 3–5 Reels or TikToks at launch'], budget: 'Gifted copies only' },
        { name: 'Coaching and Psychology Community', body: 'Reach out to Italian coaches, psychologists, and therapists via LinkedIn Italia and professional associations. These professionals are pre-sold on methodology.', steps: ['Search LinkedIn for Italian coaches and psychologists','Offer free copies in exchange for review and recommendation','Ask for referral to their client base'], timeline: '4 weeks before launch' },
        { name: 'Author Email List — Primi Lettori', body: 'Create a landing page offering a free bonus chapter or DISC worksheet in Italian. Name it "Primi Lettori." Email at launch with a direct review link.', steps: ['Build landing page with free resource','Email list at launch with direct amazon.it review link','Follow up at Day 7 and Day 14','Target: 20–30% conversion to reviewers'], timeline: 'Build list 4 weeks before launch' },
        { name: 'Italian Podcast Guest Strategy', body: 'Pitch yourself as a guest to 3–5 Italian podcasts in parenting, psychology, or personal development. Offer listeners a free DISC worksheet via landing page.', steps: ['Pitch podcasts 6–8 weeks before launch','Prepare a free downloadable resource for listeners','Episodes typically air 4–6 weeks after recording'], timeline: 'Pitch 6–8 weeks before launch' },
      ],
      checklist: {
        phases: [
          { phase: 'Phase 1 — Pre-Upload Preparation', items: [
            { title: 'Manuscript Formatting', detail: 'Verify Italian typography: «quotation marks», correct accents (à, è, é, ì, ò, ù), consistent 30-day plan formatting.' },
            { title: 'Cover Verification', detail: 'Confirm cover text is fully in Italian and legible at thumbnail size (~160px). Test on mobile.' },
            { title: 'ISBN Assignment', detail: 'Obtain a separate ISBN for the Italian paperback edition. KDP assigns a free ASIN but a dedicated ISBN adds credibility.' },
          ]},
          { phase: 'Phase 2 — KDP Backend Entry', items: [
            { title: 'Title and Subtitle', detail: 'Title: Comunicare con i Figli Adulti. Subtitle: Dal Conflitto alla Connessione.' },
            { title: 'Author Details', detail: 'Enter "Tina Routhier." Add translator under Contributors as Traduttore.' },
            { title: 'Keywords Entry', detail: 'Copy the 7 keyword strings from Section 1 exactly. Double-check character counts.' },
            { title: 'Category Selection', detail: 'Select top 2 categories during upload. Email KDP support for additional categories after publishing.' },
            { title: 'Book Description', detail: 'Paste from Section 5 using KDP\'s HTML editor. Preview before saving.' },
          ]},
          { phase: 'Phase 3 — Pricing and Publishing', items: [
            { title: 'Pricing Configuration', detail: 'Set eBook at €2.99 launch price with KDP Select. Paperback at €14.99.' },
            { title: 'Proof Order', detail: 'Order a physical proof copy. Verify print quality and accent rendering. Allow 7–10 business days.' },
          ]},
        ],
      },
      timeline: [
        { period: 'Week −6', action: 'Build ARC team; begin podcast pitching' },
        { period: 'Week −4', action: 'Send ARC copies via BookFunnel; begin influencer outreach' },
        { period: 'Week −2', action: 'Social media teaser campaign (Bookstagram, TikTok)' },
        { period: 'Week −1', action: 'Upload to KDP; set launch date; order proof copy' },
        { period: 'Day 1', action: 'Launch — email list notification; price at €2.99' },
        { period: 'Day 7', action: 'Follow up ARC and email list for reviews' },
        { period: 'Day 14', action: 'Second follow-up; activate KDP Select Free Days in Week 3' },
      ],
    },
  ],
};

function hr(color, size) { return new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size, color, space: 1 } }, spacing: { after: 0 }, children: [] }); }
function spacer(pts) { return new Paragraph({ spacing: { before: pts, after: 0 }, children: [] }); }
function calloutBox(label, text) { return new Table({ width: { size: 9026, type: WidthType.DXA }, columnWidths: [9026], rows: [new TableRow({ children: [new TableCell({ borders: { top: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.SINGLE, size: 18, color: PURPLE } }, shading: { fill: CREAM, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 160, right: 160 }, width: { size: 9026, type: WidthType.DXA }, children: [new Paragraph({ spacing: { before: 0, after: 0 }, children: [new TextRun({ text: 'Note — ', bold: true, font: 'Calibri', size: 21, color: PURPLE }), new TextRun({ text, italics: true, font: 'Calibri', size: 21, color: DARK })], })], })], })], }); }
function sectionBanner(language, translatedTitle, market) { return new Table({ width: { size: 9026, type: WidthType.DXA }, columnWidths: [9026], rows: [new TableRow({ children: [new TableCell({ shading: { fill: PURPLE, type: ShadingType.CLEAR }, margins: { top: 160, bottom: 160, left: 200, right: 200 }, width: { size: 9026, type: WidthType.DXA }, children: [new Paragraph({ spacing: { before: 0, after: 60 }, children: [new TextRun({ text: language, bold: true, font: 'Calibri', size: 36, color: WHITE })] }), new Paragraph({ spacing: { before: 0, after: 60 }, children: [new TextRun({ text: translatedTitle, italics: true, font: 'Calibri', size: 24, color: WHITE })] }), new Paragraph({ spacing: { before: 0, after: 0 }, children: [new TextRun({ text: market, font: 'Calibri', size: 20, color: 'D5CBEB' })] }),] }),] })], }); }
function purpleTable(headers, rows, colWidths) { const cellBorder = { style: BorderStyle.SINGLE, size: 4, color: BORDER_GREY }; const borders = { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder }; const totalW = colWidths.reduce((a, b) => a + b, 0); return new Table({ width: { size: totalW, type: WidthType.DXA }, columnWidths: colWidths, rows: [new TableRow({ tableHeader: true, children: headers.map((h, i) => new TableCell({ shading: { fill: PURPLE, type: ShadingType.CLEAR }, borders, margins: { top: 60, bottom: 60, left: 100, right: 100 }, width: { size: colWidths[i], type: WidthType.DXA }, children: [new Paragraph({ spacing: { before: 0, after: 0 }, children: [new TextRun({ text: h, bold: true, font: 'Calibri', size: 20, color: WHITE })] })] })) }), ...rows.map((row, ri) => new TableRow({ children: row.map((cell, ci) => new TableCell({ shading: { fill: ri % 2 === 0 ? WHITE : CREAM, type: ShadingType.CLEAR }, borders, margins: { top: 60, bottom: 60, left: 100, right: 100 }, width: { size: colWidths[ci], type: WidthType.DXA }, children: [new Paragraph({ spacing: { before: 0, after: 0 }, children: [new TextRun({ text: String(cell), font: 'Calibri', size: 20, color: DARK })] })] })) })), ], }); }
function bulletList(items, reference) { return items.map(item => new Paragraph({ numbering: { reference, level: 0 }, spacing: { before: 40, after: 40 }, children: [new TextRun({ text: item, font: 'Calibri', size: 22, color: DARK })] })); }
function h1(text) { return new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 280, after: 80 }, children: [new TextRun({ text, bold: true, font: 'Calibri', size: 28, color: PURPLE })] }); }
function h2(text) { return new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 160, after: 60 }, children: [new TextRun({ text, bold: true, font: 'Calibri', size: 22, color: DARK })] }); }
function body(text) { return new Paragraph({ spacing: { before: 60, after: 80 }, children: [new TextRun({ text, font: 'Calibri', size: 22, color: DARK })] }); }
function metaLine(label, value) { return new Paragraph({ spacing: { before: 40, after: 40 }, children: [new TextRun({ text: `${label}: `, bold: true, font: 'Calibri', size: 22, color: PURPLE }), new TextRun({ text: value, font: 'Calibri', size: 22, color: DARK })] }); }
function timelineTable(rows) { return new Table({ width: { size: 9026, type: WidthType.DXA }, columnWidths: [2000, 7026], rows: rows.map((row, ri) => new TableRow({ children: [new TableCell({ shading: { fill: ri % 2 === 0 ? WHITE : CREAM, type: ShadingType.CLEAR }, borders: { top: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.SINGLE, size: 4, color: BORDER_GREY } }, margins: { top: 80, bottom: 80, left: 100, right: 100 }, width: { size: 2000, type: WidthType.DXA }, children: [new Paragraph({ spacing: { before: 0, after: 0 }, children: [new TextRun({ text: row.period, bold: true, font: 'Calibri', size: 22, color: PURPLE })] })] }), new TableCell({ shading: { fill: ri % 2 === 0 ? WHITE : CREAM, type: ShadingType.CLEAR }, borders: { top: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.SINGLE, size: 4, color: BORDER_GREY } }, margins: { top: 80, bottom: 80, left: 100, right: 100 }, width: { size: 7026, type: WidthType.DXA }, children: [new Paragraph({ spacing: { before: 0, after: 0 }, children: [new TextRun({ text: row.action, font: 'Calibri', size: 22, color: DARK })] })] }),] })), }); }

const allChildren = [];
const BULLETS_REF = 'launch-bullets';

// Cover page
allChildren.push(
  new Paragraph({ spacing: { before: 2800, after: 80 }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'BookLingua', bold: true, font: 'Calibri', size: 56, color: PURPLE })] }),
  hr(PURPLE, 12),
  spacer(80),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 200 }, children: [new TextRun({ text: 'Launch Strategy Pack', font: 'Calibri', size: 44, color: DARK })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 80 }, children: [new TextRun({ text: CONTENT.bookTitleEnglish, italics: true, font: 'Calibri', size: 32, color: PURPLE })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 400 }, children: [new TextRun({ text: `by ${CONTENT.authorName}`, font: 'Calibri', size: 24, color: GREY })] }),
  new Table({ width: { size: 7000, type: WidthType.DXA }, columnWidths: [3500, 3500], rows: [new TableRow({ children: [new TableCell({ shading: { fill: CREAM, type: ShadingType.CLEAR }, borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } }, margins: { top: 100, bottom: 100, left: 160, right: 160 }, width: { size: 3500, type: WidthType.DXA }, children: [new Paragraph({ spacing: { before: 0, after: 0 }, children: [new TextRun({ text: `Target languages: ${CONTENT.languages.map(l => l.language).join(' · ')}`, font: 'Calibri', size: 20, color: GREY })] })] }), new TableCell({ shading: { fill: CREAM, type: ShadingType.CLEAR }, borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } }, margins: { top: 100, bottom: 100, left: 160, right: 160 }, width: { size: 3500, type: WidthType.DXA }, children: [new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 0, after: 0 }, children: [new TextRun({ text: `Prepared by BookLingua · ${CONTENT.generatedDate}`, font: 'Calibri', size: 20, color: GREY })] })] }),] })] }),
  new Paragraph({ children: [new PageBreak()] }),
);

for (const lang of CONTENT.languages) {
  allChildren.push(sectionBanner(lang.language, lang.translatedTitle, lang.market), spacer(200));
  allChildren.push(h1('1. Backend Keywords'));
  allChildren.push(purpleTable(['#', 'Keyword String', 'Chars'], lang.backendKeywords.map((k, i) => [i + 1, k.keyword, k.chars]), [500, 6500, 1026]));
  allChildren.push(spacer(100), calloutBox('Keywords', lang.keywordsNote), spacer(200));
  allChildren.push(h1('2. Ad Keywords'));
  allChildren.push(h2('High-Intent Primary Keywords'));
  allChildren.push(...bulletList(lang.adKeywords.highIntent, BULLETS_REF));
  allChildren.push(h2('Category and Topic Keywords'));
  allChildren.push(...bulletList(lang.adKeywords.category, BULLETS_REF));
  allChildren.push(h2('Long-Tail and Niche Keywords'));
  allChildren.push(...bulletList(lang.adKeywords.longTail, BULLETS_REF));
  allChildren.push(spacer(100), calloutBox('Ad Strategy', lang.adKeywordsNote), spacer(200));
  allChildren.push(h1('3. Amazon Categories'));
  allChildren.push(purpleTable(['Priority', 'Category Path', 'Rationale'], lang.categories.map(c => [c.priority, c.path, c.rationale]), [900, 5500, 2626]));
  allChildren.push(spacer(100), calloutBox('Categories', lang.categoriesNote), spacer(200));
  allChildren.push(h1('4. Pricing Strategy'));
  allChildren.push(h2('eBook (Kindle)'));
  allChildren.push(purpleTable(['Option', 'Price', 'When to Use'], lang.pricing.ebook.map(r => [r.option, r.price, r.note]), [2200, 1200, 5626]));
  allChildren.push(spacer(80), body(lang.pricing.ebookNote));
  allChildren.push(h2('Paperback (Print)'));
  allChildren.push(purpleTable(['Format', 'Price', 'Estimated Royalty'], lang.pricing.paperback.map(r => [r.format, r.price, r.royalty]), [3000, 1500, 4526]));
  allChildren.push(spacer(80), body(lang.pricing.paperbackNote));
  allChildren.push(spacer(200));
  allChildren.push(h1('5. Book Description'));
  allChildren.push(body('Use the following description on your KDP product page. Copy it exactly.'));
  allChildren.push(new Table({ width: { size: 9026, type: WidthType.DXA }, columnWidths: [9026], rows: [new TableRow({ children: [new TableCell({ borders: { top: { style: BorderStyle.SINGLE, size: 8, color: PURPLE }, bottom: { style: BorderStyle.SINGLE, size: 8, color: PURPLE }, left: { style: BorderStyle.SINGLE, size: 8, color: PURPLE }, right: { style: BorderStyle.SINGLE, size: 8, color: PURPLE } }, shading: { fill: CREAM, type: ShadingType.CLEAR }, margins: { top: 160, bottom: 160, left: 200, right: 200 }, width: { size: 9026, type: WidthType.DXA }, children: lang.description.split('\n\n').map(para => new Paragraph({ spacing: { before: 0, after: 100 }, children: [new TextRun({ text: para.trim(), font: 'Calibri', size: 22, color: DARK })] })) })] })] }));
  allChildren.push(spacer(80), body(lang.descriptionNote), spacer(200));
  allChildren.push(h1('6. Review Strategy'));
  lang.reviewTactics.forEach((tactic, i) => {
    allChildren.push(h2(`Tactic ${i + 1} — ${tactic.name}`));
    allChildren.push(body(tactic.body));
    allChildren.push(new Paragraph({ spacing: { before: 80, after: 40 }, children: [new TextRun({ text: 'Action steps:', bold: true, font: 'Calibri', size: 22, color: DARK })] }));
    allChildren.push(...bulletList(tactic.steps, BULLETS_REF));
    if (tactic.timeline) allChildren.push(metaLine('Timeline', tactic.timeline));
    if (tactic.budget) allChildren.push(metaLine('Budget', tactic.budget));
    allChildren.push(spacer(80));
  });
  allChildren.push(spacer(120));
  allChildren.push(h1('7. KDP Upload Checklist'));
  lang.checklist.phases.forEach(phase => {
    allChildren.push(h2(phase.phase));
    phase.items.forEach(item => {
      allChildren.push(new Paragraph({ spacing: { before: 80, after: 20 }, children: [new TextRun({ text: '\u2610  ', font: 'Calibri', size: 22, color: PURPLE }), new TextRun({ text: item.title, bold: true, font: 'Calibri', size: 22, color: DARK })] }));
      allChildren.push(new Paragraph({ indent: { left: 440 }, spacing: { before: 0, after: 80 }, children: [new TextRun({ text: item.detail, font: 'Calibri', size: 20, color: GREY })] }));
    });
  });
  allChildren.push(spacer(200));
  allChildren.push(h1('Launch Timeline'));
  allChildren.push(timelineTable(lang.timeline));
  allChildren.push(new Paragraph({ children: [new PageBreak()] }));
}

const doc = new Document({
  styles: { default: { document: { run: { font: 'Calibri', size: 22, color: DARK } } }, paragraphStyles: [
    { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 28, bold: true, font: 'Calibri', color: PURPLE }, paragraph: { spacing: { before: 280, after: 80 }, outlineLevel: 0 } },
    { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 22, bold: true, font: 'Calibri', color: DARK }, paragraph: { spacing: { before: 160, after: 60 }, outlineLevel: 1 } },
  ] },
  numbering: { config: [{ reference: BULLETS_REF, levels: [{ level: 0, format: LevelFormat.BULLET, text: '\u2022', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 560, hanging: 280 } }, run: { font: 'Calibri', color: PURPLE, size: 22 } } }] }] },
  sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 } } }, headers: { default: new Header({ children: [hr(PURPLE, 8), new Paragraph({ spacing: { before: 60, after: 0 }, children: [new TextRun({ text: `BookLingua Launch Pack — ${CONTENT.bookTitleEnglish}`, font: 'Calibri', size: 18, color: PURPLE_MID }), new TextRun({ text: `\t${CONTENT.generatedDate}`, font: 'Calibri', size: 18, color: GREY })] })] }) }, footers: { default: new Footer({ children: [hr(BORDER_GREY, 4), new Paragraph({ spacing: { before: 60, after: 0 }, children: [new TextRun({ text: 'booklingua.io', font: 'Calibri', size: 18, color: PURPLE_MID }), new TextRun({ text: '\tPage ', font: 'Calibri', size: 18, color: GREY })] })] }) }, children: allChildren }],
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync('/Users/gilbert/.openclaw/workspace/Launch_Strategy_Pack.docx', buffer);
  console.log('Written: Launch_Strategy_Pack.docx');
});
