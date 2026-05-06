// app/api/books/[id]/copies/route.ts
import { NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { commitPending } from "@/lib/storage"
import { PUBLIC_BOOK_SELECT } from "@/lib/books"
import { logger } from "@/lib/logger"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const DigitalCopy = z.object({
  type: z.literal("DIGITAL"),
  uploadId: z.string().min(8).max(64),
  format: z.enum(["EPUB", "PDF"]),
  fileSize: z.number().int().min(1)
})

const PhysicalCopy = z.object({
  type: z.literal("PHYSICAL")
})

const CopyBody = z.discriminatedUnion("type", [DigitalCopy, PhysicalCopy])

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Non authentifie." }, { status: 401 })

  const { id: bookId } = await ctx.params

  const book = await db.book.findUnique({
    where: { id: bookId },
    select: { id: true }
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

  if (data.type === "DIGITAL") {
    // Check applicatif d'unicite (bookId, format) — pas d'index unique partiel
    // en DB. Race condition theorique : 2 uploads simultanes du meme format
    // peuvent passer le findFirst en parallele. Risque accepte pour V1 (50-100
    // users) — au pire, 2 BookCopy DIGITAL identiques, l'admin peut nettoyer.
    // Si volume augmente, ajouter une migration SQL : CREATE UNIQUE INDEX ...
    // ON "BookCopy" ("bookId", format) WHERE type = 'DIGITAL'.
    const existing = await db.bookCopy.findFirst({
      where: { bookId, type: "DIGITAL", format: data.format },
      select: { id: true }
    })
    if (existing) {
      return NextResponse.json(
        { error: `Cette bibliotheque contient deja ce livre en ${data.format}.` },
        { status: 409 }
      )
    }

    const ext = data.format.toLowerCase() as "epub" | "pdf"
    let copyId: string | null = null
    try {
      const copy = await db.bookCopy.create({
        data: {
          bookId,
          type: "DIGITAL",
          format: data.format,
          fileSize: data.fileSize,
          filePath: "pending",
          addedById: session.user.id
        },
        select: { id: true }
      })
      copyId = copy.id
      const finalKey = await commitPending({
        pendingId: data.uploadId,
        ext,
        finalKey: `copies/${copyId}.${ext}`
      })
      await db.bookCopy.update({
        where: { id: copyId },
        data: { filePath: finalKey }
      })
      const full = await db.book.findUnique({
        where: { id: bookId },
        select: PUBLIC_BOOK_SELECT
      })
      return NextResponse.json({ book: full }, { status: 201 })
    } catch (err) {
      logger.error("add digital copy failed", { err: String(err) })
      if (copyId) {
        await db.bookCopy.delete({ where: { id: copyId } }).catch(() => {})
      }
      return NextResponse.json(
        { error: "Impossible d'ajouter cette copie." },
        { status: 500 }
      )
    }
  }

  // PHYSICAL — conflit : meme (bookId, ownerId, type=PHYSICAL) deja present ?
  // Meme race condition acceptee que pour DIGITAL. Si volume augmente, ajouter :
  // CREATE UNIQUE INDEX ... ON "BookCopy" ("bookId", "ownerId") WHERE type = 'PHYSICAL'.
  const existingPhysical = await db.bookCopy.findFirst({
    where: { bookId, type: "PHYSICAL", ownerId: session.user.id },
    select: { id: true }
  })
  if (existingPhysical) {
    return NextResponse.json(
      { error: "Vous avez deja declare votre exemplaire physique de ce livre." },
      { status: 409 }
    )
  }

  await db.bookCopy.create({
    data: {
      bookId,
      type: "PHYSICAL",
      ownerId: session.user.id,
      addedById: session.user.id
    }
  })
  const full = await db.book.findUnique({
    where: { id: bookId },
    select: PUBLIC_BOOK_SELECT
  })
  return NextResponse.json({ book: full }, { status: 201 })
}
