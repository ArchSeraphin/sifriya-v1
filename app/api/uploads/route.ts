import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { savePending } from "@/lib/storage"
import { validateUpload, MAX_FILE_BYTES } from "@/lib/file-validation"
import { queryFromFilename } from "@/lib/metadata"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Non authentifie." }, { status: 401 })
  }

  // Parse FormData (Next.js gere automatiquement le streaming).
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

  const validation = await validateUpload(file)
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: validation.status })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const { id } = await savePending(buffer, validation.ext)

  return NextResponse.json({
    uploadId: id,
    filename: file.name,
    format: validation.format,
    size: validation.size,
    suggestedQuery: queryFromFilename(file.name)
  })
}

export async function GET() {
  return NextResponse.json(
    { maxBytes: MAX_FILE_BYTES, allowed: ["EPUB", "PDF"] },
    { headers: { "cache-control": "public, max-age=3600" } }
  )
}
