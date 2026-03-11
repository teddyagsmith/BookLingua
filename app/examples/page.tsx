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

export default function ExamplesPage() {
  const [activeLang, setActiveLang] = useState<LangCode>('es')
  const [hoveredNote, setHoveredNote] = useState<string | null>(null)

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
        <Link
          href="/"
          className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-violet-600 text-white rounded-full font-semibold shadow-lg hover:shadow-xl transition-all"
        >
          Start Translating
        </Link>
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
            <span className="text-sm font-medium text-gray-500 mr-2 whitespace-nowrap">Translate to:</span>
            {LANGUAGES.map(lang => (
              <button
                key={lang.code}
                onClick={() => setActiveLang(lang.code)}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-full font-semibold text-sm transition-all whitespace-nowrap ${
                  activeLang === lang.code
                    ? 'bg-gradient-to-r from-blue-600 to-violet-600 text-white shadow-md'
                    : 'bg-white border-2 border-gray-200 text-gray-600 hover:border-violet-300'
                }`}
              >
                <span>{lang.flag}</span>
                <span>{lang.name}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded font-bold ${
                  activeLang === lang.code ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
                }`}>{lang.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <section className="max-w-7xl mx-auto px-8 py-12">

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
                onClick={() => setActiveLang(lang.code)}
                className="flex items-center gap-2 px-4 py-2 bg-white border-2 border-gray-200 rounded-full text-sm font-medium text-gray-700 hover:border-violet-400 transition-all"
              >
                {lang.flag} {lang.name}
              </button>
            ))}
          </div>
        </div>

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
