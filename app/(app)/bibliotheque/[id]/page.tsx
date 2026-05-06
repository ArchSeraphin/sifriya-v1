import { redirect, notFound } from "next/navigation"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { PUBLIC_BOOK_SELECT } from "@/lib/books"
import { BookDetail } from "@/components/books/BookDetail"

export const dynamic = "force-dynamic"

export async function generateMetadata(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  const book = await db.book.findUnique({ where: { id }, select: { title: true } })
  return { title: book ? `${book.title} — Sifriya` : "Livre — Sifriya" }
}

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect("/login")

  const book = await db.book.findUnique({ where: { id }, select: PUBLIC_BOOK_SELECT })
  if (!book) notFound()

  const physicalCopyIds = book.copies.filter((c) => c.type === "PHYSICAL").map((c) => c.id)

  const [activeLoans, myRequests] = await Promise.all([
    physicalCopyIds.length
      ? db.loan.findMany({
          where: {
            copyId: { in: physicalCopyIds },
            status: { in: ["PENDING", "ACCEPTED"] }
          },
          select: {
            id: true,
            copyId: true,
            status: true,
            requester: { select: { id: true, name: true, email: true, avatarColor: true } }
          }
        })
      : Promise.resolve([]),
    physicalCopyIds.length
      ? db.loan.findMany({
          where: {
            copyId: { in: physicalCopyIds },
            requesterId: session.user.id,
            status: { in: ["PENDING", "ACCEPTED"] }
          },
          select: { id: true, copyId: true, status: true }
        })
      : Promise.resolve([])
  ])

  const activeLoansByCopy: Record<string, { id: string; status: "PENDING" | "ACCEPTED"; requester: typeof activeLoans[number]["requester"] }> = {}
  for (const l of activeLoans) {
    activeLoansByCopy[l.copyId] = { id: l.id, status: l.status as "PENDING" | "ACCEPTED", requester: l.requester }
  }
  const myActiveRequestsByCopy: Record<string, { id: string; status: "PENDING" | "ACCEPTED" }> = {}
  for (const r of myRequests) {
    myActiveRequestsByCopy[r.copyId] = { id: r.id, status: r.status as "PENDING" | "ACCEPTED" }
  }

  return (
    <BookDetail
      book={book}
      currentUser={{ id: session.user.id, role: session.user.role }}
      activeLoansByCopy={activeLoansByCopy}
      myActiveRequestsByCopy={myActiveRequestsByCopy}
    />
  )
}
