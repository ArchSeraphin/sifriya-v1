import crypto from "node:crypto"
import { db } from "@/lib/db"
import { sendMagicLink } from "@/lib/email"
import { pickAvatarColor } from "@/lib/avatar"

const ONE_DAY_S = 24 * 60 * 60

type InviteResult = { url: string; created: boolean }

// Cree (ou retrouve) un user, genere un VerificationToken compatible next-auth
// EmailProvider, et envoie le magic link. La logique de hash reproduit fidelement
// celle de next-auth v4 (sha256 de `${rawToken}${secret}`).
export async function inviteUser(email: string): Promise<InviteResult> {
  const secret = process.env.NEXTAUTH_SECRET
  const baseUrl = process.env.NEXTAUTH_URL
  if (!secret) throw new Error("NEXTAUTH_SECRET manquant")
  if (!baseUrl) throw new Error("NEXTAUTH_URL manquant")

  const normalized = email.trim().toLowerCase()

  let user = await db.user.findUnique({ where: { email: normalized } })
  const created = !user
  if (!user) {
    user = await db.user.create({
      data: {
        email: normalized,
        role: "USER",
        avatarColor: pickAvatarColor(normalized)
      }
    })
  }

  const rawToken = crypto.randomBytes(32).toString("hex")
  const hashedToken = crypto.createHash("sha256").update(`${rawToken}${secret}`).digest("hex")
  const expires = new Date(Date.now() + ONE_DAY_S * 1000)

  await db.verificationToken.create({
    data: { identifier: normalized, token: hashedToken, expires }
  })

  const params = new URLSearchParams({
    callbackUrl: "/bibliotheque",
    token: rawToken,
    email: normalized
  })
  const url = `${baseUrl.replace(/\/$/, "")}/api/auth/callback/email?${params.toString()}`

  await sendMagicLink(normalized, url)
  return { url, created }
}
