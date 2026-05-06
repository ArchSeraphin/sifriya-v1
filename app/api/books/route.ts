import { NextResponse } from "next/server"
import { z } from "zod"
import type { Prisma } from "@prisma/client"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { ListQuery, orderByForSort, PUBLIC_BOOK_SELECT } from "@/lib/books"
import { commitPending } from "@/lib/storage"
import { computeMatchKey, normalizeIsbn } from "@/lib/match"
import { logger } from "@/lib/logger"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// =====================================================================
// GET /api/books — liste paginee + filtres (multi-formats)
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
  if (q) {
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { author: { contains: q, mode: "insensitive" } },
      { isbn: { contains: q, mode: "insensitive" } }
    ]
  }

  // Filtres copies — combines via copies.some({...})
  const copyFilters: Prisma.BookCopyWhereInput = {}
  if (type) copyFilters.type = type
  if (format) {
    copyFilters.type = "DIGITAL"
    copyFilters.format = format
  }
  if (ownerId) {
    copyFilters.type = "PHYSICAL"
    copyFilters.ownerId = ownerId
  }
  if (addedById) copyFilters.addedById = addedById
  if (Object.keys(copyFilters).length > 0) {
    where.copies = { some: copyFilters }
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
// POST /api/books — cree un Book + 1ere BookCopy (transaction)
// =====================================================================

// On accepte une URL externe (https://) ou un chemin servi par notre API
// (/api/covers/...). Tout le reste est rejete.
const CoverUrl = z
  .string()
  .trim()
  .refine(
    (s) => s.startsWith("/api/covers/") || /^https?:\/\//.test(s),
    { message: "URL de couverture invalide." }
  )

const Common = z.object({
  title: z.string().trim().min(1).max(500),
  author: z.string().trim().max(300).optional().nullable(),
  isbn: z.string().trim().max(20).optional().nullable(),
  description: z.string().trim().max(5000).optional().nullable(),
  genre: z.string().trim().max(120).optional().nullable(),
  year: z.number().int().min(0).max(2200).optional().nullable(),
  publisher: z.string().trim().max(200).optional().nullable(),
  language: z.string().trim().max(10).optional().nullable(),
  coverUrl: CoverUrl.optional().nullable(),
  sourceApi: z.enum(["google_books", "open_library", "bnf", "manual"]).optional().nullable(),
  externalId: z.string().trim().max(200).optional().nullable()
})

const DigitalCreate = Common.extend({
  copyType: z.literal("DIGITAL"),
  uploadId: z.string().min(8).max(64),
  format: z.enum(["EPUB", "PDF"]),
  fileSize: z.number().int().min(1)
})

const PhysicalCreate = Common.extend({
  copyType: z.literal("PHYSICAL")
})

const CreateBody = z.discriminatedUnion("copyType", [DigitalCreate, PhysicalCreate])

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

  const isbn = normalizeIsbn(data.isbn)
  const matchKey = computeMatchKey(data.title, data.author ?? null)

  if (data.copyType === "DIGITAL") {
    const ext = data.format.toLowerCase() as "epub" | "pdf"
    let bookId: string | null = null
    let copyId: string | null = null
    try {
      const created = await db.$transaction(async (tx) => {
        const book = await tx.book.create({
          data: {
            title: data.title,
            author: data.author ?? null,
            isbn,
            description: data.description ?? null,
            genre: data.genre ?? null,
            year: data.year ?? null,
            publisher: data.publisher ?? null,
            language: data.language ?? "fr",
            coverUrl: data.coverUrl ?? null,
            sourceApi: data.sourceApi ?? null,
            externalId: data.externalId ?? null,
            matchKey
          },
          select: { id: true }
        })
        const copy = await tx.bookCopy.create({
          data: {
            bookId: book.id,
            type: "DIGITAL",
            format: data.format,
            fileSize: data.fileSize,
            filePath: "pending",
            addedById: session.user.id
          },
          select: { id: true }
        })
        return { bookId: book.id, copyId: copy.id }
      })
      bookId = created.bookId
      copyId = created.copyId

      const finalKey = await commitPending({
        pendingId: data.uploadId,
        ext,
        finalKey: `copies/${copyId}.${ext}`
      })
      await db.bookCopy.update({
        where: { id: copyId },
        data: { filePath: finalKey }
      })

      const book = await db.book.findUnique({
        where: { id: bookId },
        select: PUBLIC_BOOK_SELECT
      })
      return NextResponse.json({ book }, { status: 201 })
    } catch (err) {
      logger.error("create digital book failed", { err: String(err) })
      if (bookId) {
        await db.book.delete({ where: { id: bookId } }).catch(() => {})
      }
      if (isUniqueViolation(err)) {
        return NextResponse.json(
          { error: "Un livre avec ce ISBN existe deja." },
          { status: 409 }
        )
      }
      return NextResponse.json(
        { error: "Impossible d'enregistrer le livre. Reessayez l'envoi du fichier." },
        { status: 500 }
      )
    }
  }

  // PHYSICAL
  try {
    const book = await db.$transaction(async (tx) => {
      const b = await tx.book.create({
        data: {
          title: data.title,
          author: data.author ?? null,
          isbn,
          description: data.description ?? null,
          genre: data.genre ?? null,
          year: data.year ?? null,
          publisher: data.publisher ?? null,
          language: data.language ?? "fr",
          coverUrl: data.coverUrl ?? null,
          sourceApi: data.sourceApi ?? null,
          externalId: data.externalId ?? null,
          matchKey
        },
        select: { id: true }
      })
      await tx.bookCopy.create({
        data: {
          bookId: b.id,
          type: "PHYSICAL",
          ownerId: session.user.id,
          addedById: session.user.id
        }
      })
      return b
    })
    const full = await db.book.findUnique({
      where: { id: book.id },
      select: PUBLIC_BOOK_SELECT
    })
    return NextResponse.json({ book: full }, { status: 201 })
  } catch (err) {
    logger.error("create physical book failed", { err: String(err) })
    if (isUniqueViolation(err)) {
      return NextResponse.json(
        { error: "Un livre avec ce ISBN existe deja." },
        { status: 409 }
      )
    }
    return NextResponse.json(
      { error: "Impossible d'enregistrer le livre." },
      { status: 500 }
    )
  }
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "P2002"
  )
}
