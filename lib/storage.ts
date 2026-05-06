// =====================================================================
// Sifriya — abstraction storage
// Implementation V1 : systeme de fichiers local (volume Docker monte sur
// UPLOAD_DIR). Pour passer a S3/MinIO/R2, ne reecrire que ce fichier.
// Ne JAMAIS exposer le chemin physique d'un fichier dans une URL publique.
// =====================================================================

import { promises as fs, createReadStream } from "node:fs"
import path from "node:path"
import crypto from "node:crypto"

const ALLOWED_EXT = new Set(["epub", "pdf"])

export type SaveOptions = { dir?: "books" | "covers" | "copies" | "_pending" }

function root(): string {
  return process.env.UPLOAD_DIR ?? "./uploads"
}

function ensureSafeKey(key: string): string {
  // Anti path-traversal : on ne tolere pas de "..", de "/" en debut, etc.
  const normalized = path.posix.normalize(key)
  if (normalized.startsWith("..") || normalized.includes("..") || normalized.startsWith("/")) {
    throw new Error(`Cle de fichier invalide : ${key}`)
  }
  return normalized
}

export function safeFilename(original: string): string {
  return path.basename(original).replace(/[^a-zA-Z0-9.\-_]/g, "_")
}

export function fileExt(filename: string): string {
  const m = /\.([a-zA-Z0-9]+)$/.exec(filename)
  return m ? m[1]!.toLowerCase() : ""
}

export function isAllowedExt(ext: string): boolean {
  return ALLOWED_EXT.has(ext.toLowerCase())
}

async function ensureDir(p: string): Promise<void> {
  await fs.mkdir(p, { recursive: true })
}

// Sauvegarde un buffer dans `${UPLOAD_DIR}/${dir}/${filename}` et renvoie la
// cle relative a stocker en DB (sans UPLOAD_DIR).
export async function saveBuffer(
  buffer: Buffer,
  filename: string,
  options: SaveOptions = {}
): Promise<string> {
  const dir = options.dir ?? "books"
  const baseDir = path.join(root(), dir)
  await ensureDir(baseDir)
  const safe = safeFilename(filename)
  const target = path.join(baseDir, safe)
  await fs.writeFile(target, buffer)
  return ensureSafeKey(`${dir}/${safe}`)
}

// Sauvegarde temporaire (modal upload step 1). On genere un id pour le
// retrouver depuis le client.
export async function savePending(buffer: Buffer, ext: string): Promise<{ id: string; key: string }> {
  if (!isAllowedExt(ext)) throw new Error(`Extension non supportee : ${ext}`)
  const id = crypto.randomBytes(16).toString("hex")
  const key = await saveBuffer(buffer, `${id}.${ext.toLowerCase()}`, { dir: "_pending" })
  return { id, key }
}

// Renomme un fichier pending vers son emplacement definitif.
// Defense-in-depth : finalKey doit commencer par "copies/" pour qu'un appelant
// (ou un bug) ne puisse pas ecraser une couverture ou un fichier hors-zone.
export async function commitPending(opts: {
  pendingId: string
  ext: string
  finalKey: string
}): Promise<string> {
  if (!isAllowedExt(opts.ext)) throw new Error(`Extension non supportee : ${opts.ext}`)
  if (!opts.finalKey.startsWith("copies/")) {
    throw new Error(`finalKey doit etre dans copies/ : ${opts.finalKey}`)
  }
  const safeFinal = ensureSafeKey(opts.finalKey)
  const safePending = ensureSafeKey(`_pending/${opts.pendingId}.${opts.ext.toLowerCase()}`)
  const src = path.join(root(), safePending)
  const dst = path.join(root(), safeFinal)
  await ensureDir(path.dirname(dst))
  await fs.rename(src, dst)
  return safeFinal
}

// Supprime un fichier pending par son id (utilise par bulk import abandonne).
export async function deletePending(id: string, ext: string): Promise<void> {
  if (!isAllowedExt(ext)) throw new Error(`Extension non supportee : ${ext}`)
  await deleteByKey(`_pending/${id}.${ext.toLowerCase()}`)
}

// Lit un fichier pending par son id (utilise par bulk import process item).
export async function readPending(id: string, ext: string): Promise<Buffer> {
  if (!isAllowedExt(ext)) throw new Error(`Extension non supportee : ${ext}`)
  return readBuffer(`_pending/${id}.${ext.toLowerCase()}`)
}

export async function deleteByKey(key: string | null | undefined): Promise<void> {
  if (!key) return
  const safe = ensureSafeKey(key)
  const target = path.join(root(), safe)
  try {
    await fs.unlink(target)
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code !== "ENOENT") throw err
  }
}

export async function readBuffer(key: string): Promise<Buffer> {
  const safe = ensureSafeKey(key)
  const target = path.join(root(), safe)
  return fs.readFile(target)
}

export async function statByKey(key: string): Promise<{ size: number } | null> {
  try {
    const safe = ensureSafeKey(key)
    const target = path.join(root(), safe)
    const s = await fs.stat(target)
    return { size: s.size }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null
    throw err
  }
}

// Stream Web (pour Response body Next.js).
export function readWebStream(key: string): ReadableStream<Uint8Array> {
  const safe = ensureSafeKey(key)
  const target = path.join(root(), safe)
  const node = createReadStream(target)
  return new ReadableStream({
    start(controller) {
      node.on("data", (chunk: string | Buffer) => {
        if (typeof chunk === "string") controller.enqueue(new TextEncoder().encode(chunk))
        else controller.enqueue(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength))
      })
      node.on("end", () => controller.close())
      node.on("error", (err) => controller.error(err))
    },
    cancel() {
      node.destroy()
    }
  })
}
