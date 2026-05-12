// app/api/libraries/[id]/route.ts
// =====================================================================
// V1.6 — Gestion d'une bibliothèque par son ID.
// GET    : détail visible par tout membre. Inclut la liste des membres
//          si l'user peut gérer (ADMIN ou gérant).
// PATCH  : ADMIN uniquement. Permet renommer, décrire, changer gérant.
// DELETE : ADMIN uniquement. Refuse si Générale ou si copies > 0.
// =====================================================================

import { NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession } from "next-auth/next"
import { authOptions, requireAdmin } from "@/lib/auth"
import { db } from "@/lib/db"
import {
  GENERALE_LIBRARY_ID,
  canManageLibrary,
  isLibraryVisible
} from "@/lib/libraries"
import { logger } from "@/lib/logger"

export const dynamic = "force-dynamic"

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 })
  }
  const { id } = await ctx.params

  const visible = await isLibraryVisible(db, session.user.id, id)
  if (!visible) {
    return NextResponse.json(
      { error: "Bibliothèque introuvable." },
      { status: 404 }
    )
  }

  const canManage = await canManageLibrary(db, session.user.id, id)

  const lib = await db.library.findUnique({
    where: { id },
    include: {
      manager: {
        select: { id: true, name: true, email: true, avatarColor: true }
      },
      _count: { select: { copies: true, memberships: true } },
      ...(canManage
        ? {
            memberships: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                    avatarColor: true
                  }
                }
              },
              orderBy: { addedAt: "asc" }
            }
          }
        : {})
    }
  })

  if (!lib) {
    return NextResponse.json(
      { error: "Bibliothèque introuvable." },
      { status: 404 }
    )
  }

  const members = canManage
    ? // `memberships` est inclus uniquement quand canManage, donc on cast pour
      // satisfaire le typage conditionnel de Prisma.
      ((lib as unknown as {
        memberships: Array<{
          user: {
            id: string
            name: string | null
            email: string
            avatarColor: string
          }
        }>
      }).memberships ?? []).map((m) => m.user)
    : null

  return NextResponse.json({
    library: {
      id: lib.id,
      name: lib.name,
      description: lib.description,
      isDefault: lib.isDefault,
      manager: lib.manager,
      bookCount: lib._count.copies,
      memberCount: lib._count.memberships,
      members
    }
  })
}

const PatchBody = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    managerId: z.string().min(1).nullable().optional()
  })
  .strict()

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const { id } = await ctx.params

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 })
  }

  const parsed = PatchBody.safeParse(raw)
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "Données invalides." }, { status: 400 })
  }

  const { name, description, managerId } = parsed.data

  if (managerId !== undefined && managerId !== null) {
    const manager = await db.user.findUnique({
      where: { id: managerId },
      select: { id: true }
    })
    if (!manager) {
      return NextResponse.json(
        { error: "Gérant introuvable." },
        { status: 400 }
      )
    }
  }

  try {
    const library = await db.$transaction(async (tx) => {
      const updateData: {
        name?: string
        description?: string | null
        managerId?: string | null
      } = {}
      if (name !== undefined) updateData.name = name
      if (description !== undefined) updateData.description = description
      if (managerId !== undefined) updateData.managerId = managerId

      const updated = await tx.library.update({
        where: { id },
        data: updateData
      })

      // Si un gérant est nommé, il doit toujours être membre.
      if (managerId) {
        await tx.libraryMembership.upsert({
          where: { libraryId_userId: { libraryId: id, userId: managerId } },
          create: { libraryId: id, userId: managerId },
          update: {}
        })
      }

      return tx.library.findUnique({
        where: { id: updated.id },
        include: {
          manager: {
            select: { id: true, name: true, email: true, avatarColor: true }
          },
          _count: { select: { copies: true, memberships: true } }
        }
      })
    })

    if (!library) {
      return NextResponse.json(
        { error: "Bibliothèque introuvable." },
        { status: 404 }
      )
    }

    return NextResponse.json({
      library: {
        id: library.id,
        name: library.name,
        description: library.description,
        isDefault: library.isDefault,
        manager: library.manager,
        bookCount: library._count.copies,
        memberCount: library._count.memberships
      }
    })
  } catch (err) {
    logger.error("libraries PATCH failed", { id, err: String(err) })
    return NextResponse.json(
      { error: "Bibliothèque introuvable." },
      { status: 404 }
    )
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const { id } = await ctx.params

  if (id === GENERALE_LIBRARY_ID) {
    return NextResponse.json(
      { error: "La Bibliothèque générale ne peut pas être supprimée." },
      { status: 403 }
    )
  }

  const lib = await db.library.findUnique({
    where: { id },
    select: { id: true, _count: { select: { copies: true } } }
  })
  if (!lib) {
    return NextResponse.json(
      { error: "Bibliothèque introuvable." },
      { status: 404 }
    )
  }

  if (lib._count.copies > 0) {
    return NextResponse.json(
      {
        error:
          "Impossible de supprimer : la bibliothèque contient encore des livres.",
        bookCount: lib._count.copies
      },
      { status: 409 }
    )
  }

  try {
    await db.library.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    logger.error("libraries DELETE failed", { id, err: String(err) })
    return NextResponse.json(
      { error: "Suppression impossible." },
      { status: 500 }
    )
  }
}
