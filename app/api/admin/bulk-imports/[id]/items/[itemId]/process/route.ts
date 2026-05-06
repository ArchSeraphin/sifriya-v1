import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAdmin } from "@/lib/auth"
import { readPending } from "@/lib/storage"
import {
  extractFromEpub,
  extractFromPdf,
  queryFromFilename,
  searchBooks,
  type ExtractedMetadata
} from "@/lib/metadata"
import { findMatchingBook, normalizeIsbn } from "@/lib/match"
import { scoreCandidates } from "@/lib/bulk-import-scoring"
import { logger } from "@/lib/logger"
import { METADATA_CALL_DELAY_MS } from "@/lib/bulk-import-limits"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function POST(_req: Request, ctx: { params: Promise<{ id: string; itemId: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const { id: sessionId, itemId } = await ctx.params
  const item = await db.bulkImportItem.findUnique({
    where: { id: itemId },
    select: {
      id: true,
      sessionId: true,
      uploadId: true,
      filename: true,
      format: true,
      committedBookId: true,
      session: { select: { ownerId: true, status: true } }
    }
  })
  if (!item || item.sessionId !== sessionId) {
    return NextResponse.json({ error: "Item introuvable." }, { status: 404 })
  }
  if (item.session.ownerId !== auth.userId) {
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 })
  }
  if (item.session.status !== "IN_PROGRESS") {
    return NextResponse.json({ error: "Session cloturee." }, { status: 409 })
  }
  if (item.committedBookId) {
    return NextResponse.json({ error: "Item deja commite, impossible de re-processer." }, { status: 409 })
  }
  if (!item.uploadId) {
    await db.bulkImportItem.update({
      where: { id: itemId },
      data: { status: "ERROR", errorMessage: "Pending file manquant." }
    })
    return NextResponse.json({ error: "Pending file manquant." }, { status: 422 })
  }

  // Garde atomique : flip PENDING/ERROR -> PROCESSING. Si un autre process a deja
  // commence, count === 0 et on retourne 409. Le polling client verra PROCESSING
  // des le retour de cette requete.
  const flipped = await db.bulkImportItem.updateMany({
    where: { id: itemId, status: { in: ["PENDING", "ERROR"] } },
    data: { status: "PROCESSING" }
  })
  if (flipped.count === 0) {
    return NextResponse.json({ error: "Item deja en cours de traitement." }, { status: 409 })
  }

  try {
    const ext = item.format.toLowerCase()
    const buffer = await readPending(item.uploadId, ext)
    const extracted: ExtractedMetadata =
      item.format === "EPUB"
        ? await extractFromEpub(buffer)
        : await extractFromPdf(buffer)

    // Construire la requete : ISBN si dispo, sinon titre+auteur extraits, sinon nom de fichier
    const isbnQuery = normalizeIsbn(extracted.isbn)
    let query: string
    if (isbnQuery) {
      query = isbnQuery
    } else {
      const queryParts = [extracted.title, extracted.author].filter((p): p is string => Boolean(p))
      query = queryParts.length > 0 ? queryParts.join(" ") : queryFromFilename(item.filename)
    }

    await sleep(METADATA_CALL_DELAY_MS)
    const search = await searchBooks(query)
    const candidates = search.results.slice(0, 5)

    const existingMatch = await findMatchingBook(db, {
      title: extracted.title ?? "",
      author: extracted.author,
      isbn: extracted.isbn
    })

    const scoring = scoreCandidates({ extracted, candidates, existingMatch })

    // Decision pre-remplie pour les cas evidents
    let decision: "NONE" | "CREATE" | "MERGE" = "NONE"
    if (scoring.status === "AUTO_OK") decision = "CREATE"
    if (scoring.status === "DUPLICATE" && existingMatch?.confidence === "high") decision = "MERGE"

    await db.bulkImportItem.update({
      where: { id: itemId },
      data: {
        status: scoring.status,
        extractedTitle: extracted.title,
        extractedAuthor: extracted.author,
        extractedIsbn: extracted.isbn,
        candidatesJson: candidates as unknown as object,
        chosenCandidate: scoring.chosenCandidate as unknown as object,
        mergeIntoBookId: scoring.mergeIntoBookId,
        decision
      }
    })

    return NextResponse.json({ status: scoring.status })
  } catch (err) {
    logger.error("bulk import process item failed", { itemId, err: String(err) })
    await db.bulkImportItem.update({
      where: { id: itemId },
      data: { status: "ERROR", errorMessage: String(err) }
    })
    return NextResponse.json({ error: "Echec du traitement." }, { status: 500 })
  }
}
