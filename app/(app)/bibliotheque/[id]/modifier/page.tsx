import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { PUBLIC_BOOK_SELECT } from "@/lib/books"
import { EditBookForm } from "@/components/books/EditBookForm"

export const dynamic = "force-dynamic"

export async function generateMetadata({
  params
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const book = await db.book.findUnique({ where: { id }, select: { title: true } })
  return { title: book ? `Modifier — ${book.title}` : "Modifier" }
}

export default async function EditBookPage({
  params
}: {
  params: Promise<{ id: string }>
}) {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect("/login")
  const { id } = await params
  const book = await db.book.findUnique({ where: { id }, select: PUBLIC_BOOK_SELECT })
  if (!book) notFound()

  const isAdmin = session.user.role === "ADMIN"
  const isAuthor = book.addedBy.id === session.user.id
  if (!isAdmin && !isAuthor) {
    redirect(`/bibliotheque/${id}`)
  }

  return (
    <section className="mx-auto max-w-3xl">
      <Link
        href={`/bibliotheque/${id}`}
        className="inline-flex items-center gap-1 text-[13px] text-ink-3 hover:text-ink"
      >
        <ArrowLeft size={14} />
        Retour a la fiche
      </Link>
      <header className="mt-3 mb-6">
        <h1 className="font-serif text-3xl text-ink">Modifier la fiche</h1>
        <p className="mt-1 text-sm text-ink-3">
          Mettez a jour les informations de <em>{book.title}</em>.
        </p>
      </header>

      <EditBookForm book={book} />
    </section>
  )
}
