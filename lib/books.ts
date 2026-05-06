import type { Book, BookCopy, CopyType, FileFormat, User } from "@prisma/client"
import { z } from "zod"

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
