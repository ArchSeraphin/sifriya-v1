// lib/bulk-import-commit.ts
// =====================================================================
// Sifriya — groupage des items CREATE par signature commune (doublons
// internes au lot). Sortie : un mapping signature -> liste d'items.
//
// Pure : aucune dependance Prisma / fs. Importable depuis un script de
// smoke test sans charger lib/db.ts.
// =====================================================================

import { computeMatchKey, normalizeIsbn } from "./match"

export type CommitItemInput = {
  id: string
  extractedIsbn: string | null
  chosenCandidate: {
    isbn?: string | null
    externalId?: string
    title: string
    author: string | null
  } | null
}

// Une "signature" identifie un Book unique. Priorite ISBN > externalId > matchKey.
// Un item sans candidat (cas formOverrides en MANUAL sans titre) recoit une
// signature unique basee sur son id, ce qui evite de regrouper a tort.
export function signatureFor(item: CommitItemInput): string {
  const isbn = normalizeIsbn(item.chosenCandidate?.isbn ?? item.extractedIsbn)
  if (isbn) return `isbn:${isbn}`
  if (item.chosenCandidate?.externalId) return `ext:${item.chosenCandidate.externalId}`
  if (item.chosenCandidate) {
    return `mk:${computeMatchKey(item.chosenCandidate.title, item.chosenCandidate.author)}`
  }
  return `solo:${item.id}`
}

// Groupe les items par signature. L'ordre des items est preserve dans chaque groupe :
// le premier item du groupe sera celui qui cree le Book, les suivants seront
// ajoutes comme copies du meme Book (ex : EPUB + PDF du meme livre dans un meme lot).
export function groupBySignature(items: CommitItemInput[]): Map<string, CommitItemInput[]> {
  const groups = new Map<string, CommitItemInput[]>()
  for (const item of items) {
    const sig = signatureFor(item)
    const list = groups.get(sig) ?? []
    list.push(item)
    groups.set(sig, list)
  }
  return groups
}
