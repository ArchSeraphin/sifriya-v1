// scripts/match-smoke.ts
// Run avec : npx tsx scripts/match-smoke.ts
// Verifie que computeMatchKey est stable sur quelques cas typiques.

import { computeMatchKey, normalizeIsbn } from "../lib/match"

type Case = { label: string; got: string; want: string }

const cases: Case[] = [
  {
    label: "accents minuscules ponctuation",
    got: computeMatchKey("Candide ou l'Optimisme", "Voltaire"),
    want: "candide ou l optimisme--voltaire"
  },
  {
    label: "Hugo - Misérables",
    got: computeMatchKey("Les Misérables", "Victor Hugo"),
    want: "les miserables--victor hugo"
  },
  {
    label: "auteur null",
    got: computeMatchKey("Candide", null),
    want: "candide--"
  },
  {
    label: "double espace",
    got: computeMatchKey("Le  Petit   Prince", "Saint-Exupéry"),
    want: "le petit prince--saint exupery"
  },
  {
    label: "ISBN nettoyage",
    got: normalizeIsbn("978-2-07-040846-9") ?? "<null>",
    want: "9782070408469"
  },
  {
    label: "ISBN vide",
    got: normalizeIsbn("  ") ?? "<null>",
    want: "<null>"
  }
]

let failed = 0
for (const c of cases) {
  const ok = c.got === c.want
  console.log(`${ok ? "OK" : "FAIL"}  ${c.label}\n      got:  ${c.got}\n      want: ${c.want}`)
  if (!ok) failed++
}
process.exit(failed === 0 ? 0 : 1)
