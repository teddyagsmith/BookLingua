interface ArticleVideoProps {
  src: string
  poster?: string
  captions?: string
  title: string
}

export default function ArticleVideo({ src, poster, captions, title }: ArticleVideoProps) {
  return (
    <figure className="not-prose my-10 overflow-hidden rounded-2xl border border-[#E2D9F3] bg-white shadow-sm">
      <video
        controls
        playsInline
        preload="metadata"
        poster={poster}
        aria-label={title}
        className="aspect-video w-full bg-black object-cover"
      >
        <source src={src} type="video/mp4" />
        {captions && (
          <track
            default
            kind="captions"
            src={captions}
            srcLang="en"
            label="English"
          />
        )}
        Your browser does not support embedded video.
      </video>
      <figcaption className="px-5 py-4 text-sm leading-6 text-gray-600">
        {title}
      </figcaption>
    </figure>
  )
}
