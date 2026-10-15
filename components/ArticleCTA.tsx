interface ArticleCTAProps {
  href: string
  title: string
  text?: string
  button: string
}

export default function ArticleCTA({ href, title, text, button }: ArticleCTAProps) {
  return (
    <aside className="not-prose my-10 rounded-3xl bg-[#5B4B8A] px-6 py-8 text-center text-white shadow-lg sm:px-10">
      <h2 className="font-serif text-2xl font-bold sm:text-3xl">{title}</h2>
      {text && <p className="mx-auto mt-3 max-w-xl leading-relaxed text-white/85">{text}</p>}
      <a href={href} className="mt-6 inline-flex rounded-xl bg-white px-6 py-3 font-bold text-[#5B4B8A] shadow-sm transition-transform hover:-translate-y-0.5">
        {button} →
      </a>
    </aside>
  )
}
