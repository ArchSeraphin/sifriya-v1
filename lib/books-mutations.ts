import "server-only"

import type { FileFormat, Prisma } from "@prisma/client"
import { db } from "@/lib/db"
import { commitPending } from "@/lib/storage"
import { computeMatchKey, normalizeIsbn } from "@/lib/match"

// =====================================================================
// Helpers de creation Book / BookCopy — partages entre :
//   - POST /api/books             (creation Book + 1ere copie)
//   - POST /api/books/[id]/copies (ajout d'une copie sur Book existant)
//   - POST /api/books/match       (V1.4+ bulk upload — ajout/merge auto)
//
// Server-only : importe Prisma + node:fs via @/lib/storage. Ne JAMAIS
// importer ce fichier depuis un Client Component.
// =====================================================================

export type BookMetadataInput = {
  title: string
  author: string | null
  isbn: string | null
  description: string | null
  genre: string | null
  year: number | null
  publisher: string | null
  language: string | null
  coverUrl: string | null
  sourceApi: "google_books" | "open_library" | "bnf" | "manual" | null
  externalId: string | null
}

export type DigitalCopyInput = {
  type: "DIGITAL"
  uploadId: string
  format: FileFormat
  fileSize: number
}

export type PhysicalCopyInput = {
  type: "PHYSICAL"
}

export type CopyInput = DigitalCopyInput | PhysicalCopyInput

// Cree un Book + sa premiere BookCopy. Pour DIGITAL, deplace le pending
// file vers son emplacement final apres la creation du copy.id.
export async function createBookWithCopy(
  metadata: BookMetadataInput,
  copy: CopyInput,
  userId: string
): Promise<{ bookId: string; copyId: string }> {
  const isbn = normalizeIsbn(metadata.isbn)
  const matchKey = computeMatchKey(metadata.title, metadata.author)

  const created = await db.$transaction(async (tx) => {
    const book = await tx.book.create({
      data: {
        title: metadata.title,
        author: metadata.author,
        isbn,
        description: metadata.description,
        genre: metadata.genre,
        year: metadata.year,
        publisher: metadata.publisher,
        language: metadata.language ?? "fr",
        coverUrl: metadata.coverUrl,
        sourceApi: metadata.sourceApi,
        externalId: metadata.externalId,
        matchKey
      },
      select: { id: true }
    })

    const copyData: Prisma.BookCopyUncheckedCreateInput =
      copy.type === "DIGITAL"
        ? {
            bookId: book.id,
            type: "DIGITAL",
            format: copy.format,
            fileSize: copy.fileSize,
            filePath: "pending",
            addedById: userId
          }
        : {
            bookId: book.id,
            type: "PHYSICAL",
            ownerId: userId,
            addedById: userId
          }

    const copyRow = await tx.bookCopy.create({
      data: copyData,
      select: { id: true }
    })
    return { bookId: book.id, copyId: copyRow.id }
  })

  if (copy.type === "DIGITAL") {
    const ext = copy.format.toLowerCase() as "epub" | "pdf"
    try {
      const finalKey = await commitPending({
        pendingId: copy.uploadId,
        ext,
        finalKey: `copies/${created.copyId}.${ext}`
      })
      await db.bookCopy.update({
        where: { id: created.copyId },
        data: { filePath: finalKey }
      })
    } catch (err) {
      // Rollback : commitPending a echoue. On supprime le Book — la cascade
      // supprime aussi la BookCopy orpheline (BookCopy.book = onDelete: Cascade,
      // verifie dans prisma/schema.prisma).
      await db.book.delete({ where: { id: created.bookId } }).catch(() => {})
      throw err
    }
  }

  return created
}

// Ajoute une BookCopy a un Book existant (pour merger un nouveau format).
// Le Book n'est pas modifie.
export async function addCopyToBook(
  bookId: string,
  copy: CopyInput,
  userId: string
): Promise<{ copyId: string }> {
  const copyData: Prisma.BookCopyUncheckedCreateInput =
    copy.type === "DIGITAL"
      ? {
          bookId,
          type: "DIGITAL",
          format: copy.format,
          fileSize: copy.fileSize,
          filePath: "pending",
          addedById: userId
        }
      : {
          bookId,
          type: "PHYSICAL",
          ownerId: userId,
          addedById: userId
        }

  const copyRow = await db.bookCopy.create({
    data: copyData,
    select: { id: true }
  })

  if (copy.type === "DIGITAL") {
    const ext = copy.format.toLowerCase() as "epub" | "pdf"
    try {
      const finalKey = await commitPending({
        pendingId: copy.uploadId,
        ext,
        finalKey: `copies/${copyRow.id}.${ext}`
      })
      await db.bookCopy.update({
        where: { id: copyRow.id },
        data: { filePath: finalKey }
      })
    } catch (err) {
      // Rollback : commitPending a echoue. On supprime UNIQUEMENT la copy,
      // jamais le Book parent (peut avoir d'autres copies).
      await db.bookCopy.delete({ where: { id: copyRow.id } }).catch(() => {})
      throw err
    }
  }

  return { copyId: copyRow.id }
}
