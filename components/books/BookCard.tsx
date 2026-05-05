import Link from "next/link"
import { Cover } from "@/components/ui/Cover"
import { Badge } from "@/components/ui/Badge"
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
        <p className="line-clamp-2 font-serif text-[15px] leading-tight text-ink">{book.title}</p>
        {book.author ? (
          <p className="mt-1 line-clamp-1 text-[12px] text-ink-3">{book.author}</p>
        ) : null}
        {book.type === "PHYSICAL" ? (
          <Badge tone="warn" className="mt-2">
            Physique
          </Badge>
        ) : null}
      </div>
    </Link>
  )
}
