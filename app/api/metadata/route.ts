import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { searchBooks, findByIsbn, type MetadataSource } from "@/lib/metadata"

export const dynamic = "force-dynamic"

const ALLOWED_SOURCES: ReadonlySet<MetadataSource> = new Set([
  "google_books",
  "bnf",
  "open_library"
])

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Non authentifie." }, { status: 401 })
  }

  const url = new URL(req.url)
  const isbn = url.searchParams.get("isbn")?.trim()
  if (isbn) {
    const match = await findByIsbn(isbn)
    return NextResponse.json({
      results: match ? [match] : [],
      hasMore: false,
      source: match?.source ?? "mixed"
    })
  }

  const q = url.searchParams.get("q")?.trim()
  if (!q || q.length < 2) {
    return NextResponse.json({ results: [], hasMore: false, source: "mixed" })
  }

  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 5) || 5, 1), 10)
  const offset = Math.max(Number(url.searchParams.get("offset") ?? 0) || 0, 0)
  const sourceParam = url.searchParams.get("source")
  const source =
    sourceParam && ALLOWED_SOURCES.has(sourceParam as MetadataSource)
      ? (sourceParam as MetadataSource)
      : undefined

  const result = await searchBooks(q, { limit, offset, source })
  return NextResponse.json(result)
}
