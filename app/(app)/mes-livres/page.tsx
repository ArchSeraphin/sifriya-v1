import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { PUBLIC_BOOK_SELECT } from "@/lib/books"
import { BookGrid } from "@/components/books/BookGrid"
import { AddBookButton } from "@/components/books/AddBookButton"
import { BookMarked } from "lucide-react"

export const metadata: Metadata = {
  title: "Mes livres"
}

export const dynamic = "force-dynamic"

export default async function MesLivresPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect("/login")

  const books = await db.book.findMany({
    where: { copies: { some: { addedById: session.user.id } } },
    orderBy: { addedAt: "desc" },
    select: PUBLIC_BOOK_SELECT
  })

  const readings = await db.reading.findMany({
    where: {
      userId: session.user.id,
      bookId: { in: books.map((b) => b.id) }
    },
    select: { bookId: true, status: true }
  })
  const readingByBookId = new Map(readings.map((r) => [r.bookId, r.status] as const))

  return (
    <section className="mx-auto max-w-6xl">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-serif text-3xl text-ink">Mes livres</h1>
          <p className="mt-1 text-sm text-ink-3">
            {books.length} {books.length > 1 ? "livres ajoutes" : "livre ajoute"} par vous.
          </p>
        </div>
        <div className="md:hidden">
          <AddBookButton size="sm" />
        </div>
      </header>

      {books.length === 0 ? (
        <div className="mx-auto flex max-w-md flex-col items-center rounded-2xl border border-dashed border-[var(--rule)] bg-paper-2/40 px-6 py-14 text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-[#5a4711]">
            <BookMarked size={20} />
          </div>
          <h2 className="mt-4 font-serif text-xl text-ink">Vous n&apos;avez pas encore ajoute de livre</h2>
          <p className="mt-2 text-[13px] text-ink-3">
            Vos prochaines lectures partagees commencent ici.
          </p>
          <div className="mt-5">
            <AddBookButton />
          </div>
        </div>
      ) : (
        <BookGrid books={books} readingByBookId={readingByBookId} showLibraryBadge />
      )}
    </section>
  )
}
