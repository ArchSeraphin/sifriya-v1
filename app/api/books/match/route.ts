// app/api/books/match/route.ts
import { NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { findMatchingBook } from "@/lib/match"
import { PUBLIC_BOOK_SELECT } from "@/lib/books"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const Body = z.object({
  title: z.string().trim().min(1).max(500),
  author: z.string().trim().max(300).optional().nullable(),
  isbn: z.string().trim().max(20).optional().nullable()
})

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Non authentifie." }, { status: 401 })

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 })
  }
  const parsed = Body.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: "Donnees invalides." }, { status: 400 })
  }

  const match = await findMatchingBook(db, parsed.data)
  if (!match) return NextResponse.json({ match: null })

  const book = await db.book.findUnique({
    where: { id: match.bookId },
    select: PUBLIC_BOOK_SELECT
  })
  if (!book) return NextResponse.json({ match: null })

  return NextResponse.json({
    match: { bookId: match.bookId, confidence: match.confidence, book }
  })
}
