import type { Book, BookCopy, CopyType, FileFormat, Prisma, User } from "@prisma/client"
import { z } from "zod"
import { db } from "@/lib/db"
import { commitPending } from "@/lib/storage"
import { computeMatchKey, normalizeIsbn } from "@/lib/match"

export const DEFAULT_PAGE_SIZE = 24

export const SortKey = z.enum(["recent", "title-asc", "author-asc"])
export type SortKeyT = z.infer<typeof SortKey>

export const ListQuery = z.object({
  q: z.string().trim().max(200).optional().default(""),
  // Filtres traduits cote API en where: { copies: { some: { type: "DIGITAL" } } } etc.
  type: z.enum(["DIGITAL", "PHYSICAL"]).optional(),
  format: z.enum(["EPUB", "PDF"]).optional(),
  sort: SortKey.optional().default("recent"),
  ownerId: z.string().optional(),
  addedById: z.string().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(60).optional().default(DEFAULT_PAGE_SIZE)
})
export type ListQueryT = z.infer<typeof ListQuery>

export const orderByForSort = {
  recent: { addedAt: "desc" },
  "title-asc": { title: "asc" },
  "author-asc": { author: "asc" }
} as const satisfies Record<SortKeyT, Record<string, "asc" | "desc">>

// =====================================================================
// Serialiseur — n'expose JAMAIS filePath ni external info brute.
// =====================================================================

export type PersonLite = Pick<User, "id" | "name" | "email" | "avatarColor">

export type CopyDTO = Pick<
  BookCopy,
  "id" | "type" | "format" | "fileSize" | "addedAt"
> & {
  owner: PersonLite | null
  addedBy: PersonLite
}

export type BookListed = Pick<
  Book,
  "id" | "title" | "author" | "isbn" | "coverUrl" | "genre" | "year" | "publisher" | "language" | "addedAt"
> & {
  copies: CopyDTO[]
}

export type BookDetailDTO = BookListed & { description: string | null }

export const PUBLIC_COPY_SELECT = {
  id: true,
  type: true,
  format: true,
  fileSize: true,
  addedAt: true,
  owner: { select: { id: true, name: true, email: true, avatarColor: true } },
  addedBy: { select: { id: true, name: true, email: true, avatarColor: true } }
} as const

export const PUBLIC_BOOK_SELECT = {
  id: true,
  title: true,
  author: true,
  isbn: true,
  coverUrl: true,
  description: true,
  genre: true,
  year: true,
  publisher: true,
  language: true,
  addedAt: true,
  copies: {
    select: PUBLIC_COPY_SELECT,
    orderBy: { addedAt: "asc" }
  }
} as const

// =====================================================================
// Helpers d'affichage
// =====================================================================

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes && bytes !== 0) return ""
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}

export function formatLabel(format: FileFormat | null | undefined): string {
  if (!format) return ""
  return format
}

export function copyTypeLabel(type: CopyType): string {
  return type === "DIGITAL" ? "Numerique" : "Physique"
}

// Helpers pour BookListed -> chips d'affichage
export function digitalFormats(book: { copies: { type: CopyType; format: FileFormat | null }[] }): FileFormat[] {
  const set = new Set<FileFormat>()
  for (const c of book.copies) {
    if (c.type === "DIGITAL" && c.format) set.add(c.format)
  }
  return [...set].sort()
}

export function physicalCount(book: { copies: { type: CopyType }[] }): number {
  return book.copies.filter((c) => c.type === "PHYSICAL").length
}

// =====================================================================
// Helpers de creation Book / BookCopy — partages entre :
//   - POST /api/books             (creation Book + 1ere copie)
//   - POST /api/books/[id]/copies (ajout d'une copie sur Book existant)
//   - POST /api/books/match       (V1.4+ bulk upload — ajout/merge auto)
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
    const finalKey = await commitPending({
      pendingId: copy.uploadId,
      ext,
      finalKey: `copies/${created.copyId}.${ext}`
    })
    await db.bookCopy.update({
      where: { id: created.copyId },
      data: { filePath: finalKey }
    })
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
    const finalKey = await commitPending({
      pendingId: copy.uploadId,
      ext,
      finalKey: `copies/${copyRow.id}.${ext}`
    })
    await db.bookCopy.update({
      where: { id: copyRow.id },
      data: { filePath: finalKey }
    })
  }

  return { copyId: copyRow.id }
}
