// scripts/extract-smoke.ts
// Run avec : npx tsx scripts/extract-smoke.ts
// Necessite que l'engineer ait depose AU MOINS 1 EPUB et 1 PDF dans
// scripts/fixtures/bulk-import/ (gitignored).

import { readFileSync, readdirSync } from "fs"
import { join, extname } from "path"
import { extractFromEpub, extractFromPdf } from "../lib/metadata"

const FIXTURES = "scripts/fixtures/bulk-import"

async function main() {
  let files: string[] = []
  try {
    files = readdirSync(FIXTURES).filter((f) => /\.(epub|pdf)$/i.test(f))
  } catch {
    console.log(`Dossier ${FIXTURES} introuvable. Skip.`)
    return
  }
  if (files.length === 0) {
    console.log(`Aucun fichier .epub/.pdf dans ${FIXTURES}. Skip.`)
    return
  }
  for (const f of files) {
    const buf = readFileSync(join(FIXTURES, f))
    const ext = extname(f).toLowerCase()
    const meta =
      ext === ".epub" ? await extractFromEpub(buf) : await extractFromPdf(buf)
    console.log(`-- ${f} --`)
    console.log(`   title : ${meta.title ?? "<null>"}`)
    console.log(`   author: ${meta.author ?? "<null>"}`)
    console.log(`   isbn  : ${meta.isbn ?? "<null>"}`)
    console.log(`   lang  : ${meta.language ?? "<null>"}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
