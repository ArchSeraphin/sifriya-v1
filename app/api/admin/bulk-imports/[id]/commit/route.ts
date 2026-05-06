import { NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { requireAdmin } from "@/lib/auth"
import { deletePending } from "@/lib/storage"
import {
  createBookWithCopy,
  addCopyToBook,
  type BookMetadataInput
} from "@/lib/books-mutations"
import { groupBySignature, type CommitItemInput } from "@/lib/bulk-import-commit"
import { logger } from "@/lib/logger"
import type { BulkImportItem } from "@prisma/client"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const Body = z.object({
  itemIds: z.array(z.string()).optional()
})

type CommitError = { itemId: string; error: string }

// Forme du JSON stocke par PATCH /items/[itemId] (cf. ChosenCandidate zod schema).
// Note : le champ `source` du candidat correspond a `sourceApi` cote Book.
type ChosenCandidateJson = {
  source?: "google_books" | "open_library" | "bnf" | "manual"
  externalId?: string
  title: string
  author: string | null
  isbn: string | null
  year?: number | null
  publisher?: string | null
  language?: string | null
  coverUrl?: string | null
  description?: string | null
  genre?: string | null
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const { id: sessionId } = await ctx.params

  // Body optionnel : un POST sans body (ou avec body invalide) commit toute la session.
  let raw: unknown = {}
  try {
    raw = await req.json()
  } catch {
    /* body absent ou invalide -> on commit tous les items eligibles */
  }
  const parsed = Body.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: "Donnees invalides." }, { status: 400 })
  }

  // Lecture initiale : ownership + statut.
  const session = await db.bulkImportSession.findUnique({
    where: { id: sessionId },
    select: { id: true, ownerId: true, status: true }
  })
  if (!session) return NextResponse.json({ error: "Session introuvable." }, { status: 404 })
  if (session.ownerId !== auth.userId) {
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 })
  }
  if (session.status !== "IN_PROGRESS") {
    return NextResponse.json({ error: "Session deja cloturee." }, { status: 409 })
  }

  const items = await db.bulkImportItem.findMany({
    where: {
      sessionId,
      ...(parsed.data.itemIds ? { id: { in: parsed.data.itemIds } } : {}),
      decision: { in: ["CREATE", "MERGE", "SKIP"] },
      committedBookId: null,
      committedCopyId: null
    }
  })

  let created = 0
  let merged = 0
  let skipped = 0
  const errors: CommitError[] = []

  // 1) SKIP : on supprime le pending file et on efface uploadId pour eviter
  // une re-purge depuis DELETE /sessions/[id].
  for (const item of items.filter((i) => i.decision === "SKIP")) {
    try {
      if (item.uploadId) await deletePending(item.uploadId, item.format.toLowerCase())
      await db.bulkImportItem.update({
        where: { id: item.id },
        data: { uploadId: null }
      })
      skipped++
    } catch (err) {
      logger.error("bulk skip failed", { itemId: item.id, err: String(err) })
      errors.push({ itemId: item.id, error: String(err) })
    }
  }

  // 2) MERGE : ajout d'une copy a un Book existant.
  for (const item of items.filter((i) => i.decision === "MERGE")) {
    if (!item.mergeIntoBookId || !item.uploadId) {
      errors.push({ itemId: item.id, error: "Donnees incompletes pour merge." })
      continue
    }
    try {
      const { copyId } = await addCopyToBook(
        item.mergeIntoBookId,
        {
          type: "DIGITAL",
          uploadId: item.uploadId,
          format: item.format,
          fileSize: item.fileSize
        },
        auth.userId
      )
      await db.bulkImportItem.update({
        where: { id: item.id },
        data: { committedBookId: item.mergeIntoBookId, committedCopyId: copyId }
      })
      merged++
    } catch (err) {
      logger.error("bulk merge failed", { itemId: item.id, err: String(err) })
      errors.push({ itemId: item.id, error: String(err) })
    }
  }

  // 3) CREATE : groupage par signature commune (doublons internes au lot).
  // Le premier item du groupe cree le Book ; les suivants ajoutent une copy
  // a ce meme Book (ex : EPUB + PDF du meme titre dans un meme upload).
  const createItems = items.filter((i) => i.decision === "CREATE")
  const grouped = groupBySignature(createItems.map(toCommitInput))

  for (const [, group] of grouped) {
    if (group.length === 0) continue
    const head = createItems.find((i) => i.id === group[0]!.id)!
    const meta = metadataFromItem(head)
    if (!meta || !head.uploadId) {
      errors.push({ itemId: head.id, error: "Metadata ou upload manquant." })
      continue
    }
    try {
      const { bookId, copyId } = await createBookWithCopy(
        meta,
        {
          type: "DIGITAL",
          uploadId: head.uploadId,
          format: head.format,
          fileSize: head.fileSize
        },
        auth.userId
      )
      await db.bulkImportItem.update({
        where: { id: head.id },
        data: { committedBookId: bookId, committedCopyId: copyId }
      })
      created++

      // Items suivants du groupe -> addCopy au Book qui vient d'etre cree.
      for (const sib of group.slice(1)) {
        const sibItem = createItems.find((i) => i.id === sib.id)!
        if (!sibItem.uploadId) {
          errors.push({ itemId: sib.id, error: "Upload manquant." })
          continue
        }
        try {
          const { copyId: siblingCopyId } = await addCopyToBook(
            bookId,
            {
              type: "DIGITAL",
              uploadId: sibItem.uploadId,
              format: sibItem.format,
              fileSize: sibItem.fileSize
            },
            auth.userId
          )
          await db.bulkImportItem.update({
            where: { id: sibItem.id },
            data: { committedBookId: bookId, committedCopyId: siblingCopyId }
          })
          merged++
        } catch (err) {
          logger.error("bulk grouped copy failed", { itemId: sibItem.id, err: String(err) })
          errors.push({ itemId: sibItem.id, error: String(err) })
        }
      }
    } catch (err) {
      logger.error("bulk create failed", { itemId: head.id, err: String(err) })
      errors.push({ itemId: head.id, error: String(err) })
    }
  }

  // Cloturer la session si tous les items ont une decision finale.
  // (Un commit partiel — itemIds passes — laisse la session ouverte.)
  const remaining = await db.bulkImportItem.count({
    where: { sessionId, decision: "NONE" }
  })
  if (remaining === 0) {
    await db.bulkImportSession.update({
      where: { id: sessionId },
      data: { status: "COMMITTED", committedAt: new Date() }
    })
  }

  return NextResponse.json({ created, merged, skipped, errors })
}

