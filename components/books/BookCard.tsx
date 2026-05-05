import Link from "next/link"
import { Cover } from "@/components/ui/Cover"
import { FormatBadge, TypeBadge } from "@/components/books/Badges"
import type { BookListed } from "@/lib/books"

type BookCardProps = { book: BookListed }

export function BookCard({ book }: BookCardProps) {
  return (
    <Link
      href={`/bibliotheque/${book.id}`}
      className="group flex flex-col gap-3 rounded-lg p-2 transition hover:bg-paper-2/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]"
    >
      <Cover
        title={book.title}
        author={book.author}
        format={book.format}
        src={book.coverUrl}
        className="transition group-hover:translate-y-[-1px] group-hover:shadow-[var(--shadow-2)]"
      />
      <div>
        <p className="line-clamp-2 font-serif text-[13px] leading-tight text-ink">{book.title}</p>
        {book.author ? (
          <p className="mt-0.5 line-clamp-1 text-[11px] text-ink-3">{book.author}</p>
        ) : null}
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {book.format ? <FormatBadge format={book.format} /> : null}
          {book.type === "PHYSICAL" ? <TypeBadge type="PHYSICAL" /> : null}
        </div>
      </div>
    </Link>
  )
}
