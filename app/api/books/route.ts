import { NextResponse } from "next/server"
import { z } from "zod"
import type { Prisma } from "@prisma/client"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { ListQuery, orderByForSort, PUBLIC_BOOK_SELECT } from "@/lib/books"
import { commitPending } from "@/lib/storage"
import { logger } from "@/lib/logger"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// =====================================================================
// GET /api/books — liste paginee + filtres
// =====================================================================

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Non authentifie." }, { status: 401 })

  const url = new URL(req.url)
  const parsed = ListQuery.safeParse(Object.fromEntries(url.searchParams.entries()))
  if (!parsed.success) {
    return NextResponse.json({ error: "Parametres invalides." }, { status: 400 })
  }
  const { q, type, format, sort, ownerId, addedById, page, limit } = parsed.data

  const where: Prisma.BookWhereInput = {}
  if (type) where.type = type
  if (format) where.format = format
  if (ownerId) where.ownerId = ownerId
  if (addedById) where.addedById = addedById
  if (q) {
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { author: { contains: q, mode: "insensitive" } },
      { isbn: { contains: q, mode: "insensitive" } }
    ]
  }

  const [total, books] = await Promise.all([
    db.book.count({ where }),
    db.book.findMany({
      where,
      orderBy: orderByForSort[sort],
      skip: (page - 1) * limit,
      take: limit,
      select: PUBLIC_BOOK_SELECT
    })
  ])

  const totalPages = Math.max(1, Math.ceil(total / limit))
  return NextResponse.json({ books, total, page, totalPages, limit })
}

// =====================================================================
// POST /api/books — cree un livre numerique a partir d'un upload pending
// =====================================================================

const CreateBody = z.object({
  uploadId: z.string().min(8).max(64),
  format: z.enum(["EPUB", "PDF"]),
  fileSize: z.number().int().min(1),
  title: z.string().trim().min(1).max(500),
  author: z.string().trim().max(300).optional().nullable(),
  isbn: z.string().trim().max(20).optional().nullable(),
  description: z.string().trim().max(5000).optional().nullable(),
  genre: z.string().trim().max(120).optional().nullable(),
  year: z.number().int().min(0).max(2200).optional().nullable(),
  publisher: z.string().trim().max(200).optional().nullable(),
  language: z.string().trim().max(10).optional().nullable(),
  coverUrl: z.string().trim().url().optional().nullable(),
  sourceApi: z.enum(["google_books", "open_library", "manual"]).optional().nullable(),
  externalId: z.string().trim().max(200).optional().nullable()
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

  const parsed = CreateBody.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Donnees invalides.", issues: parsed.error.flatten() },
      { status: 400 }
    )
  }
  const data = parsed.data

  // Cree d'abord le Book pour avoir l'ID, puis on commite le fichier vers
  // books/${id}.${ext}. Si le commit echoue, on rollback.
  const ext = data.format.toLowerCase() as "epub" | "pdf"

  let bookId: string | null = null
  try {
    const book = await db.book.create({
      data: {
        title: data.title,
        author: data.author ?? null,
        isbn: data.isbn ?? null,
        description: data.description ?? null,
        genre: data.genre ?? null,
        year: data.year ?? null,
        publisher: data.publisher ?? null,
        language: data.language ?? "fr",
        coverUrl: data.coverUrl ?? null,
        type: "DIGITAL",
        format: data.format,
        fileSize: data.fileSize,
        sourceApi: data.sourceApi ?? null,
        externalId: data.externalId ?? null,
        addedById: session.user.id,
        filePath: "pending"
      },
      select: { id: true }
    })
    bookId = book.id
    const finalKey = await commitPending({
      pendingId: data.uploadId,
      ext,
      finalKey: `books/${book.id}.${ext}`
    })
    const updated = await db.book.update({
      where: { id: book.id },
      data: { filePath: finalKey },
      select: PUBLIC_BOOK_SELECT
    })
    return NextResponse.json({ book: updated }, { status: 201 })
  } catch (err) {
    logger.error("create book failed", { err: String(err) })
    if (bookId) {
      await db.book.delete({ where: { id: bookId } }).catch(() => {})
    }
    return NextResponse.json(
      { error: "Impossible d'enregistrer le livre. Reessayez l'envoi du fichier." },
      { status: 500 }
    )
  }
}
