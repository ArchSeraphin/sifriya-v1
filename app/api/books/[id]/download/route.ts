import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { readWebStream, statByKey, safeFilename } from "@/lib/storage"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const MIME: Record<string, string> = {
  EPUB: "application/epub+zip",
  PDF: "application/pdf"
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return new Response(JSON.stringify({ error: "Non authentifie." }), {
      status: 401,
      headers: { "content-type": "application/json" }
    })
  }
  const { id } = await ctx.params
  const book = await db.book.findUnique({
    where: { id },
    select: { id: true, title: true, format: true, filePath: true, type: true }
  })
  if (!book || book.type !== "DIGITAL" || !book.filePath || !book.format) {
    return new Response(JSON.stringify({ error: "Fichier indisponible." }), {
      status: 404,
      headers: { "content-type": "application/json" }
    })
  }
  const stat = await statByKey(book.filePath)
  if (!stat) {
    return new Response(JSON.stringify({ error: "Fichier introuvable." }), {
      status: 404,
      headers: { "content-type": "application/json" }
    })
  }
  const ext = book.format.toLowerCase()
  const downloadName = safeFilename(`${book.title}.${ext}`)
  const stream = readWebStream(book.filePath)
  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": MIME[book.format] ?? "application/octet-stream",
      "content-length": String(stat.size),
      "content-disposition": `attachment; filename="${downloadName}"`,
      "cache-control": "private, no-store"
    }
  })
}
