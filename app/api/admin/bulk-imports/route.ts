import { NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { requireAdmin } from "@/lib/auth"
import { MAX_FILES_ADMIN } from "@/lib/bulk-import-limits"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const Body = z.object({
  totalFiles: z.number().int().min(1).max(MAX_FILES_ADMIN)
})

export async function POST(req: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 })
  }

  const parsed = Body.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: `Maximum ${MAX_FILES_ADMIN} fichiers par session.`, issues: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const session = await db.bulkImportSession.create({
    data: {
      ownerId: auth.userId,
      totalFiles: parsed.data.totalFiles
    },
    select: { id: true }
  })

  return NextResponse.json({ sessionId: session.id }, { status: 201 })
}
