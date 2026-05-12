import { NextResponse } from "next/server"
import { z } from "zod"
import type { Prisma } from "@prisma/client"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import {
  ListQuery,
  orderByForSort,
  PUBLIC_BOOK_SELECT
} from "@/lib/books"
import { createBookWithCopy } from "@/lib/books-mutations"
import { getVisibleLibraryIds, isLibraryVisible } from "@/lib/libraries"
import { normalizeIsbn } from "@/lib/match"
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
  const libraryIdParam = url.searchParams.get("libraryId") || undefined

  // Scoping V1.6 : on filtre les Books a ceux qui ont au moins une copie
  // dans une bib visible. Pour un ADMIN, getVisibleLibraryIds renvoie toutes
  // les bibs ; pour un USER, uniquement ses memberships.
  const visibleLibIds = await getVisibleLibraryIds(db, session.user.id)
  if (visibleLibIds.length === 0) {
    return NextResponse.json({ books: [], total: 0, page, totalPages: 1, limit })
  }

  // Si libraryId est passe en param, on verifie qu'il est visible
  // (sinon 403). Le scoping se reduit alors a cette seule bib.
  let scopedLibraryIds = visibleLibIds
  if (libraryIdParam) {
    if (!visibleLibIds.includes(libraryIdParam)) {
      return NextResponse.json({ error: "Bibliotheque inaccessible." }, { status: 403 })
    }
    scopedLibraryIds = [libraryIdParam]
  }

  // Filtres copies — combines via copies.some({...})
  const copyFilters: Prisma.BookCopyWhereInput = {
    libraryId: { in: scopedLibraryIds }
  }
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

  const where: Prisma.BookWhereInput = {
    copies: { some: copyFilters }
  }
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
  externalId: z.string().trim().max(200).optional().nullable(),
  libraryId: z.string().min(1),
  isPersonal: z.boolean().optional()
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

  // V1.6 : la bib cible doit etre visible par l'user (ADMIN bypasse).
  const allowed = await isLibraryVisible(db, session.user.id, data.libraryId)
  if (!allowed) {
    return NextResponse.json({ error: "Bibliotheque inaccessible." }, { status: 403 })
  }

  try {
    const { bookId } = await createBookWithCopy(
      {
        title: data.title,
        author: data.author ?? null,
        isbn: data.isbn ?? null,
        description: data.description ?? null,
        genre: data.genre ?? null,
        year: data.year ?? null,
        publisher: data.publisher ?? null,
        language: data.language ?? null,
        coverUrl: data.coverUrl ?? null,
        sourceApi: data.sourceApi ?? null,
        externalId: data.externalId ?? null
      },
      data.copyType === "DIGITAL"
        ? {
            type: "DIGITAL",
            uploadId: data.uploadId,
            format: data.format,
            fileSize: data.fileSize
          }
        : { type: "PHYSICAL" },
      session.user.id,
      { libraryId: data.libraryId, isPersonal: data.isPersonal }
    )
    const book = await db.book.findUnique({
      where: { id: bookId },
      select: PUBLIC_BOOK_SELECT
    })
    return NextResponse.json({ book }, { status: 201 })
  } catch (err) {
    logger.error("create book failed", { err: String(err) })
    if (isUniqueViolation(err)) {
      return await isbnConflictResponse(normalizeIsbn(data.isbn ?? null))
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

// Cas frontiere : l'user a force "creer une fiche distincte" malgre un match
// suggere, mais l'ISBN entre est en conflit avec un Book existant. On lui
// renvoie le bookId pour qu'il puisse basculer dessus cote client.
async function isbnConflictResponse(isbn: string | null) {
  const existing = isbn
    ? await db.book.findFirst({ where: { isbn }, select: { id: true } })
    : null
  return NextResponse.json(
    {
      error: "Un livre avec ce ISBN existe deja.",
      conflictBookId: existing?.id ?? null
    },
    { status: 409 }
  )
}
