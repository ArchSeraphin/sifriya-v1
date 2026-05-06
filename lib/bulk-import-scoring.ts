// lib/bulk-import-scoring.ts
// =====================================================================
// Sifriya — scoring des candidats bulk import
// Decide si un item passe en AUTO_OK (decision pre-remplie) ou en
// TO_REVIEW / DUPLICATE / MANUAL (decision admin requise).
// =====================================================================

import levenshtein from "fast-levenshtein"
import type { BookMetadata, ExtractedMetadata } from "@/lib/metadata"
import type { BookMatch } from "@/lib/match"
import { normalizeIsbn } from "@/lib/match"

export type ScoringStatus = "AUTO_OK" | "TO_REVIEW" | "MANUAL" | "DUPLICATE"

export type ScoringResult = {
  status: ScoringStatus
  chosenCandidate: BookMetadata | null
  mergeIntoBookId: string | null
}

// Normalisation pour le scoring (lowercase, sans diacritiques, espaces nets)
function norm(s: string | null | undefined): string {
  if (!s) return ""
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

// Similarite normalisee : 1 = identique, 0 = totalement different.
function similarity(a: string, b: string): number {
  const A = norm(a)
  const B = norm(b)
  if (!A || !B) return 0
  const max = Math.max(A.length, B.length)
  if (max === 0) return 1
  const dist = levenshtein.get(A, B)
  return 1 - dist / max
}

export function scoreCandidates(input: {
  extracted: ExtractedMetadata
  candidates: BookMetadata[]
  existingMatch: BookMatch | null
}): ScoringResult {
  const { extracted, candidates, existingMatch } = input

  // ISBN normalise une seule fois (hyphens / espaces / X final)
  const extIsbn = normalizeIsbn(extracted.isbn)

  // 1) Doublon avec biblio existante (priorite absolue)
  if (existingMatch) {
    const matchedCandidate =
      (extIsbn ? candidates.find((c) => normalizeIsbn(c.isbn) === extIsbn) : undefined) ??
      candidates[0] ??
      null
    return {
      status: "DUPLICATE",
      chosenCandidate: matchedCandidate,
      mergeIntoBookId: existingMatch.bookId
    }
  }

  // 2) Match ISBN strict avec un candidat API
  if (extIsbn) {
    const isbnHit = candidates.find((c) => normalizeIsbn(c.isbn) === extIsbn)
    if (isbnHit) {
      return { status: "AUTO_OK", chosenCandidate: isbnHit, mergeIntoBookId: null }
    }
  }

  // 3) Match titre+auteur unique fort
  if (extracted.title && candidates.length > 0) {
    const scored = candidates
      .map((c) => ({
        c,
        titleScore: similarity(extracted.title!, c.title),
        authorScore:
          extracted.author && c.author ? similarity(extracted.author, c.author) : 0
      }))
      .sort((a, b) => b.titleScore + b.authorScore - (a.titleScore + a.authorScore))

    const top = scored[0]
    const others = scored.slice(1, 3)
    if (top) {
      const topStrong =
        top.titleScore >= 0.85 &&
        top.authorScore >= 0.85
      const noOtherCloseEnough = others.every((o) => o.titleScore < 0.7)

      if (topStrong && noOtherCloseEnough) {
        return { status: "AUTO_OK", chosenCandidate: top.c, mergeIntoBookId: null }
      }
    }
  }

  // 4) Au moins un candidat -> review manuel
  if (candidates.length > 0) {
    return { status: "TO_REVIEW", chosenCandidate: null, mergeIntoBookId: null }
  }

  // 5) Rien du tout -> saisie manuelle
  return { status: "MANUAL", chosenCandidate: null, mergeIntoBookId: null }
}
