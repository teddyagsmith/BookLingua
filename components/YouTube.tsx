export default function YouTube({ id }: { id: string }) {
  return (
    <div className="my-8 aspect-video w-full overflow-hidden rounded-2xl border border-[#EBE6F4] shadow-lg">
      <iframe
        src={`https://www.youtube.com/embed/${id}`}
        title="YouTube video player"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        className="h-full w-full"
      />
    </div>
  )
}
