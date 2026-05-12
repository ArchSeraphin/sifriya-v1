import { BookCard } from "@/components/books/BookCard"
import type { BookListed } from "@/lib/books"
import type { ReadingStatus } from "@prisma/client"

type Props = {
  books: BookListed[]
  readingByBookId?: Map<string, ReadingStatus>
  showLibraryBadge?: boolean
}

export function BookGrid({ books, readingByBookId, showLibraryBadge }: Props) {
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {books.map((book) => (
        <li key={book.id}>
          <BookCard
            book={book}
            readingStatus={readingByBookId ? (readingByBookId.get(book.id) ?? null) : undefined}
            showLibraryBadge={showLibraryBadge}
          />
        </li>
      ))}
    </ul>
  )
}
