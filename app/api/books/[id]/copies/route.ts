// app/api/books/[id]/copies/route.ts
import { NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { PUBLIC_BOOK_SELECT } from "@/lib/books"
import { addCopyToBook } from "@/lib/books-mutations"
import { getVisibleLibraryIds, isLibraryVisible } from "@/lib/libraries"
import { logger } from "@/lib/logger"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const DigitalCopy = z.object({
  type: z.literal("DIGITAL"),
  uploadId: z.string().min(8).max(64),
  format: z.enum(["EPUB", "PDF"]),
  fileSize: z.number().int().min(1),
  libraryId: z.string().min(1)
})

const PhysicalCopy = z.object({
  type: z.literal("PHYSICAL"),
  libraryId: z.string().min(1)
})

const CopyBody = z.discriminatedUnion("type", [DigitalCopy, PhysicalCopy])

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Non authentifie." }, { status: 401 })

  const { id: bookId } = await ctx.params

  // V1.6 : on ne retrouve le Book que s'il a au moins une copie visible
  // pour l'user (sinon il "n'existe pas" du point de vue de l'user).
  const visibleLibIds = await getVisibleLibraryIds(db, session.user.id)
  if (visibleLibIds.length === 0) {
    return NextResponse.json({ error: "Livre introuvable." }, { status: 404 })
  }
  const book = await db.book.findFirst({
    where: {
      id: bookId,
      copies: { some: { libraryId: { in: visibleLibIds } } }
    },
    select: { id: true, isPersonal: true }
  })
  if (!book) return NextResponse.json({ error: "Livre introuvable." }, { status: 404 })

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 })
  }

  const parsed = CopyBody.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Donnees invalides.", issues: parsed.error.flatten() },
      { status: 400 }
    )
  }
  const data = parsed.data

  // V1.6 : la bib cible de la nouvelle copie doit etre visible par l'user.
  const targetVisible = await isLibraryVisible(db, session.user.id, data.libraryId)
  if (!targetVisible) {
    return NextResponse.json({ error: "Bibliotheque inaccessible." }, { status: 403 })
  }

  if (data.type === "DIGITAL") {
    // Check applicatif d'unicite (bookId, format) SCOPE par bibliotheque (V1.6).
    // Le meme livre peut exister en EPUB dans deux bibs differentes — c'est OK,
    // c'est une copie distincte. La dedup ne joue qu'au sein d'une meme bib.
    // Race condition theorique : 2 uploads simultanes du meme format dans la
    // meme bib peuvent passer le findFirst en parallele. Risque accepte pour V1.
    const existing = await db.bookCopy.findFirst({
      where: {
        bookId,
        libraryId: data.libraryId,
        type: "DIGITAL",
        format: data.format
      },
      select: { id: true }
    })
    if (existing) {
      return NextResponse.json(
        { error: `Cette bibliotheque contient deja ce livre en ${data.format}.` },
        { status: 409 }
      )
    }

    try {
      await addCopyToBook(
        bookId,
        {
          type: "DIGITAL",
          uploadId: data.uploadId,
          format: data.format,
          fileSize: data.fileSize
        },
        session.user.id,
        { libraryId: data.libraryId, isPersonal: book.isPersonal }
      )
      const full = await db.book.findUnique({
        where: { id: bookId },
        select: PUBLIC_BOOK_SELECT
      })
      return NextResponse.json({ book: full }, { status: 201 })
    } catch (err) {
      logger.error("add digital copy failed", { err: String(err) })
      return NextResponse.json(
        { error: "Impossible d'ajouter cette copie." },
        { status: 500 }
      )
    }
  }

  // PHYSICAL — conflit scope par bibliotheque (V1.6) : le meme proprietaire
  // ne peut pas declarer deux exemplaires physiques du meme livre dans une
  // meme bib. Race condition acceptee pour V1 (cf. DIGITAL).
  const existingPhysical = await db.bookCopy.findFirst({
    where: {
      bookId,
      libraryId: data.libraryId,
      type: "PHYSICAL",
      ownerId: session.user.id
    },
    select: { id: true }
  })
  if (existingPhysical) {
    return NextResponse.json(
      { error: "Vous avez deja declare votre exemplaire physique de ce livre." },
      { status: 409 }
    )
  }

  await addCopyToBook(
    bookId,
    { type: "PHYSICAL" },
    session.user.id,
    { libraryId: data.libraryId, isPersonal: book.isPersonal }
  )
  const full = await db.book.findUnique({
    where: { id: bookId },
    select: PUBLIC_BOOK_SELECT
  })
  return NextResponse.json({ book: full }, { status: 201 })
}
