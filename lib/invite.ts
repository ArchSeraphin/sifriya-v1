import crypto from "node:crypto"
import { db } from "@/lib/db"
import { sendMagicLink } from "@/lib/email"
import { pickAvatarColor } from "@/lib/avatar"
import { GENERALE_LIBRARY_ID } from "@/lib/libraries"

const ONE_DAY_S = 24 * 60 * 60

type InviteOptions = {
  // V1.6 : bibliotheques restreintes auxquelles ajouter l'user en plus
  // de la Generale (toujours creee). Les ids sont valides en amont par
  // l'appelant (route /api/admin/invites).
  libraryIds?: string[]
}

type InviteResult = { url: string; created: boolean }

// Cree (ou retrouve) un user, ajoute ses memberships (Generale + bibs
// restreintes optionnelles), genere un VerificationToken compatible
// next-auth EmailProvider, et envoie le magic link. La creation user +
// memberships est transactionnelle. La logique de hash reproduit
// fidelement celle de next-auth v4 (sha256 de `${rawToken}${secret}`).
export async function inviteUser(
  email: string,
  options: InviteOptions = {}
): Promise<InviteResult> {
  const secret = process.env.NEXTAUTH_SECRET
  const baseUrl = process.env.NEXTAUTH_URL
  if (!secret) throw new Error("NEXTAUTH_SECRET manquant")
  if (!baseUrl) throw new Error("NEXTAUTH_URL manquant")

  const normalized = email.trim().toLowerCase()

  // Toujours inclure la Generale + dedup des ids fournis.
  const extraIds = (options.libraryIds ?? []).filter(
    (id) => id !== GENERALE_LIBRARY_ID
  )
  const targetLibraryIds = Array.from(
    new Set<string>([GENERALE_LIBRARY_ID, ...extraIds])
  )

  const { user, created } = await db.$transaction(async (tx) => {
    let existing = await tx.user.findUnique({ where: { email: normalized } })
    const wasCreated = !existing
    if (!existing) {
      existing = await tx.user.create({
        data: {
          email: normalized,
          role: "USER",
          avatarColor: pickAvatarColor(normalized)
        }
      })
    }

    for (const libraryId of targetLibraryIds) {
      await tx.libraryMembership.upsert({
        where: { libraryId_userId: { libraryId, userId: existing.id } },
        update: {},
        create: { libraryId, userId: existing.id }
      })
    }
    return { user: existing, created: wasCreated }
  })

  void user // user infos non utilisees plus bas mais conservees pour future extension

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
