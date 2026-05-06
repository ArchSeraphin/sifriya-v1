import Link from "next/link"
import { Cover } from "@/components/ui/Cover"
import { FormatBadge, TypeBadge } from "@/components/books/Badges"
import { digitalFormats, physicalCount } from "@/lib/books"
import type { BookListed } from "@/lib/books"
import type { ReadingStatus } from "@prisma/client"
import { BookmarkButton } from "@/components/books/BookmarkButton"

type BookCardProps = {
  book: BookListed
  readingStatus?: ReadingStatus | null
}

export function BookCard({ book, readingStatus }: BookCardProps) {
  const formats = digitalFormats(book)
  const physicals = physicalCount(book)

  return (
    <Link
      href={`/bibliotheque/${book.id}`}
      className="group flex flex-col gap-3 rounded-lg p-2 transition hover:bg-paper-2/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]"
    >
      <div className="relative">
        {readingStatus !== undefined ? (
          <BookmarkButton bookId={book.id} status={readingStatus ?? null} />
        ) : null}
        <Cover
          title={book.title}
          author={book.author}
          format={formats[0] ?? null}
          src={book.coverUrl}
          className="transition group-hover:translate-y-[-1px] group-hover:shadow-[var(--shadow-2)]"
        />
      </div>
      <div>
        <p className="line-clamp-2 font-serif text-[13px] leading-tight text-ink">{book.title}</p>
        {book.author ? (
          <p className="mt-0.5 line-clamp-1 text-[11px] text-ink-3">{book.author}</p>
        ) : null}
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {formats.map((f) => (
            <FormatBadge key={f} format={f} />
          ))}
          {physicals > 0 ? (
            <TypeBadge type="PHYSICAL" />
          ) : null}
        </div>
      </div>
    </Link>
  )
}
