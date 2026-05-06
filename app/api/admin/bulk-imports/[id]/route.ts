import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAdmin } from "@/lib/auth"
import { deletePending } from "@/lib/storage"
import { logger } from "@/lib/logger"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// DELETE — abandonne la session : status = ABANDONED, purge des pending files non commits.
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const { id } = await ctx.params

  const session = await db.bulkImportSession.findUnique({
    where: { id },
    select: {
      id: true,
      ownerId: true,
      status: true,
      items: { select: { id: true, uploadId: true, format: true, committedCopyId: true } }
    }
  })
  if (!session) return NextResponse.json({ error: "Session introuvable." }, { status: 404 })
  if (session.ownerId !== auth.userId) return NextResponse.json({ error: "Acces refuse." }, { status: 403 })
  if (session.status === "COMMITTED") {
    return NextResponse.json({ error: "Session deja commitee, impossible d'abandonner." }, { status: 409 })
  }

  // Purger les pending files non commits
  for (const item of session.items) {
    if (item.uploadId && !item.committedCopyId) {
      const ext = item.format.toLowerCase()
      await deletePending(item.uploadId, ext).catch((err) => {
        logger.warn("delete pending failed", { itemId: item.id, err: String(err) })
      })
    }
  }

  await db.bulkImportSession.update({
    where: { id },
    data: { status: "ABANDONED" }
  })

  return NextResponse.json({ ok: true })
}
