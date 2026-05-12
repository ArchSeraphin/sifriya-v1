// app/api/libraries/[id]/members/route.ts
// =====================================================================
// V1.6 — Remplacement atomique de la liste des membres d'une bibliothèque.
// PUT : reçoit la liste cible, calcule add/remove, applique en transaction.
// Réservé aux gérants et ADMIN. Interdit sur la Bibliothèque générale
// (gérée automatiquement via l'invite).
// =====================================================================

import { NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { GENERALE_LIBRARY_ID, canManageLibrary } from "@/lib/libraries"
import { logger } from "@/lib/logger"

export const dynamic = "force-dynamic"

const PutBody = z
  .object({
    userIds: z.array(z.string().min(1)).max(1000)
  })
  .strict()

export async function PUT(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 })
  }
  const { id: libraryId } = await ctx.params

  const canManage = await canManageLibrary(db, session.user.id, libraryId)
  if (!canManage) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  }

  if (libraryId === GENERALE_LIBRARY_ID) {
    return NextResponse.json(
      {
        error:
          "La Bibliothèque générale a une appartenance gérée automatiquement."
      },
      { status: 403 }
    )
  }

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 })
  }
  const parsed = PutBody.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides." }, { status: 400 })
  }

  const targetIds = new Set(parsed.data.userIds)

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

  // Anti-lockout : si l'appelant est le gérant actuel ET se retire lui-même,
  // bloquer. ADMINs bypass (leur rôle ne dépend pas du membership).
  const callerRole = session.user.role
  if (
    callerRole !== "ADMIN" &&
    lib.managerId === session.user.id &&
    !targetIds.has(session.user.id)
  ) {
    return NextResponse.json(
      {
        error:
          "Vous ne pouvez pas vous retirer vous-même de la bibliothèque que vous gérez."
      },
      { status: 400 }
    )
  }

  // Anti-orphan : un gérant nommé doit toujours rester membre de sa biblio,
  // sinon il aurait le pouvoir de gérer mais ne verrait plus le catalogue
  // (canManage=true mais isLibraryVisible=false). Si l'appelant (ADMIN ici)
  // omet le manager du target set, on le réinjecte silencieusement.
  if (lib.managerId && !targetIds.has(lib.managerId)) {
    targetIds.add(lib.managerId)
  }

  // Valider que tous les userIds existent en un seul roundtrip.
  if (targetIds.size > 0) {
    const idsArray = Array.from(targetIds)
    const found = await db.user.findMany({
      where: { id: { in: idsArray } },
      select: { id: true }
    })
    if (found.length !== idsArray.length) {
      return NextResponse.json(
        { error: "Un ou plusieurs utilisateurs sont introuvables." },
        { status: 400 }
      )
    }
  }

  try {
    await db.$transaction(async (tx) => {
      const existing = await tx.libraryMembership.findMany({
        where: { libraryId },
        select: { userId: true }
      })
      const existingIds = new Set(existing.map((m) => m.userId))

      const toAdd: string[] = []
      for (const uid of targetIds) {
        if (!existingIds.has(uid)) toAdd.push(uid)
      }
      const toRemove: string[] = []
      for (const uid of existingIds) {
        if (!targetIds.has(uid)) toRemove.push(uid)
      }

      if (toAdd.length > 0) {
        await tx.libraryMembership.createMany({
          data: toAdd.map((userId) => ({ libraryId, userId })),
          skipDuplicates: true
        })
      }
      if (toRemove.length > 0) {
        await tx.libraryMembership.deleteMany({
          where: { libraryId, userId: { in: toRemove } }
        })
      }
    })

    return NextResponse.json({ ok: true, memberCount: targetIds.size })
  } catch (err) {
    logger.error("libraries members PUT failed", {
      libraryId,
      err: String(err)
    })
    return NextResponse.json(
      { error: "Mise à jour des membres impossible." },
      { status: 500 }
    )
  }
}
