// app/api/readings/[bookId]/route.ts
import { NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { PUBLIC_READING_SELECT } from "@/lib/readings"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const StatusBody = z.object({
  status: z.enum(["TO_READ", "READING", "READ"])
})

export async function PUT(req: Request, ctx: { params: Promise<{ bookId: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Non authentifie." }, { status: 401 })

  const { bookId } = await ctx.params

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 })
  }
  const parsed = StatusBody.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: "Statut invalide." }, { status: 400 })
  }

  const book = await db.book.findUnique({ where: { id: bookId }, select: { id: true } })
  if (!book) return NextResponse.json({ error: "Livre introuvable." }, { status: 404 })

  const reading = await db.reading.upsert({
    where: { userId_bookId: { userId: session.user.id, bookId } },
    update: { status: parsed.data.status },
    create: { userId: session.user.id, bookId, status: parsed.data.status },
    select: PUBLIC_READING_SELECT
  })

  return NextResponse.json({ reading }, { status: 200 })
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ bookId: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Non authentifie." }, { status: 401 })

  const { bookId } = await ctx.params

  // Idempotent : on accepte le cas ou la row n'existe pas.
  await db.reading
    .delete({
      where: { userId_bookId: { userId: session.user.id, bookId } }
    })
    .catch((err) => {
      if (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code?: string }).code === "P2025"
      ) {
        return
      }
      throw err
    })

  return NextResponse.json({ ok: true })
}
