import path from "node:path"
import fs from "node:fs"
import { defineConfig } from "prisma/config"
import { config as loadDotenv } from "dotenv"

// Charge .env.local en priorite (convention Next.js), puis .env en fallback.
// En production (Coolify) et en CI, les variables sont injectees directement et ces fichiers n'existent pas.
for (const file of [".env.local", ".env"]) {
  const p = path.resolve(process.cwd(), file)
  if (fs.existsSync(p)) loadDotenv({ path: p })
}

// `prisma generate` n'a pas besoin de la vraie URL ; on tolere donc une URL
// placeholder pour que `npm install` (postinstall) marche en CI/Docker sans
// DATABASE_URL. Les commandes qui ouvrent une connexion (migrate, db push,
// studio) echoueront proprement avec une erreur de connexion.
const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://placeholder:placeholder@localhost:5432/placeholder"

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: databaseUrl
  },
  migrations: {
    seed: "tsx prisma/seed.ts"
  }
})
