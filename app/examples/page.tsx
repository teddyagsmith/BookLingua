'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'

const serifFont = { fontFamily: "'Instrument Serif', Georgia, serif" }

const Logo = ({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) => {
  const sizes = { sm: 32, md: 48, lg: 64 }
  return (
    <Image
      src="/logo.png"
      alt="BookLingua"
      width={sizes[size]}
      height={sizes[size]}
      className="object-contain"
    />
  )
}

// Original Dracula text (Chapter 1 opening)
const originalText = [
  {
    id: 1,
    text: '3 May. Bistritz.—Left Munich at 8:35 P.M., on 1st May, arriving at Vienna early next morning; should have arrived at 6:46, but train was an hour late.',
  },
  {
    id: 2,
    text: 'Buda-Pesth seems a wonderful place, from the glimpse which I got of it from the train and the little I could walk through the streets. I feared to go very far from the station, as we had arrived late and would start as near the correct time as possible.',
  },
  {
    id: 3,
    text: 'The impression I had was that we were leaving the West and entering the East; the most western of splendid bridges over the Danube, which is here of noble width and depth, took us among the traditions of Turkish rule.',
  },
  {
    id: 4,
    text: 'We left in pretty good time, and came after nightfall to Klausenburgh. Here I stopped for the night at the Hotel Royale. I had for dinner, or rather supper, a chicken done up some way with red pepper, which was very good but thirsty.',
  },
  {
    id: 5,
    text: '(Mem., get recipe for Mina.) I asked the waiter, and he said it was called "paprika hendl," and that, as it was a national dish, I should be able to get it anywhere along the Carpathians.',
  },
  {
    id: 6,
    text: 'I found my smattering of German very useful here; indeed, I don\'t know how I should be able to get on without it.',
  },
  {
    id: 7,
    text: 'Having had some time to spare in going to the station, I went, of course, to the inevitable Graben, where I saw some very fine silver work being done. The people of Klausenburgh seem a very nice set, and there were many pretty girls.',
  },
  {
    id: 8,
    text: 'I had asked the driver what the name of this was; he told me he knew it as "Via Transilvanica." I did not stop to make inquiries, as we had a long journey before us and the day was already well advanced.',
  },
]

type LangCode = 'es' | 'fr' | 'de' | 'pt'
type ActiveTab = LangCode | 'notes' | 'launch'

interface TranslationSegment {
  id: number
  text: string
  highlighted?: boolean
  editNote?: string
}

const translations: Record<LangCode, { segments: TranslationSegment[]; editorialNotes: string[] }> = {
  es: {
    segments: [
      {
        id: 1,
        text: '3 de mayo. Bistritz.—Salí de Múnich a las 8:35 de la tarde del 1.º de mayo, llegando a Viena a primera hora de la mañana siguiente; debería haber llegado a las 6:46, pero el tren llevaba una hora de retraso.',
        highlighted: true,
        editNote: 'Date format adapted to Spanish convention (cardinal ordinal); city name accented per RAE standard',
      },
      {
        id: 2,
        text: 'Budapest parece un lugar maravilloso, a juzgar por el breve vistazo que pude echarle desde el tren y el poco tiempo que pude pasear por sus calles. Temía alejarme demasiado de la estación, pues habíamos llegado tarde y queríamos partir lo más puntualmente posible.',
        highlighted: false,
      },
      {
        id: 3,
        text: 'La impresión que tuve fue la de que dejábamos atrás el Occidente para adentrarnos en el Oriente; el más occidental de los magníficos puentes sobre el Danubio —que aquí presenta una anchura y profundidad imponentes— nos introdujo en el mundo de las tradiciones del dominio turco.',
        highlighted: true,
        editNote: 'Restructured long clause for natural Spanish flow; "noble width" rendered as "imponentes" (imposing) to preserve tone',
      },
      {
        id: 4,
        text: 'Partimos con bastante puntualidad y, al caer la noche, llegamos a Klausenburgh. Allí me alojé en el Hotel Royale. Cené —o más bien merendé— un pollo preparado de alguna manera con pimiento rojo, que estaba muy bueno aunque dejaba sed.',
        highlighted: false,
      },
      {
        id: 5,
        text: '(Nota: conseguir la receta para Mina.) Le pregunté al camarero y me dijo que se llamaba «paprika hendl», y que, al ser un plato típico nacional, podría encontrarlo en cualquier lugar a lo largo de los Cárpatos.',
        highlighted: true,
        editNote: '"Mem." expanded to "Nota:" for modern Spanish readers; angle quotes used per Spanish typography convention',
      },
      {
        id: 6,
        text: 'Aquí me resultaron muy útiles mis nociones de alemán; es más, no sé cómo me habría arreglado sin ellas.',
        highlighted: false,
      },
      {
        id: 7,
        text: 'Como me quedaba algo de tiempo antes de partir hacia la estación, fui, por supuesto, al inevitable Graben, donde pude ver cómo se elaboraban algunas piezas de plata de gran calidad. La gente de Klausenburgh parece muy agradable, y había muchas jóvenes hermosas.',
        highlighted: true,
        editNote: '"Very fine silver work" rendered as "piezas de plata de gran calidad" — adjusted idiom for natural literary flow in Spanish',
      },
      {
        id: 8,
        text: 'Le había preguntado al cochero cómo se llamaba este camino; me dijo que él lo conocía como «Via Transilvanica». No me detuve a hacer averiguaciones, pues teníamos un largo viaje por delante y el día ya estaba muy avanzado.',
        highlighted: false,
      },
    ],
    editorialNotes: [
      '🗓️ Date and time conventions adapted to Spanish (RAE) standards — "1st May" becomes "1.º de mayo," "P.M." rendered as "de la tarde"',
      '💬 Dialogue and quoted terms styled with angle quotes («») per Spanish typography rules rather than English quotation marks',
      '🌊 Several lengthy Victorian English clauses restructured for natural Spanish literary prose rhythm without losing Harker\'s precise voice',
    ],
  },
  fr: {
    segments: [
      {
        id: 1,
        text: '3 mai. Bistritz. — Quitté Munich le 1er mai à 20 h 35 ; arrivé à Vienne tôt le lendemain matin ; j\'aurais dû arriver à 6 h 46, mais le train avait une heure de retard.',
        highlighted: true,
        editNote: 'Time format converted to French 24h convention (20 h 35); em dash spacing follows Académie française style',
      },
      {
        id: 2,
        text: 'Budapest semble un endroit merveilleux, d\'après l\'aperçu que j\'en ai eu depuis le train et le peu que j\'ai pu parcourir de ses rues. Je craignais de trop m\'éloigner de la gare, car nous étions arrivés en retard et devions repartir aussi ponctuellement que possible.',
        highlighted: false,
      },
      {
        id: 3,
        text: 'J\'avais l\'impression de quitter l\'Occident pour pénétrer en Orient ; le plus occidental des magnifiques ponts sur le Danube — dont les eaux sont ici d\'une largeur et d\'une profondeur remarquables — nous faisait entrer dans l\'univers des traditions de la domination ottomane.',
        highlighted: true,
        editNote: '"Turkish rule" rendered as "domination ottomane" — culturally precise term for French historical context',
      },
      {
        id: 4,
        text: 'Nous partîmes dans les délais et arrivâmes à Klausenburgh à la tombée de la nuit. Je m\'y arrêtai pour la nuit à l\'Hôtel Royale. J\'eus pour dîner — ou plutôt pour souper — un poulet préparé d\'une façon ou d\'une autre au piment rouge, qui était fort bon mais donnait soif.',
        highlighted: false,
      },
      {
        id: 5,
        text: '(Memo : obtenir la recette pour Mina.) J\'interrogeai le garçon, qui me dit que cela s\'appelait « paprika hendl », et que, s\'agissant d\'un plat national, je devrais pouvoir en trouver partout le long des Carpates.',
        highlighted: true,
        editNote: 'French guillemets (« ») used for the dish name; "waiter" translated as "garçon" — period-appropriate register for 1890s French',
      },
      {
        id: 6,
        text: 'Le peu d\'allemand que je possède m\'a été très utile ici ; à vrai dire, je ne sais pas comment je m\'en serais sorti sans cela.',
        highlighted: false,
      },
      {
        id: 7,
        text: 'Ayant un peu de temps devant moi avant de me rendre à la gare, je me rendis bien sûr à l\'inévitable Graben, où je vis exécuter de fort beaux travaux de ciselure en argent. Les habitants de Klausenburgh semblent fort aimables, et il y avait de nombreuses jolies jeunes femmes.',
        highlighted: true,
        editNote: '"Silver work" translated as "ciselure en argent" (silversmithing/chasing) — more precise craft term preserving the artisanal observation',
      },
      {
        id: 8,
        text: 'J\'avais demandé au cocher comment s\'appelait cette route ; il me dit qu\'il la connaissait sous le nom de « Via Transilvanica ». Je ne m\'attardai pas à poser davantage de questions, car nous avions un long voyage devant nous et la journée était déjà fort avancée.',
        highlighted: false,
      },
    ],
    editorialNotes: [
      '🕐 Time notation converted to standard French 24-hour format with proper spacing (20 h 35) per Académie française recommendations',
      '📜 Historical term "Turkish rule" replaced with "domination ottomane" — the precise French scholarly term that French readers expect in this context',
      '✒️ Craft terminology like "silver work" elevated to "ciselure en argent" to match the literary register of 19th-century French prose',
    ],
  },
  de: {
    segments: [
      {
        id: 1,
        text: '3. Mai. Bistritz. – Habe München am 1. Mai um 20:35 Uhr verlassen und bin früh am nächsten Morgen in Wien angekommen; sollte um 6:46 Uhr ankommen, aber der Zug hatte eine Stunde Verspätung.',
        highlighted: true,
        editNote: 'Diary entry reformatted to German convention: date with period, 24-hour clock, en-dash per Duden style',
      },
      {
        id: 2,
        text: 'Budapest scheint ein wunderbarer Ort zu sein, nach dem flüchtigen Eindruck, den ich vom Zug aus bekam und dem wenigen, das ich zu Fuß durch die Straßen erkunden konnte. Ich wagte mich nicht weit vom Bahnhof weg, da wir zu spät angekommen waren und so pünktlich wie möglich weiterfahren wollten.',
        highlighted: false,
      },
      {
        id: 3,
        text: 'Ich hatte das Gefühl, den Westen zu verlassen und in den Osten einzutreten; die westlichste der prächtigen Brücken über die Donau — die hier eine eindrucksvolle Breite und Tiefe aufweist — führte uns in die Überlieferungen der türkischen Herrschaft ein.',
        highlighted: false,
      },
      {
        id: 4,
        text: 'Wir brachen recht pünktlich auf und kamen nach Einbruch der Dunkelheit in Klausenburgh an. Dort übernachtete ich im Hotel Royale. Zum Abendessen — oder vielmehr zum Nachtmahl — bekam ich ein Huhn, das irgendwie mit rotem Pfeffer zubereitet war; es schmeckte sehr gut, machte aber durstig.',
        highlighted: true,
        editNote: '"Supper" rendered as "Nachtmahl" rather than "Abendessen" — regional Austrian/Carpathian register appropriate to the setting',
      },
      {
        id: 5,
        text: '(Notiz: Rezept für Mina besorgen.) Ich fragte den Kellner; er sagte, das Gericht heiße „Paprikahendl" und sei ein Nationalgericht, das ich überall in den Karpaten bekommen sollte.',
        highlighted: true,
        editNote: 'Dish name compounded as "Paprikahendl" per standard German orthography; German quotation marks („") applied throughout',
      },
      {
        id: 6,
        text: 'Meine bescheidenen Deutschkenntnisse erwiesen sich hier als äußerst nützlich; ich wüsste in der Tat nicht, wie ich ohne sie ausgekommen wäre.',
        highlighted: false,
      },
      {
        id: 7,
        text: 'Da ich noch etwas Zeit hatte, bevor ich zum Bahnhof musste, besuchte ich natürlich den unvermeidlichen Graben, wo ich beobachten konnte, wie einige sehr schöne Silberarbeiten angefertigt wurden. Die Menschen in Klausenburgh scheinen sehr freundlich zu sein, und es gab viele hübsche Mädchen.',
        highlighted: false,
      },
      {
        id: 8,
        text: 'Ich hatte den Kutscher nach dem Namen dieser Straße gefragt; er teilte mir mit, dass sie ihm als „Via Transilvanica" bekannt sei. Ich hielt nicht an, um weitere Erkundigungen einzuholen, da wir noch eine weite Reise vor uns hatten und der Tag bereits weit fortgeschritten war.',
        highlighted: true,
        editNote: '"He told me" softened to "er teilte mir mit" — elevated register matching the formal diary tone of German literary prose',
      },
    ],
    editorialNotes: [
      '🕐 All times converted to 24-hour German clock format with "Uhr" suffix per standard German convention (8:35 PM → 20:35 Uhr)',
      '🥘 Regional dialect nuance: "supper" rendered as "Nachtmahl" rather than "Abendessen" — reflects the Austrian-Carpathian setting accurately',
      '📝 German quotation marks („Paprikahendl") and compound noun rules applied throughout; register elevated to match the formal journal style',
    ],
  },
  pt: {
    segments: [
      {
        id: 1,
        text: '3 de maio. Bistritz. — Parti de Munique às 20h35 do dia 1.º de maio, chegando a Viena na manhã seguinte; devia ter chegado às 6h46, mas o comboio estava com uma hora de atraso.',
        highlighted: true,
        editNote: '"Train" rendered as "comboio" (European Portuguese) rather than "trem" (Brazilian) — correct register for target market',
      },
      {
        id: 2,
        text: 'Budapeste parece um lugar maravilhoso, pelo vislumbre que tive da janela do comboio e pelo pouco que pude percorrer das suas ruas. Receei afastar-me demasiado da estação, pois tínhamos chegado tarde e queríamos partir o mais pontualmente possível.',
        highlighted: false,
      },
      {
        id: 3,
        text: 'A impressão que tive foi a de que estávamos a deixar o Ocidente para entrar no Oriente; a mais ocidental das magníficas pontes sobre o Danúbio — que aqui apresenta uma largura e profundidade imponentes — conduziu-nos para as tradições do domínio turco.',
        highlighted: true,
        editNote: 'Gerund construction changed to "a deixar" — mandatory in European Portuguese (não o gerúndio brasileiro)',
      },
      {
        id: 4,
        text: 'Partimos com bastante pontualidade e chegámos a Klausenburgh depois de anoitecer. Aí fiquei no Hotel Royale. Ao jantar — ou melhor, à ceia — comi um frango preparado de algum modo com pimento vermelho, que era muito bom mas deixava sede.',
        highlighted: false,
      },
      {
        id: 5,
        text: '(Nota: obter a receita para a Mina.) Perguntei ao empregado de mesa, que disse chamar-se «paprika hendl»; como era um prato nacional, deveria consegui-lo em qualquer lugar ao longo dos Cárpatos.',
        highlighted: true,
        editNote: '"Waiter" translated as "empregado de mesa" — standard European Portuguese term; angle quotes used per Portuguese typography standard',
      },
      {
        id: 6,
        text: 'Os meus rudimentos de alemão revelaram-se muito úteis aqui; com efeito, não sei como me teria safado sem eles.',
        highlighted: false,
      },
      {
        id: 7,
        text: 'Como ainda tinha algum tempo antes de ir para a estação, fui, naturalmente, ao inevitável Graben, onde vi realizar-se um belo trabalho em prata. As pessoas de Klausenburgh parecem muito simpáticas, e havia muitas raparigas bonitas.',
        highlighted: true,
        editNote: '"Pretty girls" rendered as "raparigas bonitas" — natural European Portuguese; "moças" would read as Brazilian and break immersion',
      },
      {
        id: 8,
        text: 'Tinha perguntado ao cocheiro qual era o nome daquele caminho; ele disse conhecê-lo como «Via Transilvanica». Não me demorei a fazer mais perguntas, pois tínhamos uma longa viagem pela frente e o dia já ia adiantado.',
        highlighted: false,
      },
    ],
    editorialNotes: [
      '🚂 European Portuguese vocabulary maintained throughout: "comboio" (not "trem"), "empregado de mesa" (not "garçom"), "raparigas" (not "moças")',
      '✏️ Gerund constructions corrected from Brazilian to European form (e.g., "a deixar" instead of "deixando") — essential for Portuguese market',
      '📐 Angle quotes («») and date ordinals (1.º) applied per Imprensa Nacional-Casa da Moeda (INCM) typography guidelines',
    ],
  },
}

const LANGUAGES = [
  { code: 'es' as LangCode, label: 'ES', name: 'Spanish', flag: '🇪🇸' },
  { code: 'fr' as LangCode, label: 'FR', name: 'French', flag: '🇫🇷' },
  { code: 'de' as LangCode, label: 'DE', name: 'German', flag: '🇩🇪' },
  { code: 'pt' as LangCode, label: 'PT', name: 'Portuguese', flag: '🇵🇹' },
]

const translationNoteRows = [
  {
    original: '"The DA\'s office called"',
    translated: '"La oficina del fiscal llamó"',
    decision: "DA kept as 'fiscal' (District Attorney equivalent in Spain) rather than 'DA' — book is set in New York but using established Spanish legal term aids comprehension without relocating the story",
  },
  {
    original: '"She grabbed her piece from the holster"',
    translated: '"Sacó su arma de la funda"',
    decision: "'piece' (slang for gun) → 'arma' — direct slang equivalent doesn't exist in Spanish; 'arma' preserves the casual register without sounding clinical",
  },
  {
    original: '"The precinct was buzzing"',
    translated: '"La comisaría zumbaba de actividad"',
    decision: "'precinct' → 'comisaría' — standard Spanish equivalent; added 'de actividad' to preserve the idiomatic energy of 'buzzing'",
  },
  {
    original: '"He was read his Miranda rights"',
    translated: '"Le leyeron sus derechos Miranda"',
    decision: "Kept as 'derechos Miranda' — internationally recognised term; translating would obscure the American legal context",
  },
  {
    original: '"The perp walked in cuffed"',
    translated: '"El sospechoso entró esposado"',
    decision: "'perp' (police slang) → 'sospechoso' — no direct Spanish slang equivalent; formal term chosen to match Spanish police procedural convention",
  },
  {
    original: '"Off-duty cop at a diner"',
    translated: '"Un policía fuera de servicio en una cafetería"',
    decision: "'diner' → 'cafetería' — closest Spanish cultural equivalent for an American diner atmosphere",
  },
]

function TranslationNotesTab() {
  return (
    <div className="max-w-5xl mx-auto">
      {/* Header card */}
      <div className="bg-white rounded-3xl shadow-xl border border-blue-100 overflow-hidden mb-8">
        <div className="px-6 py-4 bg-gradient-to-r from-blue-50 to-violet-50 border-b border-blue-100 flex items-center gap-4">
          <div className="w-10 h-12 bg-gradient-to-br from-blue-500 to-violet-600 rounded-lg flex items-center justify-center shadow">
            <span className="text-white text-xl">📋</span>
          </div>
          <div>
            <h2 className="font-bold text-gray-900 text-lg" style={serifFont}>
              &ldquo;The Last Precinct&rdquo; by J.K. Harlow — Spanish Translation Notes
            </h2>
            <p className="text-sm text-gray-500">Crime thriller · New York setting · ES translation</p>
          </div>
        </div>
        <div className="px-6 py-5">
          <p className="text-gray-600 text-[15px] leading-relaxed">
            Every BookLingua translation includes a translator&apos;s notes table documenting key decisions.
            Here&apos;s a real example from a crime thriller:
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-3xl shadow-xl border border-blue-100 overflow-hidden mb-6">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gradient-to-r from-blue-600 to-violet-600 text-white">
                <th className="text-left px-6 py-4 font-semibold w-[22%]">Original</th>
                <th className="text-left px-6 py-4 font-semibold w-[22%]">Translated</th>
                <th className="text-left px-6 py-4 font-semibold">Editorial Decision</th>
              </tr>
            </thead>
            <tbody>
              {translationNoteRows.map((row, i) => (
                <tr
                  key={i}
                  className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}
                >
                  <td className="px-6 py-4 align-top">
                    <span className="font-medium text-gray-800 italic">{row.original}</span>
                  </td>
                  <td className="px-6 py-4 align-top" translate="no">
                    <span className="font-medium text-violet-700 italic">{row.translated}</span>
                  </td>
                  <td className="px-6 py-4 align-top text-gray-600 leading-snug">{row.decision}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer note */}
      <div className="flex items-center gap-3 px-6 py-4 bg-gradient-to-r from-violet-50 to-blue-50 rounded-2xl border border-violet-200">
        <span className="text-violet-600 text-xl flex-shrink-0">✅</span>
        <p className="text-[15px] text-gray-700 font-medium">
          Translation notes are included with every BookLingua order — no extra charge.
        </p>
      </div>
    </div>
  )
}

function LaunchPackTab() {
  const sections = [
    {
      number: '1',
      title: 'Amazon Backend Keywords',
      subtitle: 'Spanish market',
      icon: '🔑',
      content: (
        <ul className="space-y-2 mt-3" translate="no">
          {['ficción gótica vampiros', 'terror clásico literatura inglesa', 'drácula español traducción', 'horror victoriano novela', 'bram stoker español'].map((kw, i) => (
            <li key={i} className="flex items-center gap-2 text-[15px] text-gray-700">
              <span className="w-1.5 h-1.5 bg-blue-500 rounded-full flex-shrink-0" />
              {kw}
            </li>
          ))}
        </ul>
      ),
    },
    {
      number: '2',
      title: 'Ad Targeting Keywords',
      subtitle: 'PPC & AMS campaigns',
      icon: '🎯',
      content: (
        <div className="mt-3 space-y-3" translate="no">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Primary</p>
            <div className="flex flex-wrap gap-2">
              {['vampiros ficción', 'terror gótico español', 'clásicos literatura inglesa'].map((kw, i) => (
                <span key={i} className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">{kw}</span>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Long-tail</p>
            <div className="flex flex-wrap gap-2">
              {['novela vampiros adultos', 'terror victoriano español', 'bram stoker libro'].map((kw, i) => (
                <span key={i} className="px-3 py-1 bg-violet-100 text-violet-800 rounded-full text-sm font-medium">{kw}</span>
              ))}
            </div>
          </div>
        </div>
      ),
    },
    {
      number: '3',
      title: 'Category Recommendations',
      subtitle: 'KDP browse nodes',
      icon: '📂',
      content: (
        <ul className="space-y-2 mt-3">
          {[
            { label: 'Primary', value: 'Libros > Literatura y ficción > Terror > Vampiros' },
            { label: 'Secondary', value: 'Libros > Clásicos > Literatura inglesa' },
            { label: 'Browse node suggestion', value: 'Spanish Horror Classics' },
          ].map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-[15px] text-gray-700" translate="no">
              <span className="text-xs font-bold text-gray-400 mt-1 w-28 flex-shrink-0">{item.label}:</span>
              <span>{item.value}</span>
            </li>
          ))}
        </ul>
      ),
    },
    {
      number: '4',
      title: 'Review Strategy',
      subtitle: 'Pre-launch & launch',
      icon: '⭐',
      content: (
        <ul className="space-y-2 mt-3">
          {[
            'Target ARC readers in Spanish BookTok communities',
            'Approach Spanish gothic/horror book clubs on Instagram',
            'Submit to Spanish literary review blogs (El Rincón del Lector, etc.)',
            'Highlight the "Translated with editorial review" angle as authenticity signal',
          ].map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-[15px] text-gray-700">
              <span className="w-1.5 h-1.5 bg-violet-500 rounded-full mt-2 flex-shrink-0" />
              {item}
            </li>
          ))}
        </ul>
      ),
    },
    {
      number: '5',
      title: 'KDP Upload Checklist',
      subtitle: 'Before you publish',
      icon: '✅',
      content: (
        <ul className="space-y-2 mt-3">
          {[
            'Set primary marketplace to Amazon.es',
            'Use Spanish-language title and subtitle',
            'Write Spanish product description (500–600 words)',
            'Select correct Kindle categories for Spanish readers',
            'Set price to €9.99–€12.99 (Spanish market sweet spot)',
          ].map((item, i) => (
            <li key={i} className="flex items-center gap-2 text-[15px] text-gray-700">
              <span className="text-green-500 flex-shrink-0">✅</span>
              {item}
            </li>
          ))}
        </ul>
      ),
    },
  ]

  return (
    <div className="max-w-5xl mx-auto">
      {/* Intro */}
      <div className="bg-white rounded-3xl shadow-xl border border-blue-100 overflow-hidden mb-8">
        <div className="px-6 py-4 bg-gradient-to-r from-blue-50 to-violet-50 border-b border-blue-100 flex items-center gap-4">
          <div className="w-10 h-12 bg-gradient-to-br from-blue-500 to-violet-600 rounded-lg flex items-center justify-center shadow">
            <span className="text-white text-xl">🚀</span>
          </div>
          <div>
            <h2 className="font-bold text-gray-900 text-lg" style={serifFont}>
              Launch Strategy Pack — Sample
            </h2>
            <p className="text-sm text-gray-500">Dracula · Spanish translation · Amazon KDP</p>
          </div>
        </div>
        <div className="px-6 py-5">
          <p className="text-gray-600 text-[15px] leading-relaxed">
            The Launch Strategy Pack gives you everything you need to publish and promote your translated book on Amazon KDP.
            Here&apos;s a sample for a Spanish translation:
          </p>
        </div>
      </div>

      {/* Section cards */}
      <div className="grid sm:grid-cols-2 gap-5 mb-8">
        {sections.map((section) => (
          <div key={section.number} className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 bg-gradient-to-r from-blue-600 to-violet-600 flex items-center gap-3">
              <span className="w-7 h-7 bg-white/20 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                {section.number}
              </span>
              <div>
                <p className="text-white font-semibold text-sm">{section.icon} {section.title}</p>
                <p className="text-white/70 text-xs">{section.subtitle}</p>
              </div>
            </div>
            <div className="px-5 py-4">
              {section.content}
            </div>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div className="bg-gradient-to-r from-blue-600 to-violet-600 rounded-3xl p-8 text-center text-white">
        <p className="text-xl font-bold mb-2" style={serifFont}>Ready to launch your translation?</p>
        <p className="text-white/80 mb-6 text-[15px]">
          Add the Launch Strategy Pack to your translation order for{' '}
          <span className="font-bold text-white text-lg">$29/language</span>
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-8 py-3.5 bg-white text-violet-700 rounded-2xl font-bold text-base shadow-xl hover:shadow-2xl hover:-translate-y-0.5 transition-all"
        >
          <span>Start Translating</span>
          <span>→</span>
        </Link>
      </div>
    </div>
  )
}

export default function ExamplesPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('es')
  const [hoveredNote, setHoveredNote] = useState<string | null>(null)

  const isLangTab = activeTab === 'es' || activeTab === 'fr' || activeTab === 'de' || activeTab === 'pt'
  const activeLang = isLangTab ? (activeTab as LangCode) : 'es'
  const currentTranslation = translations[activeLang]
  const currentLang = LANGUAGES.find(l => l.code === activeLang)!

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-violet-50">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=swap');`}</style>

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-8 py-6 max-w-7xl mx-auto">
        <Link href="/" className="flex items-center gap-3">
          <Logo size="md" />
          <span className="text-2xl font-bold text-gray-800" style={serifFont}>BookLingua</span>
        </Link>
        <div className="flex items-center gap-6">
          <Link href="/publishers" className="text-gray-600 hover:text-violet-700 font-medium transition-colors hidden sm:block">
            Publishers
          </Link>
          <Link
            href="/"
            className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-violet-600 text-white rounded-full font-semibold shadow-lg hover:shadow-xl transition-all"
          >
            Start Translating
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden pt-12 pb-20">
        <div className="absolute inset-0 opacity-30 pointer-events-none">
          <div className="absolute top-10 left-10 w-72 h-72 bg-blue-200 rounded-full blur-3xl" />
          <div className="absolute top-20 right-20 w-96 h-96 bg-violet-200 rounded-full blur-3xl" />
        </div>

        <div className="relative z-10 max-w-4xl mx-auto px-8 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/80 rounded-full text-sm font-medium text-violet-700 mb-8">
            <span className="w-2 h-2 bg-yellow-400 rounded-full" />
            Yellow highlights = editorial improvements
          </div>

          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 leading-tight mb-6" style={serifFont}>
            See BookLingua
            <span className="block bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-transparent">
              in Action
            </span>
          </h1>

          <p className="text-xl text-gray-600 leading-relaxed max-w-2xl mx-auto mb-4">
            Every BookLingua translation goes through two passes: an AI translation layer, then an{' '}
            <strong className="text-violet-700">editorial review</strong> that refines idioms, adapts cultural
            conventions, and ensures your book reads as if it were written for that market.
          </p>
          <p className="text-base text-gray-500 max-w-xl mx-auto">
            Below is the opening of <em>Dracula</em> by Bram Stoker (public domain) translated into all four
            BookLingua languages. Highlighted passages show where our editorial pass made improvements.
          </p>
        </div>
      </section>

      {/* Tab Selector */}
      <div className="sticky top-0 z-20 bg-white/90 backdrop-blur-sm border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-8">
          <div className="flex items-center gap-2 py-4 overflow-x-auto">
            <span className="text-sm font-medium text-gray-500 mr-2 whitespace-nowrap">Explore:</span>
            {LANGUAGES.map(lang => (
              <button
                key={lang.code}
                onClick={() => setActiveTab(lang.code)}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-full font-semibold text-sm transition-all whitespace-nowrap ${
                  activeTab === lang.code
                    ? 'bg-gradient-to-r from-blue-600 to-violet-600 text-white shadow-md'
                    : 'bg-white border-2 border-gray-200 text-gray-600 hover:border-violet-300'
                }`}
              >
                <span>{lang.flag}</span>
                <span>{lang.name}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded font-bold ${
                  activeTab === lang.code ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
                }`}>{lang.label}</span>
              </button>
            ))}

            {/* Divider */}
            <div className="w-px h-8 bg-gray-200 mx-1 flex-shrink-0" />

            {/* Translation Notes tab */}
            <button
              onClick={() => setActiveTab('notes')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-full font-semibold text-sm transition-all whitespace-nowrap ${
                activeTab === 'notes'
                  ? 'bg-gradient-to-r from-blue-600 to-violet-600 text-white shadow-md'
                  : 'bg-white border-2 border-gray-200 text-gray-600 hover:border-violet-300'
              }`}
            >
              <span>📋</span>
              <span>Translation Notes</span>
            </button>

            {/* Launch Pack tab */}
            <button
              onClick={() => setActiveTab('launch')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-full font-semibold text-sm transition-all whitespace-nowrap ${
                activeTab === 'launch'
                  ? 'bg-gradient-to-r from-blue-600 to-violet-600 text-white shadow-md'
                  : 'bg-white border-2 border-gray-200 text-gray-600 hover:border-violet-300'
              }`}
            >
              <span>🚀</span>
              <span>Launch Pack</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <section className="max-w-7xl mx-auto px-8 py-12">

        {/* ── Translation Notes tab ── */}
        {activeTab === 'notes' && <TranslationNotesTab />}

        {/* ── Launch Pack tab ── */}
        {activeTab === 'launch' && <LaunchPackTab />}

        {/* ── Language translation tabs ── */}
        {isLangTab && (
          <>
            {/* Source info */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-12 bg-gradient-to-br from-blue-500 to-violet-600 rounded-lg flex items-center justify-center shadow">
                  <span className="text-white text-xl">📘</span>
                </div>
                <div>
                  <h2 className="font-bold text-gray-900" style={serifFont}>Dracula — Chapter I</h2>
                  <p className="text-sm text-gray-500">Bram Stoker, 1897 · Public Domain · ~400 words</p>
                </div>
              </div>
              <div className="hidden md:flex items-center gap-4 text-sm text-gray-500">
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 bg-yellow-100 border border-yellow-300 rounded inline-block" />
                  Editorial improvement highlighted
                </span>
                <span className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-3 py-1">
                  ⚠️ Disable browser auto-translate to see the full effect
                </span>
              </div>
            </div>

            {/* Side-by-side columns */}
            <div className="grid lg:grid-cols-2 gap-6 mb-8">
              {/* Original */}
              <div className="bg-white rounded-3xl shadow-xl border border-blue-100 overflow-hidden">
                <div className="px-6 py-4 bg-gradient-to-r from-blue-50 to-slate-50 border-b border-blue-100 flex items-center gap-3">
                  <span className="text-lg">🇬🇧</span>
                  <div>
                    <p className="font-bold text-gray-900 text-sm">Original English</p>
                    <p className="text-xs text-gray-500">Source text</p>
                  </div>
                </div>
                <div className="p-6 leading-relaxed text-gray-800 space-y-4" style={serifFont}>
                  {originalText.map(para => (
                    <p key={para.id} className="text-[15px] leading-7">{para.text}</p>
                  ))}
                </div>
              </div>

              {/* Translation — translate="no" prevents Chrome/Safari auto-translate */}
              <div className="bg-white rounded-3xl shadow-xl border border-violet-100 overflow-hidden" translate="no">
                <div className="px-6 py-4 bg-gradient-to-r from-violet-50 to-blue-50 border-b border-violet-100 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">{currentLang.flag}</span>
                    <div>
                      <p className="font-bold text-gray-900 text-sm">{currentLang.name} Translation</p>
                      <p className="text-xs text-gray-500">BookLingua · AI + Editorial Review</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-50 border border-yellow-200 rounded-full">
                    <span className="w-2.5 h-2.5 bg-yellow-300 rounded-sm inline-block" />
                    <span className="text-xs font-medium text-yellow-800">
                      {currentTranslation.segments.filter(s => s.highlighted).length} edits
                    </span>
                  </div>
                </div>
                <div className="p-6 leading-relaxed text-gray-800 space-y-4" style={serifFont}>
                  {currentTranslation.segments.map(seg => (
                    <div key={seg.id} className="relative group">
                      {seg.highlighted ? (
                        <p className="text-[15px] leading-7">
                          <span
                            className="bg-yellow-100 border-b-2 border-yellow-300 rounded-sm px-0.5 cursor-help transition-colors hover:bg-yellow-200"
                            onMouseEnter={() => setHoveredNote(seg.id.toString())}
                            onMouseLeave={() => setHoveredNote(null)}
                          >
                            {seg.text}
                          </span>
                          {hoveredNote === seg.id.toString() && seg.editNote && (
                            <span className="absolute left-0 top-full mt-1 z-30 w-72 bg-gray-900 text-white text-xs rounded-xl px-3 py-2 shadow-xl leading-snug pointer-events-none">
                              ✏️ <strong>Editorial note:</strong> {seg.editNote}
                            </span>
                          )}
                        </p>
                      ) : (
                        <p className="text-[15px] leading-7">{seg.text}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Editorial Notes */}
            <div className="bg-gradient-to-br from-violet-50 to-blue-50 rounded-3xl p-8 border border-violet-200 mb-16">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-blue-600 rounded-xl flex items-center justify-center text-white font-bold text-lg shadow">
                  2
                </div>
                <div>
                  <h3 className="font-bold text-gray-900" style={serifFont}>What the Editorial Pass Improved</h3>
                  <p className="text-sm text-gray-500">{currentLang.name} — specific improvements made beyond raw translation</p>
                </div>
              </div>
              <ul className="space-y-3">
                {currentTranslation.editorialNotes.map((note, i) => (
                  <li key={i} className="flex items-start gap-3 text-gray-700">
                    <span className="mt-0.5 flex-shrink-0 w-5 h-5 bg-violet-600 text-white rounded-full text-xs flex items-center justify-center font-bold">
                      {i + 1}
                    </span>
                    <span className="text-[15px] leading-6">{note}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Legend */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-16 max-w-2xl mx-auto">
              <h4 className="font-bold text-gray-900 text-center mb-4" style={serifFont}>How to Read the Highlights</h4>
              <div className="grid sm:grid-cols-2 gap-4 text-sm text-gray-600">
                <div className="flex items-start gap-3">
                  <span className="bg-yellow-100 border-b-2 border-yellow-300 px-2 py-0.5 rounded text-xs font-medium text-gray-800 whitespace-nowrap mt-0.5">highlighted text</span>
                  <span>This passage was modified by the editorial pass — hover to see the reason</span>
                </div>
                <div className="flex items-start gap-3">
                  <span className="bg-white border border-gray-200 px-2 py-0.5 rounded text-xs font-medium text-gray-800 whitespace-nowrap mt-0.5">plain text</span>
                  <span>Translation pass output accepted as-is — no editorial change needed</span>
                </div>
              </div>
            </div>

            {/* Language switcher teaser */}
            <div className="text-center mb-20">
              <p className="text-gray-500 mb-4 text-sm">Switch language to compare translations →</p>
              <div className="flex items-center justify-center gap-3 flex-wrap">
                {LANGUAGES.filter(l => l.code !== activeLang).map(lang => (
                  <button
                    key={lang.code}
                    onClick={() => setActiveTab(lang.code)}
                    className="flex items-center gap-2 px-4 py-2 bg-white border-2 border-gray-200 rounded-full text-sm font-medium text-gray-700 hover:border-violet-400 transition-all"
                  >
                    {lang.flag} {lang.name}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

      </section>

      {/* CTA */}
      <section className="py-24 bg-gradient-to-r from-blue-600 to-violet-600 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-10 left-20 w-64 h-64 bg-white rounded-full blur-3xl" />
          <div className="absolute bottom-10 right-20 w-80 h-80 bg-white rounded-full blur-3xl" />
        </div>
        <div className="relative z-10 max-w-3xl mx-auto px-8 text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6" style={serifFont}>
            Ready to translate your book?
          </h2>
          <p className="text-xl text-white/80 mb-10 max-w-xl mx-auto">
            Upload your manuscript and get a professional AI translation with full editorial review — 
            formatting preserved, changes highlighted for your approval.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-3 px-10 py-5 bg-white text-violet-700 rounded-2xl font-bold text-xl shadow-2xl hover:shadow-3xl hover:-translate-y-1 transition-all"
          >
            <span>Translate Your Book</span>
            <span>→</span>
          </Link>
          <div className="flex items-center justify-center gap-8 mt-12 text-white/70 text-sm flex-wrap">
            <span>✓ EPUB, PDF, DOCX, TXT</span>
            <span>✓ Formatting preserved</span>
            <span>✓ 4 languages available</span>
            <span>✓ Bundle & save up to 37%</span>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-12">
        <div className="max-w-7xl mx-auto px-8 text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Logo size="sm" />
            <span className="text-xl font-bold text-white" style={serifFont}>BookLingua</span>
          </div>
          <p className="mb-2">© 2025 BookLingua. All rights reserved.</p>
          <p className="text-xs text-gray-600">
            Sample text: <em>Dracula</em> by Bram Stoker (1897) — public domain
          </p>
        </div>
      </footer>
    </div>
  )
}
