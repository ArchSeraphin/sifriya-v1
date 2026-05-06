// scripts/cleanup-pending.ts
// =====================================================================
// Sifriya — cleanup des uploads orphelins (_pending/)
//
// Supprime tous les fichiers dans `${UPLOAD_DIR}/_pending/` plus vieux que
// PENDING_TTL_MS (1h par defaut).
//
// Cas d'usage : un user demarre un upload (POST /api/uploads cree un fichier
// dans _pending/) puis abandonne avant que POST /api/books ne fasse le
// commitPending qui le deplace vers copies/. Le fichier reste oublie.
//
// Run :
//   npx tsx scripts/cleanup-pending.ts             # production
//   PENDING_TTL_MS=60000 npx tsx scripts/cleanup-pending.ts  # tests
//
// Coolify : configurer une scheduled task qui execute cette commande toutes
// les heures dans le container app. Si le dossier _pending/ n'existe pas
// encore, le script log et termine (exit 0).
// =====================================================================

import { promises as fs } from "node:fs"
import path from "node:path"

const PENDING_DIR_NAME = "_pending"
const DEFAULT_TTL_MS = 60 * 60 * 1000 // 1h

async function main() {
  const root = process.env.UPLOAD_DIR ?? "./uploads"
  const pendingDir = path.join(root, PENDING_DIR_NAME)
  const ttlMs = Number(process.env.PENDING_TTL_MS ?? DEFAULT_TTL_MS)
  const now = Date.now()

  let entries: string[]
  try {
    entries = await fs.readdir(pendingDir)
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === "ENOENT") {
      console.log(`[cleanup-pending] ${pendingDir} n'existe pas, rien a faire.`)
      return
    }
    throw err
  }

  let removed = 0
  let kept = 0
  let errors = 0

  for (const name of entries) {
    const full = path.join(pendingDir, name)
    let stat
    try {
      stat = await fs.stat(full)
    } catch (err) {
      console.error(`[cleanup-pending] stat ${full} a echoue :`, err)
      errors++
      continue
    }
    if (!stat.isFile()) continue
    const age = now - stat.mtimeMs
    if (age <= ttlMs) {
      kept++
      continue
    }
    try {
      await fs.unlink(full)
      removed++
    } catch (err) {
      console.error(`[cleanup-pending] unlink ${full} a echoue :`, err)
      errors++
    }
  }

  console.log(
    `[cleanup-pending] termine : ${removed} supprime(s), ${kept} conserve(s), ${errors} erreur(s) (TTL ${ttlMs}ms, dir ${pendingDir})`
  )
  if (errors > 0) process.exit(1)
}

main().catch((err) => {
  console.error("[cleanup-pending] erreur fatale :", err)
  process.exit(1)
})
