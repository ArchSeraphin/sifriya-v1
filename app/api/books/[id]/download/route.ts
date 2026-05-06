import { NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { readWebStream, statByKey } from "@/lib/storage"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const Query = z.object({
  format: z.enum(["EPUB", "PDF"])
})

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Non authentifie." }, { status: 401 })
  }
  const { id: bookId } = await ctx.params

  const url = new URL(req.url)
  const parsed = Query.safeParse(Object.fromEntries(url.searchParams.entries()))
  if (!parsed.success) {
    return NextResponse.json({ error: "Format requis (EPUB ou PDF)." }, { status: 400 })
  }
  const { format } = parsed.data

  const copy = await db.bookCopy.findFirst({
    where: { bookId, type: "DIGITAL", format },
    select: { id: true, filePath: true, format: true }
  })
  if (!copy?.filePath) {
    return NextResponse.json(
      { error: `Aucune copie ${format} disponible pour ce livre.` },
      { status: 404 }
    )
  }

  const meta = await statByKey(copy.filePath)
  if (!meta) {
    return NextResponse.json({ error: "Fichier introuvable." }, { status: 404 })
  }

  const book = await db.book.findUnique({
    where: { id: bookId },
    select: { title: true, author: true }
  })
  const ext = format.toLowerCase()
  const safeTitle = (book?.title ?? "livre").replace(/[^a-zA-Z0-9._-]+/g, "_")
  const filename = `${safeTitle}.${ext}`

  return new NextResponse(readWebStream(copy.filePath), {
    headers: {
      "content-type": format === "EPUB" ? "application/epub+zip" : "application/pdf",
      "content-length": String(meta.size),
      "content-disposition": `attachment; filename="${filename}"`,
      // Fichiers prives : aucun cache cote proxy/CDN/SW.
      "cache-control": "private, no-store"
    }
  })
}
