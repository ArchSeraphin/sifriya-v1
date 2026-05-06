// scripts/commit-grouping-smoke.ts
// Run avec : npx tsx scripts/commit-grouping-smoke.ts
// Verifie le groupage des items CREATE par signature commune.

import { groupBySignature, signatureFor } from "../lib/bulk-import-commit"

const items = [
  {
    id: "a",
    extractedIsbn: "9782070408469",
    chosenCandidate: { isbn: "9782070408469", externalId: "g:1", title: "Candide", author: "Voltaire" }
  },
  {
    id: "b", // meme ISBN que a (EPUB + PDF du meme livre)
    extractedIsbn: null,
    chosenCandidate: { isbn: "978-2-07-040846-9", externalId: "g:2", title: "Candide", author: "Voltaire" }
  },
  {
    id: "c",
    extractedIsbn: null,
    chosenCandidate: { isbn: null, externalId: "g:3", title: "1984", author: "Orwell" }
  },
  {
    id: "d", // meme externalId que c
    extractedIsbn: null,
    chosenCandidate: { isbn: null, externalId: "g:3", title: "1984", author: "Orwell" }
  },
  {
    id: "e", // sans candidat
    extractedIsbn: null,
    chosenCandidate: null
  }
]

const groups = groupBySignature(items)
let failed = 0
function expect(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "OK" : "FAIL"}  ${label}${detail ? " — " + detail : ""}`)
  if (!ok) failed++
}

// 5 items -> 3 groupes : {a,b} fusionnes par ISBN, {c,d} par externalId, {e} solo.
expect("3 groupes attendus", groups.size === 3, `got ${groups.size}`)

const groupCounts = [...groups.values()].map((g) => g.length).sort()
expect("repartition [1,2,2]", JSON.stringify(groupCounts) === "[1,2,2]", `got ${JSON.stringify(groupCounts)}`)

expect("a et b dans meme groupe", signatureFor(items[0]!) === signatureFor(items[1]!))
expect("c et d dans meme groupe", signatureFor(items[2]!) === signatureFor(items[3]!))
expect("e isole", signatureFor(items[4]!) === `solo:e`)

process.exit(failed === 0 ? 0 : 1)
