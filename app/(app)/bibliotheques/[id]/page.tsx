import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import type { Prisma } from "@prisma/client"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { ListQuery, orderByForSort, selectVisibleBook } from "@/lib/books"
import { isLibraryVisible, canManageLibrary } from "@/lib/libraries"
import { BookGrid } from "@/components/books/BookGrid"
import { BookList } from "@/components/books/BookList"
import { BibliothequeToolbar } from "@/components/books/BibliothequeToolbar"
import { Pagination } from "@/components/books/Pagination"
import { AddBookButton } from "@/components/books/AddBookButton"
import { Library } from "lucide-react"

export const dynamic = "force-dynamic"

type SearchParams = Record<string, string | string[] | undefined>

type Props = {
  params: Promise<{ id: string }>
  searchParams: Promise<SearchParams>
}

function flatten(params: SearchParams): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === "string") out[k] = v
    else if (Array.isArray(v) && v.length > 0) out[k] = v[0]!
  }
  return out
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user) return { title: "Bibliotheque" }

  const visible = await isLibraryVisible(db, session.user.id, id)
  if (!visible) return { title: "Bibliotheque" }

  const library = await db.library.findUnique({
    where: { id },
    select: { name: true }
  })
  return { title: library?.name ?? "Bibliotheque" }
}

export default async function BibliothequeScopedPage({ params, searchParams }: Props) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect("/login")

  const [visible, library, canManage] = await Promise.all([
    isLibraryVisible(db, session.user.id, id),
    db.library.findUnique({
      where: { id },
      include: {
        manager: { select: { id: true, name: true } },
        _count: { select: { copies: true, memberships: true } }
      }
    }),
    canManageLibrary(db, session.user.id, id)
  ])
  if (!visible || !library) notFound()

  const raw = flatten(await searchParams)
  const view = raw.view === "list" ? "list" : "grid"
  const parsed = ListQuery.safeParse(raw)
  const queryParams = parsed.success ? parsed.data : ListQuery.parse({})

  const where: Prisma.BookWhereInput = {}
  if (queryParams.q) {
    where.OR = [
      { title: { contains: queryParams.q, mode: "insensitive" } },
      { author: { contains: queryParams.q, mode: "insensitive" } },
      { isbn: { contains: queryParams.q, mode: "insensitive" } }
    ]
  }

  // Scope toujours par libraryId (+ filtres optionnels sur copies)
  const copyFilters: Prisma.BookCopyWhereInput = { libraryId: id }
  if (queryParams.type) copyFilters.type = queryParams.type
  if (queryParams.format) {
    copyFilters.type = "DIGITAL"
    copyFilters.format = queryParams.format
  }
  where.copies = { some: copyFilters }

  const [total, books] = await Promise.all([
    db.book.count({ where }),
    db.book.findMany({
      where,
      orderBy: orderByForSort[queryParams.sort],
      skip: (queryParams.page - 1) * queryParams.limit,
      take: queryParams.limit,
      select: selectVisibleBook([id])
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

  const totalPages = Math.max(1, Math.ceil(total / queryParams.limit))
  const buildHref = (overrides: Record<string, string | undefined>): string => {
    const usp = new URLSearchParams()
    for (const [k, v] of Object.entries({ ...raw, ...overrides })) {
      if (typeof v === "string" && v !== "") usp.set(k, v)
    }
    const qs = usp.toString()
    return qs ? `/bibliotheques/${id}?${qs}` : `/bibliotheques/${id}`
  }
  const hrefForPage = (n: number) => buildHref({ page: String(n) })

  return (
    <section className="mx-auto max-w-6xl">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-serif text-3xl text-ink">{library.name}</h1>
          {library.description ? (
            <p className="mt-1 text-sm text-ink-3">{library.description}</p>
          ) : null}
          <p className="mt-2 text-[13px] text-ink-3">
            {library._count.copies} {library._count.copies > 1 ? "exemplaires" : "exemplaire"}
            {" - "}
            {library._count.memberships} {library._count.memberships > 1 ? "membres" : "membre"}
            {library.manager ? <> - Gerant : {library.manager.name ?? "—"}</> : null}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canManage ? (
            <Link
              href={`/admin/bibliotheques/${id}`}
              className="inline-flex h-9 items-center rounded-md border border-[var(--rule)] bg-paper px-4 text-[14px] text-ink shadow-[var(--shadow-1)] transition hover:bg-paper-2"
            >
              Gerer la bibliotheque
            </Link>
          ) : null}
          <div className="md:hidden">
            <AddBookButton size="sm" />
          </div>
        </div>
      </header>

      <BibliothequeToolbar total={total} />

      {books.length === 0 ? (
        <EmptyState hasSearch={Boolean(queryParams.q)} libraryName={library.name} />
      ) : view === "list" ? (
        <BookList books={books} />
      ) : (
        <BookGrid books={books} readingByBookId={readingByBookId} />
      )}

      <Pagination page={queryParams.page} totalPages={totalPages} hrefForPage={hrefForPage} />
    </section>
  )
}

function EmptyState({ hasSearch, libraryName }: { hasSearch: boolean; libraryName: string }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center rounded-2xl border border-dashed border-[var(--rule)] bg-paper-2/40 px-6 py-14 text-center">
      <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-[#5a4711]">
        <Library size={20} />
      </div>
      <h2 className="mt-4 font-serif text-xl text-ink">
        {hasSearch ? "Aucun livre trouve" : `Aucun livre dans ${libraryName}`}
      </h2>
      <p className="mt-2 text-[13px] text-ink-3">
        {hasSearch
          ? "Affinez votre recherche."
          : "Soyez le premier a deposer un livre dans cette bibliotheque."}
      </p>
      <div className="mt-5">{hasSearch ? null : <AddBookButton />}</div>
    </div>
  )
}
