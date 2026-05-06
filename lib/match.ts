// lib/match.ts
// =====================================================================
// Sifriya — detection des doublons (V1.3)
// La matchKey est un slug normalise (titre + auteur) servant de fallback
// quand l'ISBN n'est pas renseigne. ISBN reste la cle primaire d'œuvre.
// =====================================================================

import type { PrismaClient } from "@prisma/client"

export function computeMatchKey(title: string, author: string | null | undefined): string {
  const norm = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "") // diacritiques
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, " ") // ponctuation -> espace
      .replace(/\s+/g, " ")
      .trim()
  return `${norm(title)}--${norm(author ?? "")}`
}

// Normalise l'ISBN : retire tirets/espaces. Renvoie null si vide.
export function normalizeIsbn(isbn: string | null | undefined): string | null {
  if (!isbn) return null
  const cleaned = isbn.replace(/[^0-9Xx]/g, "").toUpperCase()
  return cleaned.length === 0 ? null : cleaned
}

export type MatchConfidence = "high" | "low"

export type BookMatch = {
  bookId: string
  confidence: MatchConfidence
}

// Cherche un Book existant correspondant a l'œuvre proposee.
// Priorite : ISBN strict -> matchKey.
// `db` est injecte en parametre pour que match.ts reste sans side-effect a
// l'import (le smoke test importe les fonctions pures sans charger lib/db.ts).
export async function findMatchingBook(
  db: Pick<PrismaClient, "book">,
  input: {
    title: string
    author?: string | null
    isbn?: string | null
  }
): Promise<BookMatch | null> {
  const isbn = normalizeIsbn(input.isbn)
  if (isbn) {
    const byIsbn = await db.book.findFirst({
      where: { isbn },
      select: { id: true }
    })
    if (byIsbn) return { bookId: byIsbn.id, confidence: "high" }
  }

  const matchKey = computeMatchKey(input.title, input.author ?? null)
  if (matchKey === "--") return null

  const bySlug = await db.book.findFirst({
    where: { matchKey },
    select: { id: true }
  })
  if (bySlug) return { bookId: bySlug.id, confidence: "low" }

  return null
}
