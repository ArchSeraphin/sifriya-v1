import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAdmin } from "@/lib/auth"
import { savePending } from "@/lib/storage"
import { validateUpload } from "@/lib/file-validation"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const { id: sessionId } = await ctx.params
  const session = await db.bulkImportSession.findUnique({
    where: { id: sessionId },
    select: { id: true, ownerId: true, status: true, totalFiles: true }
  })
  if (!session) return NextResponse.json({ error: "Session introuvable." }, { status: 404 })
  if (session.ownerId !== auth.userId) return NextResponse.json({ error: "Acces refuse." }, { status: 403 })
  if (session.status !== "IN_PROGRESS") {
    return NextResponse.json({ error: "Session cloturee." }, { status: 409 })
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: "Requete invalide." }, { status: 400 })
  }

  const file = form.get("file")
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Aucun fichier envoye." }, { status: 400 })
  }

  // Garde-fou : refuser si on depasse totalFiles declare a la creation de session.
  const itemCount = await db.bulkImportItem.count({ where: { sessionId } })
  if (itemCount >= session.totalFiles) {
    return NextResponse.json({ error: "Limite de fichiers de la session atteinte." }, { status: 409 })
  }

  const validation = await validateUpload(file)
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: validation.status })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const { id: uploadId } = await savePending(buffer, validation.ext)

  const item = await db.bulkImportItem.create({
    data: {
      sessionId,
      filename: file.name,
      format: validation.format,
      fileSize: validation.size,
      uploadId,
      status: "PENDING"
    },
    select: { id: true }
  })

  return NextResponse.json({ itemId: item.id, status: "PENDING" }, { status: 201 })
}
