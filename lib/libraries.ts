// lib/libraries.ts
// =====================================================================
// Sifriya — helper centralise pour la visibilite des bibliotheques (V1.6)
// Source unique de verite utilisee par toutes les routes touchant
// Book/BookCopy/Loan. Toute logique de scoping passe par ici.
// =====================================================================

import type { PrismaClient } from "@prisma/client"

export const GENERALE_LIBRARY_ID = "lib_generale"

// Retourne tous les libraryId visibles par l'user.
// - ADMIN global : retourne TOUTES les Library en base.
// - USER : retourne uniquement les libraryId ou il a un LibraryMembership.
// La Generale est incluse comme tout autre membership (cree au seed/invite).
export async function getVisibleLibraryIds(
  db: Pick<PrismaClient, "user" | "libraryMembership" | "library">,
  userId: string
): Promise<string[]> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { role: true }
  })
  if (!user) return []

  if (user.role === "ADMIN") {
    const all = await db.library.findMany({ select: { id: true } })
    return all.map((l: { id: string }) => l.id)
  }

  const memberships = await db.libraryMembership.findMany({
    where: { userId },
    select: { libraryId: true }
  })
  return memberships.map((m: { libraryId: string }) => m.libraryId)
}

// True si l'user est ADMIN global OU gerant de la bib.
export async function canManageLibrary(
  db: Pick<PrismaClient, "user" | "library">,
  userId: string,
  libraryId: string
): Promise<boolean> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { role: true }
  })
  if (!user) return false
  if (user.role === "ADMIN") return true

  const lib = await db.library.findUnique({
    where: { id: libraryId },
    select: { managerId: true }
  })
  return lib?.managerId === userId
}

// True si l'user est ADMIN global OU membre de la bib.
// Utilise pour l'ajout de livres et la visibilite.
export async function isLibraryVisible(
  db: Pick<PrismaClient, "user" | "libraryMembership">,
  userId: string,
  libraryId: string
): Promise<boolean> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { role: true }
  })
  if (!user) return false
  if (user.role === "ADMIN") return true

  const membership = await db.libraryMembership.findUnique({
    where: { libraryId_userId: { libraryId, userId } },
    select: { id: true }
  })
  return Boolean(membership)
}

// Alias pour la semantique d'ajout — strictement identique a isLibraryVisible
// (un membre peut ajouter, un non-membre ne peut pas).
export const canAddBookToLibrary = isLibraryVisible
