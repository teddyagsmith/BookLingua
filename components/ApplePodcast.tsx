interface ApplePodcastProps {
  src: string
  title: string
  appleUrl: string
}

export default function ApplePodcast({ src, title, appleUrl }: ApplePodcastProps) {
  return (
    <div className="not-prose my-8 rounded-2xl border border-[#DDD6EC] bg-white p-4 shadow-sm sm:p-5">
      <iframe
        title={title}
        src={src}
        className="block h-[175px] w-full overflow-hidden rounded-xl border-0 bg-white"
        allow="autoplay *; encrypted-media *; fullscreen *; clipboard-write"
        loading="lazy"
      />
      <a href={appleUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex text-sm font-semibold text-[#5B4B8A] hover:text-[#7B6CA8]">
        Listen on Apple Podcasts →
      </a>
    </div>
  )
}
