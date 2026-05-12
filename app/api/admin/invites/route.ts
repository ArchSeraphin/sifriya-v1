import { NextResponse } from "next/server"
import { z } from "zod"
import { requireAdmin } from "@/lib/auth"
import { db } from "@/lib/db"
import { inviteUser } from "@/lib/invite"
import { GENERALE_LIBRARY_ID } from "@/lib/libraries"
import { logger } from "@/lib/logger"

export const dynamic = "force-dynamic"

const Body = z
  .object({
    email: z.string().trim().toLowerCase().email(),
    // V1.6 : bibliotheques restreintes a ajouter en plus de la Generale.
    libraryIds: z.array(z.string().min(1)).optional()
  })
  .strict()

export async function POST(req: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 })
  }

  const parsed = Body.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Donnees invalides." }, { status: 400 })
  }

  // Filtre la Generale (toujours ajoutee) puis valide que les autres bibs existent.
  const extraIds = Array.from(
    new Set(
      (parsed.data.libraryIds ?? []).filter((id) => id !== GENERALE_LIBRARY_ID)
    )
  )
  if (extraIds.length > 0) {
    const found = await db.library.findMany({
      where: { id: { in: extraIds } },
      select: { id: true }
    })
    if (found.length !== extraIds.length) {
      return NextResponse.json(
        { error: "Bibliotheque introuvable." },
        { status: 400 }
      )
    }
  }

  try {
    const { created } = await inviteUser(parsed.data.email, { libraryIds: extraIds })
    return NextResponse.json({ ok: true, created })
  } catch (err) {
    logger.error("invite failed", { err: String(err) })
    return NextResponse.json(
      { error: "Impossible d'envoyer l'invitation." },
      { status: 500 }
    )
  }
}
