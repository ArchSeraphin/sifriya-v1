import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import type { Prisma } from "@prisma/client"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { ListQuery, orderByForSort, PUBLIC_BOOK_SELECT } from "@/lib/books"
import { BookGrid } from "@/components/books/BookGrid"
import { BookList } from "@/components/books/BookList"
import { BibliothequeToolbar } from "@/components/books/BibliothequeToolbar"
import { Pagination } from "@/components/books/Pagination"
import { AddBookButton } from "@/components/books/AddBookButton"
import { Library } from "lucide-react"

export const metadata: Metadata = {
  title: "Bibliotheque"
}

export const dynamic = "force-dynamic"

type SearchParams = Record<string, string | string[] | undefined>

function flatten(params: SearchParams): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === "string") out[k] = v
    else if (Array.isArray(v) && v.length > 0) out[k] = v[0]!
  }
  return out
}

export default async function BibliothequePage({
  searchParams
}: {
  searchParams: Promise<SearchParams>
}) {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect("/login")

  const raw = flatten(await searchParams)
  const view = raw.view === "list" ? "list" : "grid"
  const parsed = ListQuery.safeParse(raw)
  const params = parsed.success
    ? parsed.data
    : ListQuery.parse({})

  const where: Prisma.BookWhereInput = {}
  if (params.q) {
    where.OR = [
      { title: { contains: params.q, mode: "insensitive" } },
      { author: { contains: params.q, mode: "insensitive" } },
      { isbn: { contains: params.q, mode: "insensitive" } }
    ]
  }

  // type et format sont sur BookCopy — filtrer via copies.some({...})
  const copyFilters: Prisma.BookCopyWhereInput = {}
  if (params.type) copyFilters.type = params.type
  if (params.format) {
    copyFilters.type = "DIGITAL"
    copyFilters.format = params.format
  }
  if (Object.keys(copyFilters).length > 0) {
    where.copies = { some: copyFilters }
  }

  const [total, books] = await Promise.all([
    db.book.count({ where }),
    db.book.findMany({
      where,
      orderBy: orderByForSort[params.sort],
      skip: (params.page - 1) * params.limit,
      take: params.limit,
      select: PUBLIC_BOOK_SELECT
    })
  ])

  const readings = await db.reading.findMany({
    where: {
      userId: session.user.id,
      bookId: { in: books.map((b) => b.id) }
    },
    select: { bookId: true, status: true }
  })
  const readingByBookId = new Map(readings.map((r) => [r.bookId, r.status] as const))

  const totalPages = Math.max(1, Math.ceil(total / params.limit))
  const hrefForPage = (n: number) => buildHref({ ...raw, page: String(n) })

  return (
    <section className="mx-auto max-w-6xl">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-serif text-3xl text-ink">Bibliotheque</h1>
          <p className="mt-1 text-sm text-ink-3">
            {params.q ? <>Resultats pour <em>&quot;{params.q}&quot;</em></> : "Le catalogue partage."}
          </p>
        </div>
        <div className="md:hidden">
          <AddBookButton size="sm" />
        </div>
      </header>

      <BibliothequeToolbar total={total} />

      {books.length === 0 ? (
        <EmptyState hasSearch={Boolean(params.q)} />
      ) : view === "list" ? (
        <BookList books={books} />
      ) : (
        <BookGrid books={books} readingByBookId={readingByBookId} />
      )}

      <Pagination page={params.page} totalPages={totalPages} hrefForPage={hrefForPage} />
    </section>
  )
}

function buildHref(params: Record<string, string | undefined>): string {
  const usp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") usp.set(k, v)
  }
  const qs = usp.toString()
  return qs ? `/bibliotheque?${qs}` : "/bibliotheque"
}

function EmptyState({ hasSearch }: { hasSearch: boolean }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center rounded-2xl border border-dashed border-[var(--rule)] bg-paper-2/40 px-6 py-14 text-center">
      <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-[#5a4711]">
        <Library size={20} />
      </div>
      <h2 className="mt-4 font-serif text-xl text-ink">
        {hasSearch ? "Aucun livre trouve" : "La bibliotheque est vide"}
      </h2>
      <p className="mt-2 text-[13px] text-ink-3">
        {hasSearch
          ? "Affinez votre recherche ou consultez tous les livres."
          : "Soyez le premier a deposer un livre — il apparaitra ici instantanement."}
      </p>
      <div className="mt-5">
        {hasSearch ? (
          <Link
            href="/bibliotheque"
            className="text-[13px] text-ink-2 underline underline-offset-2 hover:text-ink"
          >
            Voir tous les livres
          </Link>
        ) : (
          <AddBookButton />
        )}
      </div>
    </div>
  )
}
