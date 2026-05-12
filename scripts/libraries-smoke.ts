// scripts/libraries-smoke.ts
// Lance : npx tsx scripts/libraries-smoke.ts
// Suppose : DB locale avec au moins 1 ADMIN + 1 USER + lib_generale seeded.

import "dotenv/config"
import path from "node:path"
import fs from "node:fs"
import { config as loadDotenv } from "dotenv"
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import {
  getVisibleLibraryIds,
  canManageLibrary,
  isLibraryVisible,
  GENERALE_LIBRARY_ID
} from "../lib/libraries"

for (const f of [".env.local", ".env"]) {
  const p = path.resolve(process.cwd(), f)
  if (fs.existsSync(p)) loadDotenv({ path: p, override: false })
}

const dbUrl = process.env.DATABASE_URL
if (!dbUrl) throw new Error("DATABASE_URL manquant")

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: dbUrl }) })

async function main() {
  const admin = await db.user.findFirst({ where: { role: "ADMIN" } })
  const user = await db.user.findFirst({ where: { role: "USER" } })

  if (!admin || !user) {
    console.error("Need at least 1 ADMIN + 1 USER. Run npm run db:seed and create a USER first.")
    console.error("Tip: npx tsx scripts/dev-magic-link.ts test-user@example.com")
    process.exit(1)
  }

  console.log(`ADMIN  : ${admin.email} (${admin.id})`)
  console.log(`USER   : ${user.email} (${user.id})`)
  console.log(`Generale: ${GENERALE_LIBRARY_ID}`)
  console.log("")

  // Cree une bib de test geree par USER
  const testLib = await db.library.upsert({
    where: { id: "lib_smoke_test" },
    update: { managerId: user.id },
    create: { id: "lib_smoke_test", name: "Smoke Test Lib", managerId: user.id }
  })

  await db.libraryMembership.upsert({
    where: { libraryId_userId: { libraryId: testLib.id, userId: user.id } },
    update: {},
    create: { libraryId: testLib.id, userId: user.id }
  })

  const adminVisible = await getVisibleLibraryIds(db, admin.id)
  const userVisible = await getVisibleLibraryIds(db, user.id)

  console.log(`ADMIN voit  : ${adminVisible.length} bibs (doit inclure les 2 :  ${GENERALE_LIBRARY_ID}, ${testLib.id})`)
  console.log(`USER voit   : ${userVisible.length} bibs (Generale + testLib attendus si user est membre des 2)`)

  const adminManages = await canManageLibrary(db, admin.id, testLib.id)
  const userManages  = await canManageLibrary(db, user.id, testLib.id)
  const otherUser    = await db.user.findFirst({ where: { id: { notIn: [admin.id, user.id] } } })
  const otherManages = otherUser ? await canManageLibrary(db, otherUser.id, testLib.id) : false
  console.log(`ADMIN gere testLib : ${adminManages} (true attendu)`)
  console.log(`USER  gere testLib : ${userManages} (true attendu — user est manager)`)
  console.log(`Autre user gere testLib : ${otherManages} (false attendu, ou ignore si pas de 3e user)`)

  const adminSees = await isLibraryVisible(db, admin.id, testLib.id)
  const userSees  = await isLibraryVisible(db, user.id, testLib.id)
  const otherSees = otherUser ? await isLibraryVisible(db, otherUser.id, testLib.id) : false
  console.log(`ADMIN voit testLib       : ${adminSees}  (true attendu)`)
  console.log(`USER  voit testLib       : ${userSees}  (true attendu — membre)`)
  console.log(`Autre user voit testLib  : ${otherSees} (false attendu)`)

  // Cleanup
  await db.libraryMembership.deleteMany({ where: { libraryId: testLib.id } })
  await db.library.delete({ where: { id: testLib.id } })

  console.log("\nSmoke test termine")
  await db.$disconnect()
}

main().catch(async e => {
  console.error(e)
  await db.$disconnect()
  process.exit(1)
})
