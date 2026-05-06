// app/api/books/[id]/copies/[cid]/route.ts
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { deleteByKey } from "@/lib/storage"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string; cid: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Non authentifie." }, { status: 401 })

  const { id: bookId, cid: copyId } = await ctx.params

  const copy = await db.bookCopy.findUnique({
    where: { id: copyId },
    select: {
      id: true,
      bookId: true,
      type: true,
      filePath: true,
      addedById: true,
      loans: {
        where: { status: { in: ["PENDING", "ACCEPTED"] } },
        select: { id: true }
      }
    }
  })
  if (!copy || copy.bookId !== bookId) {
    return NextResponse.json({ error: "Copie introuvable." }, { status: 404 })
  }

  const isAdmin = session.user.role === "ADMIN"
  const isAdder = copy.addedById === session.user.id
  if (!isAdmin && !isAdder) {
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 })
  }

  if (copy.type === "PHYSICAL" && copy.loans.length > 0) {
    return NextResponse.json(
      {
        error:
          "Cette copie est actuellement pretee. Marquez le pret comme rendu avant de la retirer."
      },
      { status: 409 }
    )
  }

  await db.$transaction(async (tx) => {
    await tx.bookCopy.delete({ where: { id: copyId } })
    const remaining = await tx.bookCopy.count({ where: { bookId } })
    if (remaining === 0) {
      await tx.book.delete({ where: { id: bookId } })
    }
  })

  if (copy.type === "DIGITAL") {
    await deleteByKey(copy.filePath ?? null)
  }

  return NextResponse.json({ ok: true })
}
