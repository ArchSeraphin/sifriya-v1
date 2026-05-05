import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

const PALETTE = ["#6b6354", "#8a6b1f", "#4a6b3e", "#a86a1f", "#8a3030", "#5a4711", "#3a342a"]

function hashPick(s: string, arr: readonly string[]): string {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return arr[Math.abs(h) % arr.length]!
}

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL
  if (!adminEmail) {
    throw new Error("ADMIN_EMAIL est requis dans l'environnement pour le seed.")
  }

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { role: "ADMIN" },
    create: {
      email: adminEmail,
      name: "Admin",
      role: "ADMIN",
      avatarColor: hashPick(adminEmail, PALETTE)
    }
  })

  console.log(`Admin pret : ${admin.email} (${admin.id})`)
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
