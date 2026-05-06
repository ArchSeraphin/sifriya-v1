// scripts/scoring-smoke.ts
// Run avec : npx tsx scripts/scoring-smoke.ts
// Verifie le scoring sur une matrice de cas types.

import { scoreCandidates } from "../lib/bulk-import-scoring"
import type { BookMetadata } from "../lib/metadata"

const cand = (overrides: Partial<BookMetadata>): BookMetadata => ({
  source: "google_books",
  externalId: "x",
  title: "Test",
  author: null,
  isbn: null,
  year: null,
  publisher: null,
  language: null,
  coverUrl: null,
  description: null,
  genre: null,
  ...overrides
})

type Case = { label: string; expect: string; got: string }

const cases: Case[] = []

function run(label: string, expect: string, gotStatus: string) {
  const ok = expect === gotStatus
  cases.push({ label, expect, got: gotStatus })
  console.log(`${ok ? "OK" : "FAIL"}  ${label} (expect ${expect}, got ${gotStatus})`)
}

// 1. Doublon ISBN biblio
run(
  "doublon ISBN biblio",
  "DUPLICATE",
  scoreCandidates({
    extracted: { title: "X", author: null, isbn: "9782070408469", language: null },
    candidates: [cand({ isbn: "9782070408469", title: "X" })],
    existingMatch: { bookId: "book1", confidence: "high" }
  }).status
)

// 2. ISBN strict avec candidat API
run(
  "ISBN strict candidat API",
  "AUTO_OK",
  scoreCandidates({
    extracted: { title: "Candide", author: "Voltaire", isbn: "9782070408469", language: "fr" },
    candidates: [cand({ isbn: "9782070408469", title: "Candide", author: "Voltaire" })],
    existingMatch: null
  }).status
)

// 3. Titre+auteur unique fort
run(
  "titre auteur unique fort",
  "AUTO_OK",
  scoreCandidates({
    extracted: { title: "Le Comte de Monte-Cristo", author: "Alexandre Dumas", isbn: null, language: null },
    candidates: [cand({ title: "Le Comte de Monte-Cristo", author: "Alexandre Dumas" })],
    existingMatch: null
  }).status
)

// 4. Titre similaire mais 2 candidats proches -> TO_REVIEW
run(
  "deux candidats proches",
  "TO_REVIEW",
  scoreCandidates({
    extracted: { title: "Document Final", author: "Auteur Inconnu", isbn: null, language: null },
    candidates: [
      cand({ title: "Document Final", author: "Auteur A" }),
      cand({ title: "Document Final", author: "Auteur B" })
    ],
    existingMatch: null
  }).status
)

// 5. Aucun candidat
run(
  "aucun candidat",
  "MANUAL",
  scoreCandidates({
    extracted: { title: "scan-2018", author: null, isbn: null, language: null },
    candidates: [],
    existingMatch: null
  }).status
)

// 6. Auteur manquant -> jamais AUTO_OK via titre seul
run(
  "auteur manquant -> TO_REVIEW",
  "TO_REVIEW",
  scoreCandidates({
    extracted: { title: "Le Petit Prince", author: null, isbn: null, language: null },
    candidates: [cand({ title: "Le Petit Prince", author: "Saint-Exupery" })],
    existingMatch: null
  }).status
)

const failed = cases.filter((c) => c.expect !== c.got).length
process.exit(failed === 0 ? 0 : 1)
