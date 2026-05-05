import { NextResponse } from "next/server"
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
