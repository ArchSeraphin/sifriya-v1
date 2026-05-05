// Cree un magic link valide pour le compte indique (defaut : ADMIN_EMAIL).
// Usage : npx tsx scripts/dev-magic-link.ts [email]
import "dotenv/config"
import path from "node:path"
import fs from "node:fs"
import crypto from "node:crypto"
import { config as loadDotenv } from "dotenv"
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

for (const f of [".env.local", ".env"]) {
  const p = path.resolve(process.cwd(), f)
  if (fs.existsSync(p)) loadDotenv({ path: p, override: false })
}

const dbUrl = process.env.DATABASE_URL
const secret = process.env.NEXTAUTH_SECRET
const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000"
if (!dbUrl) throw new Error("DATABASE_URL manquant")
if (!secret) throw new Error("NEXTAUTH_SECRET manquant")

const email = (process.argv[2] ?? process.env.ADMIN_EMAIL ?? "admin@sifriya.fr").toLowerCase()

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: dbUrl }) })

async function main() {
  let user = await prisma.user.findUnique({ where: { email } })
  if (!user) {
    user = await prisma.user.create({
      data: { email, role: email === process.env.ADMIN_EMAIL?.toLowerCase() ? "ADMIN" : "USER" }
    })
  }

  const raw = crypto.randomBytes(32).toString("hex")
  const hashed = crypto.createHash("sha256").update(`${raw}${secret}`).digest("hex")
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000)

  await prisma.verificationToken.create({
    data: { identifier: email, token: hashed, expires }
  })

  const params = new URLSearchParams({
    callbackUrl: "/bibliotheque",
    token: raw,
    email
  })
  const url = `${baseUrl.replace(/\/$/, "")}/api/auth/callback/email?${params.toString()}`
  console.log(url)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
