import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { searchBooks, findByIsbn } from "@/lib/metadata"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Non authentifie." }, { status: 401 })
  }

  const url = new URL(req.url)
  const isbn = url.searchParams.get("isbn")?.trim()
  if (isbn) {
    const match = await findByIsbn(isbn)
    return NextResponse.json({ results: match ? [match] : [] })
  }

  const q = url.searchParams.get("q")?.trim()
  if (!q || q.length < 2) {
    return NextResponse.json({ results: [] })
  }
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 5) || 5, 1), 10)
  const results = await searchBooks(q, { limit })
  return NextResponse.json({ results })
}
