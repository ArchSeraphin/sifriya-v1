import { NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { deleteByKey } from "@/lib/storage"
import { PUBLIC_BOOK_SELECT, PUBLIC_COPY_SELECT } from "@/lib/books"
import { getVisibleLibraryIds } from "@/lib/libraries"
import { computeMatchKey, normalizeIsbn } from "@/lib/match"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Non authentifie." }, { status: 401 })
  const { id } = await ctx.params

  // V1.6 : on ne retourne le livre que s'il a au moins une copie visible
  // pour l'user, et on filtre les copies retournees a celles visibles.
  const visibleLibIds = await getVisibleLibraryIds(db, session.user.id)
  if (visibleLibIds.length === 0) {
    return NextResponse.json({ error: "Livre introuvable." }, { status: 404 })
  }
  const book = await db.book.findFirst({
    where: {
      id,
      copies: { some: { libraryId: { in: visibleLibIds } } }
    },
    select: {
      id: true,
      title: true,
      author: true,
      isbn: true,
      coverUrl: true,
      description: true,
      genre: true,
      year: true,
      publisher: true,
      language: true,
      addedAt: true,
      copies: {
        where: { libraryId: { in: visibleLibIds } },
        select: PUBLIC_COPY_SELECT,
        orderBy: { addedAt: "asc" }
      }
    }
  })
  if (!book) return NextResponse.json({ error: "Livre introuvable." }, { status: 404 })
  return NextResponse.json({ book })
}

// Champs editables : tout sauf type/format/filePath/fileSize/addedBy/owner.
// On accepte null pour effacer un champ (sauf le titre).
const CoverUrl = z
  .string()
  .trim()
  .refine(
    (s) => s === "" || s.startsWith("/api/covers/") || /^https?:\/\//.test(s),
    { message: "URL de couverture invalide." }
  )

const PatchBody = z
  .object({
    title: z.string().trim().min(1).max(500).optional(),
    author: z.string().trim().max(300).nullable().optional(),
    isbn: z.string().trim().max(20).nullable().optional(),
    description: z.string().trim().max(5000).nullable().optional(),
    genre: z.string().trim().max(120).nullable().optional(),
    year: z.number().int().min(0).max(2200).nullable().optional(),
    publisher: z.string().trim().max(200).nullable().optional(),
    language: z.string().trim().max(10).nullable().optional(),
    coverUrl: CoverUrl.nullable().optional()
  })
  .strict()

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Non authentifie." }, { status: 401 })
  const { id } = await ctx.params

  // V1.6 : le livre n'existe pour l'user que s'il a une copie visible.
  const visibleLibIds = await getVisibleLibraryIds(db, session.user.id)
  if (visibleLibIds.length === 0) {
    return NextResponse.json({ error: "Livre introuvable." }, { status: 404 })
  }

  const book = await db.book.findFirst({
    where: {
      id,
      copies: { some: { libraryId: { in: visibleLibIds } } }
    },
    select: {
      id: true,
      copies: {
        where: { libraryId: { in: visibleLibIds } },
        select: { addedById: true }
      }
    }
  })
  if (!book) return NextResponse.json({ error: "Livre introuvable." }, { status: 404 })

  const isAdmin = session.user.role === "ADMIN"
  // Edition autorisee si l'user a ajoute au moins une copie VISIBLE du livre.
  const isCopyOwner = book.copies.some((c) => c.addedById === session.user.id)
  if (!isAdmin && !isCopyOwner) {
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 })
  }

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 })
  }
  const parsed = PatchBody.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Donnees invalides.", issues: parsed.error.flatten() },
      { status: 400 }
    )
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "Aucun champ a modifier." }, { status: 400 })
  }

  const data = parsed.data
  const normalized: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(data)) {
    if (k === "title") {
      if (typeof v === "string") normalized[k] = v
      continue
    }
    normalized[k] = v === "" ? null : v
  }

  // Si titre/auteur/isbn change, recalculer matchKey + normaliser ISBN
  if ("title" in normalized || "author" in normalized || "isbn" in normalized) {
    const current = await db.book.findUnique({
      where: { id },
      select: { title: true, author: true, isbn: true }
    })
    const finalTitle = (normalized.title as string | undefined) ?? current!.title
    const finalAuthor =
      "author" in normalized ? (normalized.author as string | null) : current!.author
    const finalIsbn = "isbn" in normalized ? (normalized.isbn as string | null) : current!.isbn
    normalized.matchKey = computeMatchKey(finalTitle, finalAuthor)
    normalized.isbn = normalizeIsbn(finalIsbn)
  }

  try {
    const updated = await db.book.update({
      where: { id },
      data: normalized,
      select: PUBLIC_BOOK_SELECT
    })
    return NextResponse.json({ book: updated })
  } catch (err) {
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code?: string }).code === "P2002"
    ) {
      return NextResponse.json(
        { error: "Un autre livre porte deja cet ISBN." },
        { status: 409 }
      )
    }
    throw err
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Non authentifie." }, { status: 401 })

  // Reserve admin (route nucleaire). Suppression normale = via DELETE copie.
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 })
  }

  const { id } = await ctx.params

  const book = await db.book.findUnique({
    where: { id },
    select: {
      id: true,
      copies: { select: { id: true, type: true, filePath: true } }
    }
  })
  if (!book) return NextResponse.json({ error: "Livre introuvable." }, { status: 404 })

  await db.book.delete({ where: { id } })

  for (const c of book.copies) {
    if (c.type === "DIGITAL") {
      await deleteByKey(c.filePath ?? null)
    }
  }

  return NextResponse.json({ ok: true })
}
