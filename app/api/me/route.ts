import { NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

// Champs editables par l'utilisateur sur son propre compte.
// Le role n'est PAS modifiable ici (geree par les admins via /api/admin/users/[id]).
// L'email n'est pas modifiable (cle d'identite, lie aux magic links).
const PatchBody = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Le nom ne peut pas etre vide.")
      .max(120, "120 caracteres maximum.")
      .nullable()
  })
  .strict()

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Non authentifie." }, { status: 401 })
  }

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 })
  }
  const parsed = PatchBody.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Donnees invalides.", issues: parsed.error.flatten() },
      { status: 400 }
    )
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "Aucun champ a modifier." }, { status: 400 })
  }

  const updated = await db.user.update({
    where: { id: session.user.id },
    data: parsed.data,
    select: { id: true, name: true, email: true, avatarColor: true, role: true }
  })
  return NextResponse.json({ user: updated })
}
