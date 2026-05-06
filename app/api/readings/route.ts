// app/api/readings/route.ts
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { PUBLIC_BOOK_SELECT } from "@/lib/books"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(_req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Non authentifie." }, { status: 401 })

  const userId = session.user.id

  const [toReadRows, readingRows, readRows] = await Promise.all([
    db.reading.findMany({
      where: { userId, status: "TO_READ" },
      orderBy: { addedAt: "desc" },
      select: { book: { select: PUBLIC_BOOK_SELECT } }
    }),
    db.reading.findMany({
      where: { userId, status: "READING" },
      orderBy: { addedAt: "desc" },
      select: { book: { select: PUBLIC_BOOK_SELECT } }
    }),
    db.reading.findMany({
      where: { userId, status: "READ" },
      orderBy: { addedAt: "desc" },
      select: { book: { select: PUBLIC_BOOK_SELECT } }
    })
  ])

  return NextResponse.json({
    toRead: toReadRows.map((r) => r.book),
    reading: readingRows.map((r) => r.book),
    read: readRows.map((r) => r.book)
  })
}
