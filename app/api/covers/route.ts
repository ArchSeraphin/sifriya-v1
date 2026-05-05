import { NextResponse } from "next/server"
import crypto from "node:crypto"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { saveBuffer } from "@/lib/storage"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const MAX_BYTES = 5 * 1024 * 1024 // 5 Mo
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"])

const JPG = Buffer.from([0xff, 0xd8, 0xff])
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47])
const WEBP_HEAD = Buffer.from("RIFF", "ascii")

function detectImageExt(head: Buffer, mime: string): string | null {
  if (head.length >= 3 && head.subarray(0, 3).equals(JPG)) return "jpg"
  if (head.length >= 4 && head.subarray(0, 4).equals(PNG)) return "png"
  if (head.length >= 4 && head.subarray(0, 4).equals(WEBP_HEAD) && mime === "image/webp") return "webp"
  return null
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Non authentifie." }, { status: 401 })

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
  if (file.size === 0) return NextResponse.json({ error: "Fichier vide." }, { status: 400 })
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Image trop volumineuse (max 5 Mo)." }, { status: 413 })
  }
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json(
      { error: "Format non supporte. JPG, PNG ou WEBP uniquement." },
      { status: 415 }
    )
  }
  const head = Buffer.from(await file.slice(0, 16).arrayBuffer())
  const ext = detectImageExt(head, file.type)
  if (!ext) {
    return NextResponse.json(
      { error: "Le fichier ne semble pas etre une image valide." },
      { status: 415 }
    )
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const id = crypto.randomBytes(12).toString("hex")
  const key = await saveBuffer(buffer, `${id}.${ext}`, { dir: "covers" })

  // L'URL servie sera /api/covers/{key}
  return NextResponse.json({ key, coverUrl: `/api/covers/${key}` })
}
