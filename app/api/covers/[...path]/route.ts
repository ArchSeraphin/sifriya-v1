import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { readWebStream, statByKey } from "@/lib/storage"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp"
}

// Sert les couvertures stockees localement (covers/{id}.{ext}). On verifie la
// session pour ne pas exposer publiquement les couvertures uploadees par les
// membres (cercle ferme).
export async function GET(_req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return new Response("Non authentifie.", { status: 401 })
  }

  const { path: parts } = await ctx.params
  // On reconstruit la cle relative et on s'assure qu'elle reste sous "covers/".
  const safe = ["covers", ...parts].join("/")
  const stat = await statByKey(safe)
  if (!stat) return new Response("Introuvable.", { status: 404 })

  const ext = safe.split(".").pop()?.toLowerCase() ?? ""
  return new Response(readWebStream(safe), {
    status: 200,
    headers: {
      "content-type": MIME[ext] ?? "application/octet-stream",
      "content-length": String(stat.size),
      "cache-control": "private, max-age=86400"
    }
  })
}