function toCommitInput(item: BulkImportItem): CommitItemInput {
  const chosen = (item.chosenCandidate ?? null) as ChosenCandidateJson | null
  return {
    id: item.id,
    extractedIsbn: item.extractedIsbn,
    chosenCandidate: chosen
      ? {
          isbn: chosen.isbn ?? null,
          externalId: chosen.externalId,
          title: chosen.title,
          author: chosen.author ?? null
        }
      : null
  }
}

function metadataFromItem(item: BulkImportItem): BookMetadataInput | null {
  const chosen = (item.chosenCandidate ?? null) as ChosenCandidateJson | null
  if (!chosen && !item.extractedTitle) return null

  // Le candidat stocke `source` ; le Book attend `sourceApi`.
  const sourceApi = (chosen?.source ?? "manual") as BookMetadataInput["sourceApi"]

  return {
    title: chosen?.title ?? item.extractedTitle ?? "Sans titre",
    author: chosen?.author ?? item.extractedAuthor ?? null,
    isbn: chosen?.isbn ?? item.extractedIsbn ?? null,
    description: chosen?.description ?? null,
    genre: chosen?.genre ?? null,
    year: chosen?.year ?? null,
    publisher: chosen?.publisher ?? null,
    language: chosen?.language ?? "fr",
    coverUrl: chosen?.coverUrl ?? null,
    sourceApi,
    externalId: chosen?.externalId ?? null
  }
}
