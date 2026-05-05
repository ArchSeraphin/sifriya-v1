import { NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { inviteUser } from "@/lib/invite"
import { logger } from "@/lib/logger"

export const dynamic = "force-dynamic"

const Body = z.object({
  email: z.string().trim().toLowerCase().email()
})

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 })
  }

  const parsed = Body.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Email invalide." }, { status: 400 })
  }

  try {
    const { created } = await inviteUser(parsed.data.email)
    return NextResponse.json({ ok: true, created })
  } catch (err) {
    logger.error("invite failed", { err: String(err) })
    return NextResponse.json(
      { error: "Impossible d'envoyer l'invitation." },
      { status: 500 }
    )
  }
}
