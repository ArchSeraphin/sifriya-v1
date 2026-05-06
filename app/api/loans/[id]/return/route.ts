import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

// PATCH /api/loans/[id]/return — le proprietaire marque le livre comme rendu.
export async function PATCH(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Non authentifie." }, { status: 401 })
  const { id } = await ctx.params

  const loan = await db.loan.findUnique({ where: { id } })
  if (!loan) return NextResponse.json({ error: "Pret introuvable." }, { status: 404 })
  if (loan.ownerId !== session.user.id) {
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 })
  }
  if (loan.status !== "ACCEPTED") {
    return NextResponse.json(
      { error: "Seul un pret accepte peut etre marque comme rendu." },
      { status: 400 }
    )
  }

  const updated = await db.loan.update({
    where: { id },
    data: { status: "RETURNED", returnedAt: new Date() },
    select: {
      id: true,
      status: true,
      createdAt: true,
      returnedAt: true,
      copy: {
        select: {
          id: true,
          type: true,
          book: {
            select: { id: true, title: true, author: true, coverUrl: true }
          },
          owner: { select: { id: true, name: true, email: true, avatarColor: true } }
        }
      },
      requester: { select: { id: true, name: true, email: true, avatarColor: true } },
      owner: { select: { id: true, name: true, email: true, avatarColor: true } }
    }
  })
  return NextResponse.json({ loan: updated })
}
