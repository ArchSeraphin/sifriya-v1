import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAdmin } from "@/lib/auth"
import { deletePending } from "@/lib/storage"
import { logger } from "@/lib/logger"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const { id } = await ctx.params
  const session = await db.bulkImportSession.findUnique({
    where: { id },
    select: {
      id: true,
      ownerId: true,
      status: true,
      totalFiles: true,
      createdAt: true,
      updatedAt: true,
      committedAt: true,
      items: {
        select: {
          id: true,
          filename: true,
          format: true,
          fileSize: true,
          status: true,
          extractedTitle: true,
          extractedAuthor: true,
          extractedIsbn: true,
          candidatesJson: true,
          chosenCandidate: true,
          mergeIntoBookId: true,
          decision: true,
          errorMessage: true,
          committedBookId: true,
          committedCopyId: true,
          createdAt: true,
          updatedAt: true
        },
        orderBy: { createdAt: "asc" }
      }
    }
  })
  if (!session) return NextResponse.json({ error: "Session introuvable." }, { status: 404 })
  if (session.ownerId !== auth.userId) return NextResponse.json({ error: "Acces refuse." }, { status: 403 })

  return NextResponse.json({ session })
}

// DELETE — abandonne la session : status = ABANDONED, purge des pending files non commits.
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const { id } = await ctx.params

  // 1) Lecture initiale pour les checks (ownership, etat).
  const session = await db.bulkImportSession.findUnique({
    where: { id },
    select: { id: true, ownerId: true, status: true }
  })
  if (!session) return NextResponse.json({ error: "Session introuvable." }, { status: 404 })
  if (session.ownerId !== auth.userId) return NextResponse.json({ error: "Acces refuse." }, { status: 403 })
  if (session.status === "COMMITTED") {
    return NextResponse.json({ error: "Session deja commitee, impossible d'abandonner." }, { status: 409 })
  }

  // 2) Flip status atomiquement avec garde IN_PROGRESS.
  // Si un commit concurrent gagne la course, count === 0 et on retourne 409.
  // Apres ce point, aucun commit ne peut plus toucher aux fichiers pending de cette session
  // (Task 10 commit fera une garde symetrique).
  const flipped = await db.bulkImportSession.updateMany({
    where: { id, status: "IN_PROGRESS" },
    data: { status: "ABANDONED" }
  })
  if (flipped.count === 0) {
    // Etat a change entre la lecture et l'update — un commit a probablement gagne.
    return NextResponse.json({ error: "Session deja cloturee par un commit concurrent." }, { status: 409 })
  }

  // 3) Purger les pending files non commits (apres le flip, donc safe).
  const items = await db.bulkImportItem.findMany({
    where: { sessionId: id, uploadId: { not: null }, committedCopyId: null },
    select: { id: true, uploadId: true, format: true }
  })
  for (const item of items) {
    if (!item.uploadId) continue // narrow le type
    const ext = item.format.toLowerCase()
    await deletePending(item.uploadId, ext).catch((err) => {
      logger.warn("delete pending failed", { itemId: item.id, err: String(err) })
    })
  }

  return NextResponse.json({ ok: true })
}
