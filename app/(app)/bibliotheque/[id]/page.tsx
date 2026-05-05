import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { PUBLIC_BOOK_SELECT } from "@/lib/books"
import { BookDetail } from "@/components/books/BookDetail"

export const dynamic = "force-dynamic"

export async function generateMetadata({
  params
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const book = await db.book.findUnique({ where: { id }, select: { title: true } })
  return { title: book?.title ?? "Livre" }
}

export default async function BookPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect("/login")
  const { id } = await params
  const book = await db.book.findUnique({ where: { id }, select: PUBLIC_BOOK_SELECT })
  if (!book) notFound()
  return (
    <BookDetail
      book={book}
      currentUser={{ id: session.user.id, role: session.user.role }}
    />
  )
}
