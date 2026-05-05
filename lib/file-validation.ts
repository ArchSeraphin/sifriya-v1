import { fileExt, isAllowedExt } from "@/lib/storage"

export const MAX_FILE_BYTES = 50 * 1024 * 1024 // 50 Mo

const PDF_MAGIC = Buffer.from("%PDF-", "ascii")
const ZIP_LFH = Buffer.from([0x50, 0x4b, 0x03, 0x04])
const ZIP_EMPTY = Buffer.from([0x50, 0x4b, 0x05, 0x06])
const ZIP_SPANNED = Buffer.from([0x50, 0x4b, 0x07, 0x08])

export type DetectedFormat = "EPUB" | "PDF"

export function detectFormatFromBuffer(buf: Buffer): DetectedFormat | null {
  if (buf.length >= 5 && buf.subarray(0, 5).equals(PDF_MAGIC)) return "PDF"
  if (buf.length >= 4) {
    const head = buf.subarray(0, 4)
    if (head.equals(ZIP_LFH) || head.equals(ZIP_EMPTY) || head.equals(ZIP_SPANNED)) return "EPUB"
  }
  return null
}

export type ValidationOk = { ok: true; format: DetectedFormat; ext: "epub" | "pdf"; size: number }
export type ValidationErr = { ok: false; status: number; error: string }
export type ValidationResult = ValidationOk | ValidationErr

export async function validateUpload(file: File): Promise<ValidationResult> {
  if (file.size === 0) {
    return { ok: false, status: 400, error: "Fichier vide." }
  }
  if (file.size > MAX_FILE_BYTES) {
    return { ok: false, status: 413, error: "Fichier trop volumineux (max 50 Mo)." }
  }
  const ext = fileExt(file.name)
  if (!isAllowedExt(ext)) {
    return { ok: false, status: 415, error: "Format non supporte. EPUB ou PDF uniquement." }
  }
  // Magic bytes : on lit seulement les 16 premiers octets.
  const head = Buffer.from(await file.slice(0, 16).arrayBuffer())
  const detected = detectFormatFromBuffer(head)
  if (!detected) {
    return { ok: false, status: 415, error: "Le fichier ne semble pas etre un EPUB ou un PDF." }
  }
  if ((detected === "EPUB" && ext !== "epub") || (detected === "PDF" && ext !== "pdf")) {
    return { ok: false, status: 415, error: "L'extension ne correspond pas au contenu du fichier." }
  }
  return {
    ok: true,
    format: detected,
    ext: ext === "epub" || ext === "pdf" ? ext : (ext as "epub" | "pdf"),
    size: file.size
  }
}
