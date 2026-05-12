import type { Metadata } from "next"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Bookmark, BookOpen, CircleCheck } from "lucide-react"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { PUBLIC_BOOK_SELECT } from "@/lib/books"
import { BookGrid } from "@/components/books/BookGrid"
import type { ReadingStatus } from "@prisma/client"

export const metadata: Metadata = {
  title: "Mes lectures"
}

export const dynamic = "force-dynamic"

type Tab = "to-read" | "reading" | "read"

const TAB_TO_STATUS: Record<Tab, ReadingStatus> = {
  "to-read": "TO_READ",
  reading: "READING",
  read: "READ"
}

const TABS: ReadonlyArray<{
  key: Tab
  label: string
  empty: string
  Icon: typeof Bookmark
}> = [
  {
    key: "to-read",
    label: "A lire",
    empty: "Vous n'avez encore rien marque a lire.",
    Icon: Bookmark
  },
  {
    key: "reading",
    label: "En cours",
    empty: "Aucun livre en cours de lecture.",
    Icon: BookOpen
  },
  {
    key: "read",
    label: "Lu",
    empty: "Aucun livre marque comme lu pour le moment.",
    Icon: CircleCheck
  }
]

function parseTab(raw: string | string[] | undefined): Tab {
  if (raw === "reading" || raw === "read" || raw === "to-read") return raw
  return "to-read"
}

export default async function MesLecturesPage(props: {
  searchParams: Promise<{ tab?: string }>
}) {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect("/login")
  const userId = session.user.id

  const { tab: rawTab } = await props.searchParams
  const tab = parseTab(rawTab)
  const status = TAB_TO_STATUS[tab]

  const [toReadCount, readingCount, readCount, rows] = await Promise.all([
    db.reading.count({ where: { userId, status: "TO_READ" } }),
    db.reading.count({ where: { userId, status: "READING" } }),
    db.reading.count({ where: { userId, status: "READ" } }),
    db.reading.findMany({
      where: { userId, status },
      orderBy: { addedAt: "desc" },
      select: { book: { select: PUBLIC_BOOK_SELECT } }
    })
  ])

  const counts: Record<Tab, number> = {
    "to-read": toReadCount,
    reading: readingCount,
    read: readCount
  }

  const books = rows.map((r) => r.book)
  const readingByBookId = new Map(books.map((b) => [b.id, status] as const))

  const empty = TABS.find((t) => t.key === tab)!.empty

  return (
    <section className="mx-auto max-w-6xl">
      <header className="mb-6">
        <h1 className="font-serif text-3xl text-ink">Mes lectures</h1>
        <p className="mt-1 text-sm text-ink-3">
          Suivez les livres que vous voulez lire, lisez ou avez lus.
        </p>
      </header>

      <nav className="mb-6 flex flex-wrap gap-2 border-b border-[var(--rule-2)] pb-3">
        {TABS.map((t) => {
          const active = t.key === tab
          const Icon = t.Icon
          return (
            <Link
              key={t.key}
              href={t.key === "to-read" ? "/mes-lectures" : `/mes-lectures?tab=${t.key}`}
              className={
                active
                  ? "inline-flex h-9 items-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-accent-ink shadow-[var(--shadow-1)]"
                  : "inline-flex h-9 items-center gap-2 rounded-md border border-[var(--rule)] bg-paper px-4 text-sm text-ink-2 shadow-[var(--shadow-1)] transition hover:bg-paper-2 hover:text-ink"
              }
              aria-current={active ? "page" : undefined}
            >
              <Icon size={14} />
              {t.label}
              <span
                className={
                  active
                    ? "rounded-full bg-[rgba(255,255,255,0.2)] px-1.5 text-[11px]"
                    : "rounded-full bg-paper-2 px-1.5 text-[11px] text-ink-3"
                }
              >
                {counts[t.key]}
              </span>
            </Link>
          )
        })}
      </nav>

      {books.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--rule)] bg-paper-2/40 p-10 text-center text-[13px] text-ink-3">
          {empty}
        </div>
      ) : (
        <BookGrid books={books} readingByBookId={readingByBookId} showLibraryBadge />
      )}
    </section>
  )
}
