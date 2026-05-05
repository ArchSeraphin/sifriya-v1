// =====================================================================
// Sifriya — recherche de metadonnees livre
// Source primaire : Google Books. Fallback : Open Library.
// =====================================================================

export type BookMetadata = {
  source: "google_books" | "open_library"
  externalId: string
  title: string
  author: string | null
  isbn: string | null
  year: number | null
  publisher: string | null
  language: string | null
  coverUrl: string | null
  description: string | null
  genre: string | null
}

const GOOGLE_API = "https://www.googleapis.com/books/v1/volumes"
const OPENLIB_SEARCH = "https://openlibrary.org/search.json"

const TIMEOUT_MS = 6000

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const ac = new AbortController()
    const t = setTimeout(() => ac.abort(), TIMEOUT_MS)
    const res = await fetch(url, { signal: ac.signal, next: { revalidate: 0 } })
    clearTimeout(t)
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

// =====================================================================
// Google Books
// =====================================================================

type GBVolume = {
  id: string
  volumeInfo?: {
    title?: string
    authors?: string[]
    publisher?: string
    publishedDate?: string
    description?: string
    industryIdentifiers?: { type: string; identifier: string }[]
    language?: string
    categories?: string[]
    imageLinks?: { thumbnail?: string; smallThumbnail?: string }
  }
}
type GBList = { items?: GBVolume[]; totalItems?: number }

function pickIsbn(ids?: { type: string; identifier: string }[] | null): string | null {
  if (!ids) return null
  const isbn13 = ids.find((i) => i.type === "ISBN_13")?.identifier
  if (isbn13) return isbn13
  const isbn10 = ids.find((i) => i.type === "ISBN_10")?.identifier
  return isbn10 ?? null
}

function pickYear(date?: string | null): number | null {
  if (!date) return null
  const m = /^(\d{4})/.exec(date)
  return m ? Number(m[1]) : null
}

function fromGoogleVolume(v: GBVolume): BookMetadata | null {
  const info = v.volumeInfo
  if (!info?.title) return null
  const cover = info.imageLinks?.thumbnail ?? info.imageLinks?.smallThumbnail ?? null
  return {
    source: "google_books",
    externalId: v.id,
    title: info.title,
    author: info.authors && info.authors.length > 0 ? info.authors.join(", ") : null,
    isbn: pickIsbn(info.industryIdentifiers),
    year: pickYear(info.publishedDate),
    publisher: info.publisher ?? null,
    language: info.language ?? null,
    coverUrl: cover ? cover.replace(/^http:\/\//, "https://") : null,
    description: info.description ?? null,
    genre: info.categories?.[0] ?? null
  }
}

async function searchGoogle(query: string, limit: number): Promise<BookMetadata[]> {
  const params = new URLSearchParams({ q: query, maxResults: String(limit), printType: "books" })
  if (process.env.GOOGLE_BOOKS_API_KEY) params.set("key", process.env.GOOGLE_BOOKS_API_KEY)
  const data = await fetchJson<GBList>(`${GOOGLE_API}?${params.toString()}`)
  if (!data?.items) return []
  return data.items.map(fromGoogleVolume).filter((v): v is BookMetadata => v !== null)
}

// =====================================================================
// Open Library
// =====================================================================

type OLDoc = {
  key: string
  title: string
  author_name?: string[]
  first_publish_year?: number
  publisher?: string[]
  language?: string[]
  isbn?: string[]
  cover_i?: number
  subject?: string[]
  edition_key?: string[]
}
type OLSearch = { docs?: OLDoc[] }

function fromOpenLibraryDoc(doc: OLDoc): BookMetadata {
  return {
    source: "open_library",
    externalId: doc.key,
    title: doc.title,
    author: doc.author_name?.join(", ") ?? null,
    isbn: doc.isbn?.[0] ?? null,
    year: doc.first_publish_year ?? null,
    publisher: doc.publisher?.[0] ?? null,
    language: doc.language?.[0] ?? null,
    coverUrl: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg` : null,
    description: null,
    genre: doc.subject?.[0] ?? null
  }
}

async function searchOpenLibrary(query: string, limit: number): Promise<BookMetadata[]> {
  const params = new URLSearchParams({ q: query, limit: String(limit) })
  const data = await fetchJson<OLSearch>(`${OPENLIB_SEARCH}?${params.toString()}`)
  if (!data?.docs) return []
  return data.docs.slice(0, limit).map(fromOpenLibraryDoc)
}

// =====================================================================
// API publique
// =====================================================================

export async function searchBooks(query: string, opts: { limit?: number } = {}): Promise<BookMetadata[]> {
  const trimmed = query.trim()
  if (trimmed.length < 2) return []
  const limit = Math.min(Math.max(opts.limit ?? 5, 1), 10)

  const primary = await searchGoogle(trimmed, limit)
  if (primary.length >= 3) return primary

  const fallback = await searchOpenLibrary(trimmed, limit)
  // On merge en deduplicant par titre+auteur (case insensitive).
  const seen = new Set<string>()
  const out: BookMetadata[] = []
  for (const m of [...primary, ...fallback]) {
    const k = `${m.title.toLowerCase()}|${(m.author ?? "").toLowerCase()}`
    if (seen.has(k)) continue
    seen.add(k)
    out.push(m)
    if (out.length >= limit) break
  }
  return out
}

export async function findByIsbn(isbn: string): Promise<BookMetadata | null> {
  const cleaned = isbn.replace(/[^0-9Xx]/g, "")
  if (cleaned.length !== 10 && cleaned.length !== 13) return null
  const list = await searchGoogle(`isbn:${cleaned}`, 1)
  if (list.length > 0) return list[0]!
  // Fallback Open Library
  const ol = await fetchJson<Record<string, { title?: string; authors?: { name?: string }[]; publishers?: { name: string }[]; publish_date?: string }>>(
    `https://openlibrary.org/api/books?bibkeys=ISBN:${cleaned}&format=json&jscmd=data`
  )
  if (!ol) return null
  const entry = ol[`ISBN:${cleaned}`]
  if (!entry?.title) return null
  return {
    source: "open_library",
    externalId: `ISBN:${cleaned}`,
    title: entry.title,
    author: entry.authors?.map((a) => a.name).filter(Boolean).join(", ") || null,
    isbn: cleaned,
    year: pickYear(entry.publish_date),
    publisher: entry.publishers?.[0]?.name ?? null,
    language: null,
    coverUrl: `https://covers.openlibrary.org/b/isbn/${cleaned}-L.jpg`,
    description: null,
    genre: null
  }
}

// Hint depuis un nom de fichier upload : "Le_Petit_Prince - Saint-Exupery.epub"
export function queryFromFilename(filename: string): string {
  return filename
    .replace(/\.[a-zA-Z0-9]+$/, "")
    .replace(/[_\-+]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}
