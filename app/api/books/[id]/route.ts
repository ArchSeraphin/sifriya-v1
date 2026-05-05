import { NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { deleteByKey } from "@/lib/storage"
import { PUBLIC_BOOK_SELECT } from "@/lib/books"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Non authentifie." }, { status: 401 })
  const { id } = await ctx.params
  const book = await db.book.findUnique({ where: { id }, select: PUBLIC_BOOK_SELECT })
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

  const book = await db.book.findUnique({
    where: { id },
    select: { id: true, addedById: true }
  })
  if (!book) return NextResponse.json({ error: "Livre introuvable." }, { status: 404 })

  const isAdmin = session.user.role === "ADMIN"
  const isAuthor = book.addedById === session.user.id
  if (!isAdmin && !isAuthor) {
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

  // "" -> null pour les champs textuels nullable.
  const data = parsed.data
  const normalized: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(data)) {
    if (k === "title") {
      if (typeof v === "string") normalized[k] = v
      continue
    }
    normalized[k] = v === "" ? null : v
  }

  const updated = await db.book.update({
    where: { id },
    data: normalized,
    select: PUBLIC_BOOK_SELECT
  })
  return NextResponse.json({ book: updated })
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Non authentifie." }, { status: 401 })
  const { id } = await ctx.params

  const book = await db.book.findUnique({
    where: { id },
    select: { id: true, addedById: true, filePath: true }
  })
  if (!book) return NextResponse.json({ error: "Livre introuvable." }, { status: 404 })

  const isAdmin = session.user.role === "ADMIN"
  const isOwner = book.addedById === session.user.id
  if (!isAdmin && !isOwner) {
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 })
  }

  await db.book.delete({ where: { id } })
  await deleteByKey(book.filePath ?? null)
  return NextResponse.json({ ok: true })
}
