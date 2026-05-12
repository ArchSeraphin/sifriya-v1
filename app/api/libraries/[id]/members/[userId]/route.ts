// app/api/libraries/[id]/members/[userId]/route.ts
// =====================================================================
// V1.6 — Suppression individuelle d'un membre d'une bibliothèque.
// DELETE : idempotent. Gérant ou ADMIN. Interdit sur la Générale. Refuse
// de retirer le gérant lui-même (passer d'abord par PATCH /libraries/[id]).
// =====================================================================

import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { GENERALE_LIBRARY_ID, canManageLibrary } from "@/lib/libraries"
import { logger } from "@/lib/logger"

export const dynamic = "force-dynamic"

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string; userId: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 })
  }

  const { id: libraryId, userId } = await ctx.params

  if (libraryId === GENERALE_LIBRARY_ID) {
    return NextResponse.json(
      {
        error:
          "La Bibliothèque générale a une appartenance gérée automatiquement."
      },
      { status: 403 }
    )
  }

  const canManage = await canManageLibrary(db, session.user.id, libraryId)
  if (!canManage) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  }

  const lib = await db.library.findUnique({
    where: { id: libraryId },
    select: { id: true, managerId: true }
  })
  if (!lib) {
    return NextResponse.json(
      { error: "Bibliothèque introuvable." },
      { status: 404 }
    )
  }

  // Anti-lockout : ne pas autoriser à retirer le gérant. Passer par PATCH
  // pour le changer d'abord.
  if (lib.managerId === userId) {
    return NextResponse.json(
      {
        error:
          "Impossible de retirer le gérant. Changez d'abord le gérant via PATCH /libraries/[id]."
      },
      { status: 400 }
    )
  }

  try {
    await db.libraryMembership.deleteMany({
      where: { libraryId, userId }
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    logger.error("libraries member DELETE failed", {
      libraryId,
      userId,
      err: String(err)
    })
    return NextResponse.json(
      { error: "Suppression impossible." },
      { status: 500 }
    )
  }
}
