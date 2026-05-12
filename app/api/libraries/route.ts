// app/api/libraries/route.ts
// =====================================================================
// V1.6 — Surface de gestion des bibliothèques.
// GET  : liste les bibliothèques visibles par l'user (ADMIN voit tout).
// POST : crée une nouvelle bibliothèque (ADMIN uniquement).
// =====================================================================

import { NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession } from "next-auth/next"
import { authOptions, requireAdmin } from "@/lib/auth"
import { db } from "@/lib/db"
import { getVisibleLibraryIds } from "@/lib/libraries"
import { logger } from "@/lib/logger"

export const dynamic = "force-dynamic"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 })
  }

  const visibleIds = await getVisibleLibraryIds(db, session.user.id)
  if (visibleIds.length === 0) {
    return NextResponse.json({ libraries: [] })
  }

  const libs = await db.library.findMany({
    where: { id: { in: visibleIds } },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    include: {
      manager: {
        select: { id: true, name: true, email: true, avatarColor: true }
      },
      _count: { select: { copies: true, memberships: true } }
    }
  })

  const libraries = libs.map((lib) => ({
    id: lib.id,
    name: lib.name,
    description: lib.description,
    isDefault: lib.isDefault,
    manager: lib.manager,
    bookCount: lib._count.copies,
    memberCount: lib._count.memberships
  }))

  return NextResponse.json({ libraries })
}

const PostBody = z
  .object({
    name: z.string().trim().min(1).max(100),
    description: z.string().trim().max(500).optional(),
    managerId: z.string().nullable().optional()
  })
  .strict()

export async function POST(req: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 })
  }

  const parsed = PostBody.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides." }, { status: 400 })
  }

  const { name, description, managerId } = parsed.data

  if (managerId) {
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
      const lib = await tx.library.create({
        data: {
          name,
          description: description ?? null,
          managerId: managerId ?? null
        },
        include: {
          manager: {
            select: { id: true, name: true, email: true, avatarColor: true }
          },
          _count: { select: { copies: true, memberships: true } }
        }
      })

      if (managerId) {
        // Le gérant doit toujours être membre de sa propre bibliothèque.
        await tx.libraryMembership.create({
          data: { libraryId: lib.id, userId: managerId }
        })
      }

      // Recharger _count après la création du membership.
      const refreshed = await tx.library.findUnique({
        where: { id: lib.id },
        include: {
          manager: {
            select: { id: true, name: true, email: true, avatarColor: true }
          },
          _count: { select: { copies: true, memberships: true } }
        }
      })
      return refreshed ?? lib
    })

    const payload = {
      id: library.id,
      name: library.name,
      description: library.description,
      isDefault: library.isDefault,
      manager: library.manager,
      bookCount: library._count.copies,
      memberCount: library._count.memberships
    }
    return NextResponse.json({ library: payload }, { status: 201 })
  } catch (err) {
    logger.error("libraries POST failed", { err: String(err) })
    return NextResponse.json(
      { error: "Création impossible." },
      { status: 500 }
    )
  }
}
