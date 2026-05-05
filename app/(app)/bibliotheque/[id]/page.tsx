import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { PUBLIC_BOOK_SELECT } from "@/lib/books"
import { BookDetail, type ActiveLoanLite } from "@/components/books/BookDetail"

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

  let activeLoan: ActiveLoanLite | null = null
  let myActiveRequest: { id: string; status: "PENDING" | "ACCEPTED" } | null = null
  if (book.type === "PHYSICAL") {
    const [accepted, mine] = await Promise.all([
      db.loan.findFirst({
        where: { bookId: book.id, status: { in: ["PENDING", "ACCEPTED"] } },
        orderBy: { createdAt: "desc" },
        include: {
          requester: { select: { id: true, name: true, email: true, avatarColor: true } }
        }
      }),
      db.loan.findFirst({
        where: {
          bookId: book.id,
          requesterId: session.user.id,
          status: { in: ["PENDING", "ACCEPTED"] }
        }
      })
    ])
    if (accepted) {
      activeLoan = {
        id: accepted.id,
        status: accepted.status === "ACCEPTED" ? "ACCEPTED" : "PENDING",
        requester: accepted.requester
      }
    }
    if (mine) {
      myActiveRequest = {
        id: mine.id,
        status: mine.status === "ACCEPTED" ? "ACCEPTED" : "PENDING"
      }
    }
  }

  return (
    <BookDetail
      book={book}
      currentUser={{ id: session.user.id, role: session.user.role }}
      activeLoan={activeLoan}
      myActiveRequest={myActiveRequest}
    />
  )
}
