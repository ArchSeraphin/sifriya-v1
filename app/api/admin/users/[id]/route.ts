import { NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

const PatchBody = z.object({
  role: z.enum(["ADMIN", "USER"]).optional(),
  name: z.string().trim().min(1).max(120).optional()
})

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 })
  }

  const { id } = await ctx.params

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 })
  }
  const parsed = PatchBody.safeParse(raw)
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "Donnees invalides." }, { status: 400 })
  }

  // Empeche un admin de retrograder son propre compte (eviter de se locker out).
  if (parsed.data.role && id === session.user.id && parsed.data.role !== "ADMIN") {
    return NextResponse.json(
      { error: "Vous ne pouvez pas changer votre propre role." },
      { status: 400 }
    )
  }

  try {
    const user = await db.user.update({
      where: { id },
      data: parsed.data,
      select: { id: true, role: true, name: true }
    })
    return NextResponse.json({ ok: true, user })
  } catch {
    return NextResponse.json({ error: "Membre introuvable." }, { status: 404 })
  }
}
