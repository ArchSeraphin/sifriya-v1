# V1.3 — Doublons & multi-formats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `Book` plat → `Book` (œuvre) + `BookCopy` (exemplaire numérique ou physique). Ajouter détection de doublons à l'ajout (ISBN strict, fallback slug titre+auteur normalisés) avec UX hybride (auto-merge ISBN, modale slug, blocage conflit format/owner). Préparer la conversion EPUB↔PDF (feature future) sans la livrer.

**Architecture:** Refactor atomique en branche feature dédiée. Schéma Prisma → lib helpers → API → UI. **Pas de migration de données** : la base actuelle ne contient que des livres de test, on reset le volume Postgres et le dossier `uploads/`. Pas de double-écriture, pas de feature flag — bascule en une release.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Prisma 7 (`@prisma/adapter-pg`), Postgres 17, next-auth v4, Tailwind v4, Zod v4, Lucide React, Resend SMTP.

**Convention projet — pas de TDD :** ce projet n'a pas de framework de test installé (cf. mémoire `feedback_conventions`). Les étapes "test fail → impl → test pass" sont remplacées par : implémenter → `tsc --noEmit` (build TS) → smoke partiel manuel → commit. Une exception : `lib/match.ts` est une fonction pure et triviale ; un petit script `scripts/match-smoke.ts` est inclus pour vérifier les cas typiques en CLI (pas un vrai framework de test, juste un `node` runnable).

**Branche de travail :** `feat/v1-3-book-copies`. Tous les commits du plan vivent dessus. Merge dans `main` à la fin via PR ou squash, au choix du user lors de la phase finale.

---

## Setup — branche & DB reset

### Task 0.1 : Créer la branche feature

**Files:** aucun (opération git).

- [ ] **Step 1 : Créer la branche depuis `main` à jour**

```bash
git checkout main
git pull --ff-only
git checkout -b feat/v1-3-book-copies
```

### Task 0.2 : Reset du volume Postgres et des fichiers de test

**Files:** aucun (opération Docker + FS).

- [ ] **Step 1 : Arrêter et supprimer le volume Postgres local**

```bash
docker compose down -v
```

Expected : containers stoppés, volume `pgdata` supprimé.

- [ ] **Step 2 : Supprimer les fichiers de test sur disque**

```bash
rm -rf uploads/_pending uploads/books uploads/covers
```

Expected : le dossier `uploads/` peut être laissé vide ou supprimé entièrement — il sera recréé par le code.

- [ ] **Step 3 : Relancer Postgres**

```bash
docker compose up -d
```

Expected : container `db` healthy sur port 5433.

---

## Phase 1 — Schéma Prisma & migration

### Task 1.1 : Remplacer `prisma/schema.prisma`

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1 : Remplacer entièrement le contenu de `prisma/schema.prisma`**

```prisma
// Sifriya — schema Prisma
// Source de verite : CLAUDE.md section 4 + docs/superpowers/specs/2026-05-06-doublons-multiformats-design.md (V1.3).

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
}

// ----- next-auth v4 (PrismaAdapter) -----

model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String? @db.Text
  access_token      String? @db.Text
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String? @db.Text
  session_state     String?
  user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@unique([identifier, token])
}

// ----- Sifriya domain -----

model User {
  id            String    @id @default(cuid())
  email         String    @unique
  emailVerified DateTime?
  name          String?
  image         String?
  role          Role      @default(USER)
  avatarColor   String    @default("#6b6354")
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  accounts      Account[]
  sessions      Session[]

  ownedCopies   BookCopy[] @relation("CopyOwner")
  addedCopies   BookCopy[] @relation("CopyAdder")
  loanRequests  Loan[]     @relation("LoanRequester")
  loansReceived Loan[]     @relation("LoanOwner")
  readings      Reading[]
  invitedBy     User?      @relation("UserInvites", fields: [invitedById], references: [id])
  invitedById   String?
  invitedUsers  User[]     @relation("UserInvites")
}

enum Role {
  ADMIN
  USER
}

model Book {
  id           String     @id @default(cuid())
  title        String
  author       String?
  isbn         String?    @unique
  description  String?    @db.Text
  genre        String?
  year         Int?
  publisher    String?
  language     String?    @default("fr")
  coverUrl     String?
  sourceApi    String?
  externalId   String?
  matchKey     String
  addedAt      DateTime   @default(now())
  updatedAt    DateTime   @updatedAt

  copies       BookCopy[]
  readings     Reading[]

  @@index([matchKey])
  @@index([title])
  @@index([author])
  @@index([addedAt])
}

model BookCopy {
  id          String      @id @default(cuid())
  bookId      String
  book        Book        @relation(fields: [bookId], references: [id], onDelete: Cascade)

  type        CopyType

  format      FileFormat?
  filePath    String?
  fileSize    Int?

  ownerId     String?
  owner       User?       @relation("CopyOwner", fields: [ownerId], references: [id])

  addedById   String
  addedBy     User        @relation("CopyAdder", fields: [addedById], references: [id])
  addedAt     DateTime    @default(now())
  updatedAt   DateTime    @updatedAt

  loans       Loan[]

  @@index([bookId])
  @@index([ownerId])
  @@index([addedById])
}

enum CopyType {
  DIGITAL
  PHYSICAL
}

enum FileFormat {
  EPUB
  PDF
}

model Loan {
  id          String     @id @default(cuid())
  copyId      String
  copy        BookCopy   @relation(fields: [copyId], references: [id], onDelete: Cascade)
  requesterId String
  requester   User       @relation("LoanRequester", fields: [requesterId], references: [id])
  ownerId     String
  owner       User       @relation("LoanOwner", fields: [ownerId], references: [id])
  status      LoanStatus @default(PENDING)
  token       String?    @unique
  tokenExpiry DateTime?
  returnedAt  DateTime?
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt

  @@index([requesterId])
  @@index([ownerId])
  @@index([copyId])
  @@index([status])
}

enum LoanStatus {
  PENDING
  ACCEPTED
  REFUSED
  RETURNED
}

model Reading {
  id        String        @id @default(cuid())
  userId    String
  user      User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  bookId    String
  book      Book          @relation(fields: [bookId], references: [id], onDelete: Cascade)
  status    ReadingStatus @default(TO_READ)
  addedAt   DateTime      @default(now())
  updatedAt DateTime      @updatedAt

  @@unique([userId, bookId])
  @@index([userId, status])
}

enum ReadingStatus {
  TO_READ
  READING
  READ
}
```

### Task 1.2 : Supprimer l'ancienne migration et générer la nouvelle

**Files:**
- Delete: `prisma/migrations/20260505142536_init/`
- Create: `prisma/migrations/<timestamp>_v1_3_book_copies_init/migration.sql` (généré par Prisma)

- [ ] **Step 1 : Supprimer l'ancienne migration**

```bash
rm -rf prisma/migrations/20260505142536_init
```

- [ ] **Step 2 : Générer la nouvelle migration et l'appliquer en dev**

```bash
npx prisma migrate dev --name v1_3_book_copies_init
```

Expected : un dossier `prisma/migrations/<timestamp>_v1_3_book_copies_init/` est créé avec un `migration.sql`. Prisma applique la migration sur la base locale (port 5433). Le client TypeScript est régénéré.

- [ ] **Step 3 : Vérifier que les types Prisma sont à jour**

```bash
ls node_modules/.prisma/client | head -5
```

Expected : fichiers présents (`index.d.ts` notamment).

- [ ] **Step 4 : Relancer le seed admin**

```bash
npm run db:seed
```

Expected : `User { email: ADMIN_EMAIL }` créé en base avec role `ADMIN`. Aucune erreur.

### Task 1.3 : Commit de la phase 1

- [ ] **Step 1 : Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "$(cat <<'EOF'
feat(schema): refactor Book vers Book + BookCopy (V1.3)

- Book devient une œuvre (titre, auteur, ISBN unique, matchKey indexée).
- BookCopy porte le type DIGITAL/PHYSICAL et les attributs du fichier
  ou du propriétaire physique.
- Loan pointe désormais vers BookCopy (cascade onDelete).
- Reading reste sur Book avec onDelete: Cascade ajouté.
- User : ownedBooks/addedBooks remplacés par ownedCopies/addedCopies.

Migration : ancienne supprimée, nouvelle init générée. DB resetée
(early prod, livres de test uniquement).
EOF
)"
```

À ce stade, le projet ne **compile plus** : tous les fichiers TS qui référencent `Book.format`, `Book.type`, `Book.filePath`, `Book.owner`, etc. sont cassés. C'est attendu — la suite du plan corrige progressivement l'API puis l'UI. Les commits intermédiaires laisseront le projet incompilable jusqu'à la fin de la phase 6. Le user devrait travailler en branche dédiée et mesurer la fin par le smoke test E2E (phase 8).

---

## Phase 2 — Helpers `lib/`

### Task 2.1 : `lib/match.ts` — calcul de la matchKey et lookup

**Files:**
- Create: `lib/match.ts`

- [ ] **Step 1 : Créer `lib/match.ts` avec son contenu complet**

```typescript
// lib/match.ts
// =====================================================================
// Sifriya — detection des doublons (V1.3)
// La matchKey est un slug normalise (titre + auteur) servant de fallback
// quand l'ISBN n'est pas renseigne. ISBN reste la cle primaire d'œuvre.
// =====================================================================

import type { Prisma } from "@prisma/client"
import { db } from "@/lib/db"

export function computeMatchKey(title: string, author: string | null | undefined): string {
  const norm = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // diacritiques
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, " ") // ponctuation -> espace
      .replace(/\s+/g, " ")
      .trim()
  return `${norm(title)}--${norm(author ?? "")}`
}

// Normalise l'ISBN : retire tirets/espaces. Renvoie null si vide.
export function normalizeIsbn(isbn: string | null | undefined): string | null {
  if (!isbn) return null
  const cleaned = isbn.replace(/[^0-9Xx]/g, "").toUpperCase()
  return cleaned.length === 0 ? null : cleaned
}

export type MatchConfidence = "high" | "low"

export type BookMatch = {
  bookId: string
  confidence: MatchConfidence
}

// Cherche un Book existant correspondant a l'œuvre proposee.
// Priorite : ISBN strict -> matchKey.
export async function findMatchingBook(input: {
  title: string
  author?: string | null
  isbn?: string | null
}): Promise<BookMatch | null> {
  const isbn = normalizeIsbn(input.isbn)
  if (isbn) {
    const byIsbn = await db.book.findFirst({
      where: { isbn },
      select: { id: true }
    })
    if (byIsbn) return { bookId: byIsbn.id, confidence: "high" }
  }

  const matchKey = computeMatchKey(input.title, input.author ?? null)
  if (matchKey === "--") return null // titre + auteur tous les deux vides

  const bySlug = await db.book.findFirst({
    where: { matchKey },
    select: { id: true }
  })
  if (bySlug) return { bookId: bySlug.id, confidence: "low" }

  return null
}
```

- [ ] **Step 2 : Créer `scripts/match-smoke.ts` (smoke check pur, pas de DB)**

```typescript
// scripts/match-smoke.ts
// Run avec : npx tsx scripts/match-smoke.ts
// Verifie que computeMatchKey est stable sur quelques cas typiques.

import { computeMatchKey, normalizeIsbn } from "../lib/match"

type Case = { label: string; got: string; want: string }

const cases: Case[] = [
  {
    label: "accents minuscules ponctuation",
    got: computeMatchKey("Candide ou l'Optimisme", "Voltaire"),
    want: "candide ou l optimisme--voltaire"
  },
  {
    label: "Hugo - Misérables",
    got: computeMatchKey("Les Misérables", "Victor Hugo"),
    want: "les miserables--victor hugo"
  },
  {
    label: "auteur null",
    got: computeMatchKey("Candide", null),
    want: "candide--"
  },
  {
    label: "double espace",
    got: computeMatchKey("Le  Petit   Prince", "Saint-Exupéry"),
    want: "le petit prince--saint exupery"
  },
  {
    label: "ISBN nettoyage",
    got: normalizeIsbn("978-2-07-040846-9") ?? "<null>",
    want: "9782070408469"
  },
  {
    label: "ISBN vide",
    got: normalizeIsbn("  ") ?? "<null>",
    want: "<null>"
  }
]

let failed = 0
for (const c of cases) {
  const ok = c.got === c.want
  console.log(`${ok ? "OK" : "FAIL"}  ${c.label}\n      got:  ${c.got}\n      want: ${c.want}`)
  if (!ok) failed++
}
process.exit(failed === 0 ? 0 : 1)
```

- [ ] **Step 3 : Lancer le smoke**

```bash
npx tsx scripts/match-smoke.ts
```

Expected : tous les cas affichent `OK`, exit code 0.

- [ ] **Step 4 : Commit**

```bash
git add lib/match.ts scripts/match-smoke.ts
git commit -m "feat(lib): add match.ts (computeMatchKey + findMatchingBook)"
```

### Task 2.2 : `lib/books.ts` — révision DTO et SELECT

**Files:**
- Modify: `lib/books.ts`

- [ ] **Step 1 : Remplacer entièrement `lib/books.ts`**

```typescript
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
  ownerId: z.string().optional(),       // filtre via copies.some(ownerId)
  addedById: z.string().optional(),     // filtre via copies.some(addedById)
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
```

- [ ] **Step 2 : Vérifier la compilation TS du fichier seul (pas du projet)**

```bash
npx tsc --noEmit lib/books.ts 2>&1 | head -30
```

Note : `tsc --noEmit` sur un seul fichier va remonter des erreurs liées aux imports d'autres fichiers cassés (c'est attendu). On cherche que les erreurs *internes à `lib/books.ts`* soient absentes.

- [ ] **Step 3 : Commit**

```bash
git add lib/books.ts
git commit -m "refactor(lib): books.ts expose copies[] DTO + helpers"
```

### Task 2.3 : `lib/storage.ts` — mineur, accepter la nouvelle convention de clé

**Files:**
- Modify: `lib/storage.ts:14` (type `SaveOptions`)

`storage.ts` a déjà `SaveOptions = { dir?: "books" | "covers" | "_pending" }`. On ajoute `"copies"` comme dossier accepté et on garde `"books"` rétrocompatible (au cas où). En pratique, on utilisera `"copies"` partout dorénavant.

- [ ] **Step 1 : Modifier le type `SaveOptions`**

Ouvre `lib/storage.ts`, ligne 14, remplace :
```typescript
export type SaveOptions = { dir?: "books" | "covers" | "_pending" }
```
par :
```typescript
export type SaveOptions = { dir?: "books" | "covers" | "copies" | "_pending" }
```

- [ ] **Step 2 : Commit**

```bash
git add lib/storage.ts
git commit -m "chore(storage): allow 'copies' as save dir"
```

---

## Phase 3 — API endpoints `books`

À partir d'ici on touche les Route Handlers. Le projet ne compile toujours pas, mais on avance endpoint par endpoint. À la fin de la phase 3, les routes API books sont cohérentes.

### Task 3.1 : `POST /api/books/match` (nouveau)

**Files:**
- Create: `app/api/books/match/route.ts`

- [ ] **Step 1 : Créer le fichier**

```typescript
// app/api/books/match/route.ts
import { NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { findMatchingBook } from "@/lib/match"
import { PUBLIC_BOOK_SELECT } from "@/lib/books"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const Body = z.object({
  title: z.string().trim().min(1).max(500),
  author: z.string().trim().max(300).optional().nullable(),
  isbn: z.string().trim().max(20).optional().nullable()
})

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Non authentifie." }, { status: 401 })

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 })
  }
  const parsed = Body.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: "Donnees invalides." }, { status: 400 })
  }

  const match = await findMatchingBook(parsed.data)
  if (!match) return NextResponse.json({ match: null })

  const book = await db.book.findUnique({
    where: { id: match.bookId },
    select: PUBLIC_BOOK_SELECT
  })
  if (!book) return NextResponse.json({ match: null })

  return NextResponse.json({
    match: { bookId: match.bookId, confidence: match.confidence, book }
  })
}
```

- [ ] **Step 2 : Commit**

```bash
git add app/api/books/match/route.ts
git commit -m "feat(api): POST /api/books/match (lookup ISBN/slug)"
```

### Task 3.2 : Refondre `app/api/books/route.ts` (POST + GET)

**Files:**
- Modify: `app/api/books/route.ts` (réécriture complète)

- [ ] **Step 1 : Remplacer entièrement `app/api/books/route.ts`**

```typescript
import { NextResponse } from "next/server"
import { z } from "zod"
import type { Prisma } from "@prisma/client"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { ListQuery, orderByForSort, PUBLIC_BOOK_SELECT } from "@/lib/books"
import { commitPending } from "@/lib/storage"
import { computeMatchKey, normalizeIsbn } from "@/lib/match"
import { logger } from "@/lib/logger"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// =====================================================================
// GET /api/books — liste paginee + filtres (multi-formats)
// =====================================================================

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Non authentifie." }, { status: 401 })

  const url = new URL(req.url)
  const parsed = ListQuery.safeParse(Object.fromEntries(url.searchParams.entries()))
  if (!parsed.success) {
    return NextResponse.json({ error: "Parametres invalides." }, { status: 400 })
  }
  const { q, type, format, sort, ownerId, addedById, page, limit } = parsed.data

  const where: Prisma.BookWhereInput = {}
  if (q) {
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { author: { contains: q, mode: "insensitive" } },
      { isbn: { contains: q, mode: "insensitive" } }
    ]
  }

  // Filtres copies — combines via copies.some({...})
  const copyFilters: Prisma.BookCopyWhereInput = {}
  if (type) copyFilters.type = type
  if (format) {
    copyFilters.type = "DIGITAL"
    copyFilters.format = format
  }
  if (ownerId) {
    copyFilters.type = "PHYSICAL"
    copyFilters.ownerId = ownerId
  }
  if (addedById) copyFilters.addedById = addedById
  if (Object.keys(copyFilters).length > 0) {
    where.copies = { some: copyFilters }
  }

  const [total, books] = await Promise.all([
    db.book.count({ where }),
    db.book.findMany({
      where,
      orderBy: orderByForSort[sort],
      skip: (page - 1) * limit,
      take: limit,
      select: PUBLIC_BOOK_SELECT
    })
  ])

  const totalPages = Math.max(1, Math.ceil(total / limit))
  return NextResponse.json({ books, total, page, totalPages, limit })
}

// =====================================================================
// POST /api/books — cree un Book + 1ere BookCopy (transaction)
// =====================================================================

const CoverUrl = z
  .string()
  .trim()
  .refine(
    (s) => s.startsWith("/api/covers/") || /^https?:\/\//.test(s),
    { message: "URL de couverture invalide." }
  )

const Common = z.object({
  title: z.string().trim().min(1).max(500),
  author: z.string().trim().max(300).optional().nullable(),
  isbn: z.string().trim().max(20).optional().nullable(),
  description: z.string().trim().max(5000).optional().nullable(),
  genre: z.string().trim().max(120).optional().nullable(),
  year: z.number().int().min(0).max(2200).optional().nullable(),
  publisher: z.string().trim().max(200).optional().nullable(),
  language: z.string().trim().max(10).optional().nullable(),
  coverUrl: CoverUrl.optional().nullable(),
  sourceApi: z.enum(["google_books", "open_library", "bnf", "manual"]).optional().nullable(),
  externalId: z.string().trim().max(200).optional().nullable()
})

const DigitalCreate = Common.extend({
  copyType: z.literal("DIGITAL"),
  uploadId: z.string().min(8).max(64),
  format: z.enum(["EPUB", "PDF"]),
  fileSize: z.number().int().min(1)
})

const PhysicalCreate = Common.extend({
  copyType: z.literal("PHYSICAL")
})

const CreateBody = z.discriminatedUnion("copyType", [DigitalCreate, PhysicalCreate])

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Non authentifie." }, { status: 401 })

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 })
  }

  const parsed = CreateBody.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Donnees invalides.", issues: parsed.error.flatten() },
      { status: 400 }
    )
  }
  const data = parsed.data

  const isbn = normalizeIsbn(data.isbn)
  const matchKey = computeMatchKey(data.title, data.author ?? null)

  // Pour DIGITAL : on cree d'abord Book + Copy (filePath: pending), puis on
  // commit le fichier. Rollback si echec.
  if (data.copyType === "DIGITAL") {
    const ext = data.format.toLowerCase() as "epub" | "pdf"
    let bookId: string | null = null
    let copyId: string | null = null
    try {
      const created = await db.$transaction(async (tx) => {
        const book = await tx.book.create({
          data: {
            title: data.title,
            author: data.author ?? null,
            isbn,
            description: data.description ?? null,
            genre: data.genre ?? null,
            year: data.year ?? null,
            publisher: data.publisher ?? null,
            language: data.language ?? "fr",
            coverUrl: data.coverUrl ?? null,
            sourceApi: data.sourceApi ?? null,
            externalId: data.externalId ?? null,
            matchKey
          },
          select: { id: true }
        })
        const copy = await tx.bookCopy.create({
          data: {
            bookId: book.id,
            type: "DIGITAL",
            format: data.format,
            fileSize: data.fileSize,
            filePath: "pending",
            addedById: session.user.id
          },
          select: { id: true }
        })
        return { bookId: book.id, copyId: copy.id }
      })
      bookId = created.bookId
      copyId = created.copyId

      const finalKey = await commitPending({
        pendingId: data.uploadId,
        ext,
        finalKey: `copies/${copyId}.${ext}`
      })
      await db.bookCopy.update({
        where: { id: copyId },
        data: { filePath: finalKey }
      })

      const book = await db.book.findUnique({
        where: { id: bookId },
        select: PUBLIC_BOOK_SELECT
      })
      return NextResponse.json({ book }, { status: 201 })
    } catch (err) {
      logger.error("create digital book failed", { err: String(err) })
      // Rollback : on supprime le Book (cascade -> copy)
      if (bookId) {
        await db.book.delete({ where: { id: bookId } }).catch(() => {})
      }
      if (isUniqueViolation(err)) {
        return NextResponse.json(
          { error: "Un livre avec ce ISBN existe deja." },
          { status: 409 }
        )
      }
      return NextResponse.json(
        { error: "Impossible d'enregistrer le livre. Reessayez l'envoi du fichier." },
        { status: 500 }
      )
    }
  }

  // PHYSICAL : Book + Copy en transaction simple.
  try {
    const book = await db.$transaction(async (tx) => {
      const b = await tx.book.create({
        data: {
          title: data.title,
          author: data.author ?? null,
          isbn,
          description: data.description ?? null,
          genre: data.genre ?? null,
          year: data.year ?? null,
          publisher: data.publisher ?? null,
          language: data.language ?? "fr",
          coverUrl: data.coverUrl ?? null,
          sourceApi: data.sourceApi ?? null,
          externalId: data.externalId ?? null,
          matchKey
        },
        select: { id: true }
      })
      await tx.bookCopy.create({
        data: {
          bookId: b.id,
          type: "PHYSICAL",
          ownerId: session.user.id,
          addedById: session.user.id
        }
      })
      return b
    })
    const full = await db.book.findUnique({
      where: { id: book.id },
      select: PUBLIC_BOOK_SELECT
    })
    return NextResponse.json({ book: full }, { status: 201 })
  } catch (err) {
    logger.error("create physical book failed", { err: String(err) })
    if (isUniqueViolation(err)) {
      return NextResponse.json(
        { error: "Un livre avec ce ISBN existe deja." },
        { status: 409 }
      )
    }
    return NextResponse.json(
      { error: "Impossible d'enregistrer le livre." },
      { status: 500 }
    )
  }
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "P2002"
  )
}
```

- [ ] **Step 2 : Commit**

```bash
git add app/api/books/route.ts
git commit -m "refactor(api): POST/GET /api/books pour Book + BookCopy"
```

### Task 3.3 : `POST /api/books/[id]/copies` (nouveau)

**Files:**
- Create: `app/api/books/[id]/copies/route.ts`

- [ ] **Step 1 : Créer le fichier**

```typescript
// app/api/books/[id]/copies/route.ts
import { NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { commitPending } from "@/lib/storage"
import { PUBLIC_BOOK_SELECT } from "@/lib/books"
import { logger } from "@/lib/logger"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const DigitalCopy = z.object({
  type: z.literal("DIGITAL"),
  uploadId: z.string().min(8).max(64),
  format: z.enum(["EPUB", "PDF"]),
  fileSize: z.number().int().min(1)
})

const PhysicalCopy = z.object({
  type: z.literal("PHYSICAL")
})

const CopyBody = z.discriminatedUnion("type", [DigitalCopy, PhysicalCopy])

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Non authentifie." }, { status: 401 })

  const { id: bookId } = await ctx.params

  const book = await db.book.findUnique({
    where: { id: bookId },
    select: { id: true }
  })
  if (!book) return NextResponse.json({ error: "Livre introuvable." }, { status: 404 })

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 })
  }

  const parsed = CopyBody.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Donnees invalides.", issues: parsed.error.flatten() },
      { status: 400 }
    )
  }
  const data = parsed.data

  if (data.type === "DIGITAL") {
    // Conflit : meme (bookId, format) deja present ?
    const existing = await db.bookCopy.findFirst({
      where: { bookId, type: "DIGITAL", format: data.format },
      select: { id: true }
    })
    if (existing) {
      return NextResponse.json(
        { error: `Cette bibliotheque contient deja ce livre en ${data.format}.` },
        { status: 409 }
      )
    }

    const ext = data.format.toLowerCase() as "epub" | "pdf"
    let copyId: string | null = null
    try {
      const copy = await db.bookCopy.create({
        data: {
          bookId,
          type: "DIGITAL",
          format: data.format,
          fileSize: data.fileSize,
          filePath: "pending",
          addedById: session.user.id
        },
        select: { id: true }
      })
      copyId = copy.id
      const finalKey = await commitPending({
        pendingId: data.uploadId,
        ext,
        finalKey: `copies/${copyId}.${ext}`
      })
      await db.bookCopy.update({
        where: { id: copyId },
        data: { filePath: finalKey }
      })
      const full = await db.book.findUnique({
        where: { id: bookId },
        select: PUBLIC_BOOK_SELECT
      })
      return NextResponse.json({ book: full }, { status: 201 })
    } catch (err) {
      logger.error("add digital copy failed", { err: String(err) })
      if (copyId) {
        await db.bookCopy.delete({ where: { id: copyId } }).catch(() => {})
      }
      return NextResponse.json(
        { error: "Impossible d'ajouter cette copie." },
        { status: 500 }
      )
    }
  }

  // PHYSICAL — conflit : meme (bookId, ownerId, type=PHYSICAL) deja present ?
  const existingPhysical = await db.bookCopy.findFirst({
    where: { bookId, type: "PHYSICAL", ownerId: session.user.id },
    select: { id: true }
  })
  if (existingPhysical) {
    return NextResponse.json(
      { error: "Vous avez deja declare votre exemplaire physique de ce livre." },
      { status: 409 }
    )
  }

  await db.bookCopy.create({
    data: {
      bookId,
      type: "PHYSICAL",
      ownerId: session.user.id,
      addedById: session.user.id
    }
  })
  const full = await db.book.findUnique({
    where: { id: bookId },
    select: PUBLIC_BOOK_SELECT
  })
  return NextResponse.json({ book: full }, { status: 201 })
}
```

- [ ] **Step 2 : Commit**

```bash
git add app/api/books/[id]/copies/route.ts
git commit -m "feat(api): POST /api/books/[id]/copies (ajout copie sur Book existant)"
```

### Task 3.4 : `DELETE /api/books/[id]/copies/[cid]` (nouveau)

**Files:**
- Create: `app/api/books/[id]/copies/[cid]/route.ts`

- [ ] **Step 1 : Créer le fichier**

```typescript
// app/api/books/[id]/copies/[cid]/route.ts
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { deleteByKey } from "@/lib/storage"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string; cid: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Non authentifie." }, { status: 401 })

  const { id: bookId, cid: copyId } = await ctx.params

  const copy = await db.bookCopy.findUnique({
    where: { id: copyId },
    select: {
      id: true,
      bookId: true,
      type: true,
      filePath: true,
      addedById: true,
      loans: {
        where: { status: { in: ["PENDING", "ACCEPTED"] } },
        select: { id: true }
      }
    }
  })
  if (!copy || copy.bookId !== bookId) {
    return NextResponse.json({ error: "Copie introuvable." }, { status: 404 })
  }

  const isAdmin = session.user.role === "ADMIN"
  const isAdder = copy.addedById === session.user.id
  if (!isAdmin && !isAdder) {
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 })
  }

  if (copy.type === "PHYSICAL" && copy.loans.length > 0) {
    return NextResponse.json(
      {
        error:
          "Cette copie est actuellement pretee. Marquez le pret comme rendu avant de la retirer."
      },
      { status: 409 }
    )
  }

  await db.$transaction(async (tx) => {
    await tx.bookCopy.delete({ where: { id: copyId } })
    const remaining = await tx.bookCopy.count({ where: { bookId } })
    if (remaining === 0) {
      await tx.book.delete({ where: { id: bookId } })
    }
  })

  // Suppression fichier (digital) hors transaction.
  if (copy.type === "DIGITAL") {
    await deleteByKey(copy.filePath ?? null)
  }

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2 : Commit**

```bash
git add "app/api/books/[id]/copies/[cid]/route.ts"
git commit -m "feat(api): DELETE /api/books/[id]/copies/[cid] (cascade Book si derniere)"
```

### Task 3.5 : Refondre `GET /api/books/[id]` et `PATCH /api/books/[id]` et `DELETE /api/books/[id]`

**Files:**
- Modify: `app/api/books/[id]/route.ts` (réécriture complète)

- [ ] **Step 1 : Remplacer entièrement `app/api/books/[id]/route.ts`**

```typescript
import { NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { deleteByKey } from "@/lib/storage"
import { PUBLIC_BOOK_SELECT } from "@/lib/books"
import { computeMatchKey, normalizeIsbn } from "@/lib/match"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Non authentifie." }, { status: 401 })
  const { id } = await ctx.params
  const book = await db.book.findUnique({ where: { id }, select: PUBLIC_BOOK_SELECT })
  if (!book) return NextResponse.json({ error: "Livre introuvable." }, { status: 404 })
  return NextResponse.json({ book })
}

const CoverUrl = z
  .string()
  .trim()
  .refine(
    (s) => s === "" || s.startsWith("/api/covers/") || /^https?:\/\//.test(s),
    { message: "URL de couverture invalide." }
  )

const PatchBody = z
  .object({
    title: z.string().trim().min(1).max(500).optional(),
    author: z.string().trim().max(300).nullable().optional(),
    isbn: z.string().trim().max(20).nullable().optional(),
    description: z.string().trim().max(5000).nullable().optional(),
    genre: z.string().trim().max(120).nullable().optional(),
    year: z.number().int().min(0).max(2200).nullable().optional(),
    publisher: z.string().trim().max(200).nullable().optional(),
    language: z.string().trim().max(10).nullable().optional(),
    coverUrl: CoverUrl.nullable().optional()
  })
  .strict()

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Non authentifie." }, { status: 401 })
  const { id } = await ctx.params

  const book = await db.book.findUnique({
    where: { id },
    select: { id: true, copies: { select: { addedById: true } } }
  })
  if (!book) return NextResponse.json({ error: "Livre introuvable." }, { status: 404 })

  const isAdmin = session.user.role === "ADMIN"
  const isCopyOwner = book.copies.some((c) => c.addedById === session.user.id)
  if (!isAdmin && !isCopyOwner) {
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 })
  }

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 })
  }
  const parsed = PatchBody.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Donnees invalides.", issues: parsed.error.flatten() },
      { status: 400 }
    )
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "Aucun champ a modifier." }, { status: 400 })
  }

  const data = parsed.data
  const normalized: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(data)) {
    if (k === "title") {
      if (typeof v === "string") normalized[k] = v
      continue
    }
    normalized[k] = v === "" ? null : v
  }

  // Si titre/auteur/isbn change, recalculer matchKey + normaliser ISBN
  if ("title" in normalized || "author" in normalized || "isbn" in normalized) {
    const merged = { ...book, ...normalized } as { title: string; author: string | null; isbn: string | null }
    // book n'a que { id, copies } — il faut recharger title/author courants
    const current = await db.book.findUnique({
      where: { id },
      select: { title: true, author: true, isbn: true }
    })
    const finalTitle = (normalized.title as string | undefined) ?? current!.title
    const finalAuthor =
      "author" in normalized ? (normalized.author as string | null) : current!.author
    const finalIsbn = "isbn" in normalized ? (normalized.isbn as string | null) : current!.isbn
    normalized.matchKey = computeMatchKey(finalTitle, finalAuthor)
    normalized.isbn = normalizeIsbn(finalIsbn)
  }

  try {
    const updated = await db.book.update({
      where: { id },
      data: normalized,
      select: PUBLIC_BOOK_SELECT
    })
    return NextResponse.json({ book: updated })
  } catch (err) {
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code?: string }).code === "P2002"
    ) {
      return NextResponse.json(
        { error: "Un autre livre porte deja cet ISBN." },
        { status: 409 }
      )
    }
    throw err
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Non authentifie." }, { status: 401 })

  // Reserve admin (route nucleaire). Suppression normale = via DELETE copie.
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 })
  }

  const { id } = await ctx.params

  const book = await db.book.findUnique({
    where: { id },
    select: {
      id: true,
      copies: { select: { id: true, type: true, filePath: true } }
    }
  })
  if (!book) return NextResponse.json({ error: "Livre introuvable." }, { status: 404 })

  await db.book.delete({ where: { id } })

  // Suppression des fichiers digital hors DB.
  for (const c of book.copies) {
    if (c.type === "DIGITAL") {
      await deleteByKey(c.filePath ?? null)
    }
  }

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2 : Commit**

```bash
git add "app/api/books/[id]/route.ts"
git commit -m "refactor(api): GET/PATCH/DELETE /api/books/[id] aligned with copies"
```

### Task 3.6 : Refondre `GET /api/books/[id]/download`

**Files:**
- Modify: `app/api/books/[id]/download/route.ts` (réécriture)

- [ ] **Step 1 : Remplacer entièrement `app/api/books/[id]/download/route.ts`**

```typescript
import { NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { readWebStream, statByKey } from "@/lib/storage"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const Query = z.object({
  format: z.enum(["EPUB", "PDF"])
})

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Non authentifie." }, { status: 401 })
  }
  const { id: bookId } = await ctx.params

  const url = new URL(req.url)
  const parsed = Query.safeParse(Object.fromEntries(url.searchParams.entries()))
  if (!parsed.success) {
    return NextResponse.json({ error: "Format requis (EPUB ou PDF)." }, { status: 400 })
  }
  const { format } = parsed.data

  const copy = await db.bookCopy.findFirst({
    where: { bookId, type: "DIGITAL", format },
    select: { id: true, filePath: true, format: true }
  })
  if (!copy?.filePath) {
    return NextResponse.json(
      { error: `Aucune copie ${format} disponible pour ce livre.` },
      { status: 404 }
    )
  }

  const meta = await statByKey(copy.filePath)
  if (!meta) {
    return NextResponse.json({ error: "Fichier introuvable." }, { status: 404 })
  }

  const book = await db.book.findUnique({
    where: { id: bookId },
    select: { title: true, author: true }
  })
  const ext = format.toLowerCase()
  const safeTitle = (book?.title ?? "livre").replace(/[^a-zA-Z0-9._-]+/g, "_")
  const filename = `${safeTitle}.${ext}`

  return new NextResponse(readWebStream(copy.filePath), {
    headers: {
      "content-type": format === "EPUB" ? "application/epub+zip" : "application/pdf",
      "content-length": String(meta.size),
      "content-disposition": `attachment; filename="${filename}"`
    }
  })
}
```

- [ ] **Step 2 : Commit**

```bash
git add "app/api/books/[id]/download/route.ts"
git commit -m "refactor(api): /api/books/[id]/download prend ?format=EPUB|PDF"
```

---

## Phase 4 — API endpoints `loans`

### Task 4.1 : Refondre `POST /api/loans` et `GET /api/loans`

**Files:**
- Modify: `app/api/loans/route.ts` (réécriture complète)

- [ ] **Step 1 : Lire le fichier actuel pour comprendre le pattern existant**

```bash
cat app/api/loans/route.ts | head -80
```

- [ ] **Step 2 : Remplacer entièrement `app/api/loans/route.ts`**

```typescript
import { NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { createLoanToken } from "@/lib/loan-token"
import { sendLoanRequest } from "@/lib/email"
import { logger } from "@/lib/logger"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const CreateBody = z.object({
  copyId: z.string().min(1)
})

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Non authentifie." }, { status: 401 })

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 })
  }
  const parsed = CreateBody.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: "copyId requis." }, { status: 400 })
  }

  const copy = await db.bookCopy.findUnique({
    where: { id: parsed.data.copyId },
    select: {
      id: true,
      type: true,
      ownerId: true,
      bookId: true,
      book: { select: { title: true } },
      owner: { select: { id: true, name: true, email: true } }
    }
  })
  if (!copy) return NextResponse.json({ error: "Copie introuvable." }, { status: 404 })
  if (copy.type !== "PHYSICAL" || !copy.ownerId || !copy.owner) {
    return NextResponse.json(
      { error: "Cette copie ne peut pas etre pretee." },
      { status: 400 }
    )
  }
  if (copy.ownerId === session.user.id) {
    return NextResponse.json(
      { error: "Vous etes deja proprietaire de cette copie." },
      { status: 400 }
    )
  }

  // Pas de loan PENDING/ACCEPTED actif sur cette copie pour ce demandeur
  const existing = await db.loan.findFirst({
    where: {
      copyId: copy.id,
      requesterId: session.user.id,
      status: { in: ["PENDING", "ACCEPTED"] }
    },
    select: { id: true }
  })
  if (existing) {
    return NextResponse.json(
      { error: "Vous avez deja une demande active sur cette copie." },
      { status: 409 }
    )
  }

  const loan = await db.loan.create({
    data: {
      copyId: copy.id,
      requesterId: session.user.id,
      ownerId: copy.ownerId,
      status: "PENDING"
    },
    select: { id: true }
  })

  const { token, expiresAt } = await createLoanToken(loan.id)
  await db.loan.update({
    where: { id: loan.id },
    data: { token, tokenExpiry: expiresAt }
  })

  const baseUrl = process.env.NEXTAUTH_URL!
  const requesterName =
    session.user.name ?? session.user.email!.split("@")[0]!
  try {
    await sendLoanRequest({
      ownerEmail: copy.owner.email,
      ownerName: copy.owner.name ?? copy.owner.email.split("@")[0]!,
      requesterName,
      bookTitle: copy.book.title,
      acceptUrl: `${baseUrl}/api/loans/${loan.id}/respond?action=accept&token=${token}`,
      refuseUrl: `${baseUrl}/api/loans/${loan.id}/respond?action=refuse&token=${token}`
    })
  } catch (err) {
    logger.error("loan request email failed", { err: String(err) })
  }

  return NextResponse.json({ ok: true, loanId: loan.id }, { status: 201 })
}

export async function GET(_req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Non authentifie." }, { status: 401 })

  const userId = session.user.id

  const [sent, received] = await Promise.all([
    db.loan.findMany({
      where: { requesterId: userId },
      orderBy: { createdAt: "desc" },
      select: loanSelect
    }),
    db.loan.findMany({
      where: { ownerId: userId },
      orderBy: { createdAt: "desc" },
      select: loanSelect
    })
  ])

  return NextResponse.json({ sent, received })
}

const loanSelect = {
  id: true,
  status: true,
  createdAt: true,
  returnedAt: true,
  copy: {
    select: {
      id: true,
      type: true,
      book: {
        select: { id: true, title: true, author: true, coverUrl: true }
      },
      owner: { select: { id: true, name: true, email: true, avatarColor: true } }
    }
  },
  requester: { select: { id: true, name: true, email: true, avatarColor: true } },
  owner: { select: { id: true, name: true, email: true, avatarColor: true } }
} as const
```

- [ ] **Step 3 : Commit**

```bash
git add app/api/loans/route.ts
git commit -m "refactor(api): /api/loans utilise copyId (Loan -> BookCopy)"
```

### Task 4.2 : Adapter `GET /api/loans/[id]/respond`

**Files:**
- Modify: `app/api/loans/[id]/respond/route.ts`

Le respond actuel charge `loan.book.title` pour l'email de confirmation. Il faut désormais traverser `loan.copy.book.title`.

- [ ] **Step 1 : Lire le fichier actuel**

```bash
cat "app/api/loans/[id]/respond/route.ts"
```

- [ ] **Step 2 : Identifier les références à `loan.book` (anciennement direct) et les remplacer par `loan.copy.book`**

Ouvrir le fichier, repérer les `select: { ... book: { ... } }` ou `loan.book.title` et les remplacer par `select: { ... copy: { select: { book: { select: { title: true } } } } }` puis `loan.copy.book.title`. Idem pour `loan.requester` qui reste direct.

Pattern type à appliquer :
```typescript
// AVANT
const loan = await db.loan.findUnique({
  where: { id },
  select: {
    id: true, status: true, token: true, tokenExpiry: true,
    book: { select: { title: true } },
    requester: { select: { email: true, name: true } }
  }
})
// ...
const bookTitle = loan.book.title

// APRES
const loan = await db.loan.findUnique({
  where: { id },
  select: {
    id: true, status: true, token: true, tokenExpiry: true,
    copy: { select: { book: { select: { title: true } } } },
    requester: { select: { email: true, name: true } }
  }
})
// ...
const bookTitle = loan.copy.book.title
```

- [ ] **Step 3 : Commit**

```bash
git add "app/api/loans/[id]/respond/route.ts"
git commit -m "refactor(api): /api/loans/[id]/respond traverse copy.book"
```

### Task 4.3 : Adapter `PATCH /api/loans/[id]/return`

**Files:**
- Modify: `app/api/loans/[id]/return/route.ts`

- [ ] **Step 1 : Lire le fichier actuel**

```bash
cat "app/api/loans/[id]/return/route.ts"
```

- [ ] **Step 2 : Appliquer le même pattern de migration `loan.book` → `loan.copy.book`**

L'authorization (`loan.ownerId === session.user.id`) reste inchangée — `Loan.ownerId` est conservé (denormalisation utile : permet d'éviter une jointure sur Copy à chaque check).

- [ ] **Step 3 : Commit**

```bash
git add "app/api/loans/[id]/return/route.ts"
git commit -m "refactor(api): /api/loans/[id]/return traverse copy.book"
```

---

## Phase 5 — UI : composants ajout (DigitalUploadFlow + PhysicalFlow + DuplicateConfirmModal)

### Task 5.1 : Créer `DuplicateConfirmModal.tsx`

**Files:**
- Create: `components/books/DuplicateConfirmModal.tsx`

- [ ] **Step 1 : Créer le fichier**

```typescript
"use client"

import * as React from "react"
import Link from "next/link"
import { Cover } from "@/components/ui/Cover"
import { Button } from "@/components/ui/Button"
import type { BookListed } from "@/lib/books"
import { digitalFormats, physicalCount } from "@/lib/books"

type Props = {
  book: BookListed
  intentLabel: string // ex. "Ajouter votre PDF" / "Declarer votre exemplaire physique"
  onMerge: () => void
  onCreateNew: () => void
  onCancel: () => void
  pending?: boolean
}

export function DuplicateConfirmModal({
  book,
  intentLabel,
  onMerge,
  onCreateNew,
  onCancel,
  pending
}: Props) {
  const formats = digitalFormats(book)
  const physicals = physicalCount(book)

  return (
    <div className="space-y-5">
      <p className="text-[13px] text-ink-3">
        On a trouve un livre similaire dans la bibliotheque.
      </p>

      <div className="flex gap-4 rounded-xl border border-[var(--rule)] bg-paper-2/30 p-4">
        <div className="w-20 shrink-0">
          <Cover title={book.title} author={book.author} src={book.coverUrl} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-serif text-lg leading-tight text-ink">{book.title}</h3>
          {book.author ? <p className="text-sm text-ink-2">{book.author}</p> : null}
          {book.year ? <p className="mt-0.5 text-[12px] text-ink-3">{book.year}</p> : null}
          {book.isbn ? (
            <p className="mt-0.5 font-mono text-[11px] text-ink-3">ISBN : {book.isbn}</p>
          ) : null}

          <ul className="mt-3 space-y-1 text-[13px] text-ink-2">
            {formats.map((f) => (
              <li key={f}>Numerique {f} disponible</li>
            ))}
            {physicals > 0 ? (
              <li>
                {physicals === 1 ? "1 exemplaire physique" : `${physicals} exemplaires physiques`}
              </li>
            ) : null}
          </ul>
          <Link
            href={`/bibliotheque/${book.id}`}
            target="_blank"
            className="mt-2 inline-block text-[12px] text-accent underline hover:opacity-80"
          >
            Voir la fiche existante
          </Link>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Button onClick={onMerge} disabled={pending} variant="primary">
          {pending ? "Ajout en cours..." : intentLabel}
        </Button>
        <Button onClick={onCreateNew} disabled={pending} variant="secondary">
          Creer une fiche distincte
        </Button>
        <Button onClick={onCancel} disabled={pending} variant="ghost">
          Annuler
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2 : Commit**

```bash
git add components/books/DuplicateConfirmModal.tsx
git commit -m "feat(ui): DuplicateConfirmModal pour fusion vs fiche distincte"
```

### Task 5.2 : Modifier `DigitalUploadFlow.tsx` — intégrer le `/match`

**Files:**
- Modify: `components/books/DigitalUploadFlow.tsx`

- [ ] **Step 1 : Modifier le type `Step` (ligne 13) pour ajouter `"duplicate"`**

```typescript
type Step = "select" | "uploading" | "match" | "form" | "duplicate"
```

- [ ] **Step 2 : Ajouter un état `matchedBook` près des autres `useState`**

Après la ligne `const [error, setError] = React.useState<string | null>(null)` :

```typescript
const [matchedBook, setMatchedBook] = React.useState<import("@/lib/books").BookListed | null>(null)
const [matchedBookId, setMatchedBookId] = React.useState<string | null>(null)
```

- [ ] **Step 3 : Refactorer `onSubmit` pour appeler `/api/books/match` avant le POST**

Remplacer la fonction `onSubmit` par :

```typescript
const onSubmit = async (e: React.FormEvent) => {
  e.preventDefault()
  if (!upload) return
  if (!form.title.trim()) {
    setError("Le titre est obligatoire.")
    return
  }
  setPending(true)
  setError(null)
  // 1. Lookup match
  const matchRes = await fetch("/api/books/match", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      title: form.title.trim(),
      author: form.author.trim() || null,
      isbn: form.isbn.trim() || null
    })
  })
  setPending(false)
  if (matchRes.ok) {
    const body = (await matchRes.json()) as {
      match: null | {
        bookId: string
        confidence: "high" | "low"
        book: import("@/lib/books").BookListed
      }
    }
    if (body.match?.confidence === "high") {
      // Auto-merge silencieux
      await submitMerge(body.match.bookId)
      return
    }
    if (body.match?.confidence === "low") {
      setMatchedBook(body.match.book)
      setMatchedBookId(body.match.bookId)
      setStep("duplicate")
      return
    }
  }
  // No match -> nouveau Book
  await submitNew()
}

const submitNew = async () => {
  if (!upload) return
  setPending(true)
  setError(null)
  const res = await fetch("/api/books", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      copyType: "DIGITAL",
      uploadId: upload.uploadId,
      format: upload.format,
      fileSize: upload.size,
      title: form.title.trim(),
      author: form.author.trim() || null,
      isbn: form.isbn.trim() || null,
      description: form.description.trim() || null,
      genre: form.genre.trim() || null,
      year: form.year ? Number(form.year) : null,
      publisher: form.publisher.trim() || null,
      language: form.language.trim() || null,
      coverUrl: form.coverUrl.trim() || null,
      sourceApi: form.sourceApi || "manual",
      externalId: form.externalId.trim() || null
    })
  })
  setPending(false)
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    setError(body?.error ?? "Echec de l'enregistrement.")
    return
  }
  onClose()
  router.refresh()
}

const submitMerge = async (bookId: string) => {
  if (!upload) return
  setPending(true)
  setError(null)
  const res = await fetch(`/api/books/${bookId}/copies`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "DIGITAL",
      uploadId: upload.uploadId,
      format: upload.format,
      fileSize: upload.size
    })
  })
  setPending(false)
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    setError(body?.error ?? "Echec de l'ajout de la copie.")
    setStep("form")
    return
  }
  onClose()
  router.refresh()
}
```

- [ ] **Step 4 : Ajouter le rendu de l'étape `"duplicate"` avant le `return null` final**

Juste avant le dernier `return null` :

```typescript
if (step === "duplicate" && matchedBook && matchedBookId && upload) {
  return (
    <DuplicateConfirmModal
      book={matchedBook}
      intentLabel={`Ajouter votre ${upload.format} a cette fiche`}
      onMerge={() => submitMerge(matchedBookId)}
      onCreateNew={() => {
        setMatchedBook(null)
        setMatchedBookId(null)
        void submitNew()
      }}
      onCancel={() => {
        setMatchedBook(null)
        setMatchedBookId(null)
        setStep("form")
      }}
      pending={pending}
    />
  )
}
```

- [ ] **Step 5 : Ajouter l'import `DuplicateConfirmModal` en haut du fichier**

Après les autres imports `@/components/...` :

```typescript
import { DuplicateConfirmModal } from "@/components/books/DuplicateConfirmModal"
```

- [ ] **Step 6 : Commit**

```bash
git add components/books/DigitalUploadFlow.tsx
git commit -m "feat(ui): DigitalUploadFlow appelle /match et propose fusion"
```

### Task 5.3 : Modifier `PhysicalFlow.tsx` — intégrer le `/match`

**Files:**
- Modify: `components/books/PhysicalFlow.tsx`

- [ ] **Step 1 : Lire le fichier actuel pour identifier la fonction de submit**

```bash
grep -n "fetch.*api/books" components/books/PhysicalFlow.tsx
```

- [ ] **Step 2 : Appliquer le même pattern que `DigitalUploadFlow` :**
  1. Ajouter `"duplicate"` au type `Step` du fichier
  2. Ajouter état `matchedBook` + `matchedBookId`
  3. Refactor `onSubmit` en `submitNew` + `submitMerge` + check `/match` au début
  4. Ajouter rendu de l'étape duplicate
  5. Importer `DuplicateConfirmModal`

Le body POST `/api/books` change : `type: "PHYSICAL"` devient `copyType: "PHYSICAL"` (et plus de `format`/`uploadId`/`fileSize`). Le body POST `/api/books/[id]/copies` est `{ type: "PHYSICAL" }`.

Code de référence pour `submitNew` côté physical :

```typescript
const submitNew = async () => {
  setPending(true)
  setError(null)
  const res = await fetch("/api/books", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      copyType: "PHYSICAL",
      title: form.title.trim(),
      author: form.author.trim() || null,
      isbn: form.isbn.trim() || null,
      description: form.description.trim() || null,
      genre: form.genre.trim() || null,
      year: form.year ? Number(form.year) : null,
      publisher: form.publisher.trim() || null,
      language: form.language.trim() || null,
      coverUrl: form.coverUrl.trim() || null,
      sourceApi: form.sourceApi || "manual",
      externalId: form.externalId.trim() || null
    })
  })
  setPending(false)
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    setError(body?.error ?? "Echec de l'enregistrement.")
    return
  }
  onClose()
  router.refresh()
}

const submitMerge = async (bookId: string) => {
  setPending(true)
  setError(null)
  const res = await fetch(`/api/books/${bookId}/copies`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "PHYSICAL" })
  })
  setPending(false)
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    setError(body?.error ?? "Echec de l'ajout.")
    setStep("form")
    return
  }
  onClose()
  router.refresh()
}
```

Et le rendu duplicate :

```typescript
if (step === "duplicate" && matchedBook && matchedBookId) {
  return (
    <DuplicateConfirmModal
      book={matchedBook}
      intentLabel="Declarer votre exemplaire physique"
      onMerge={() => submitMerge(matchedBookId)}
      onCreateNew={() => {
        setMatchedBook(null)
        setMatchedBookId(null)
        void submitNew()
      }}
      onCancel={() => {
        setMatchedBook(null)
        setMatchedBookId(null)
        setStep("form")
      }}
      pending={pending}
    />
  )
}
```

- [ ] **Step 3 : Commit**

```bash
git add components/books/PhysicalFlow.tsx
git commit -m "feat(ui): PhysicalFlow appelle /match et propose fusion"
```

---

## Phase 6 — UI : fiche, catalogue, suppression, edit

### Task 6.1 : Créer `CopyList.tsx` (section copies dans la fiche)

**Files:**
- Create: `components/books/CopyList.tsx`

- [ ] **Step 1 : Créer le fichier**

```typescript
"use client"

import * as React from "react"
import { Trash2, FileText, BookOpen } from "lucide-react"
import { Avatar } from "@/components/ui/Avatar"
import { Button } from "@/components/ui/Button"
import type { CopyDTO } from "@/lib/books"
import { formatBytes } from "@/lib/books"
import { useRouter } from "next/navigation"

type Props = {
  bookId: string
  copies: CopyDTO[]
  currentUser: { id: string; role: "ADMIN" | "USER" }
}

export function CopyList({ bookId, copies, currentUser }: Props) {
  const router = useRouter()
  const [deletingId, setDeletingId] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const onDelete = async (copyId: string) => {
    if (!confirm("Supprimer cette copie ?")) return
    setDeletingId(copyId)
    setError(null)
    const res = await fetch(`/api/books/${bookId}/copies/${copyId}`, {
      method: "DELETE"
    })
    setDeletingId(null)
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null
      setError(body?.error ?? "Echec de la suppression.")
      return
    }
    router.refresh()
  }

  return (
    <section className="border-t border-[var(--rule-2)] pt-6">
      <h2 className="font-serif text-lg text-ink">Copies disponibles</h2>
      <ul className="mt-3 space-y-2">
        {copies.map((c) => {
          const canDelete = currentUser.role === "ADMIN" || c.addedBy.id === currentUser.id
          return (
            <li
              key={c.id}
              className="flex items-center gap-3 rounded-md border border-[var(--rule-2)] bg-paper-2/30 px-3 py-2"
            >
              {c.type === "DIGITAL" ? (
                <FileText size={16} className="text-ink-3" />
              ) : (
                <BookOpen size={16} className="text-ink-3" />
              )}
              <div className="flex-1 min-w-0 text-[13px]">
                {c.type === "DIGITAL" ? (
                  <span className="text-ink-2">
                    <span className="font-mono uppercase tracking-widest">{c.format}</span>
                    {c.fileSize ? ` · ${formatBytes(c.fileSize)}` : ""} · ajoute par{" "}
                    <PersonInline person={c.addedBy} />
                  </span>
                ) : c.owner ? (
                  <span className="text-ink-2">
                    Physique chez <PersonInline person={c.owner} />
                  </span>
                ) : null}
              </div>
              {canDelete ? (
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => onDelete(c.id)}
                  disabled={deletingId === c.id}
                  aria-label="Supprimer cette copie"
                >
                  <Trash2 size={14} />
                </Button>
              ) : null}
            </li>
          )
        })}
      </ul>
      {error ? <p className="mt-2 text-[12px] text-[color:var(--err)]">{error}</p> : null}
    </section>
  )
}

function PersonInline({
  person
}: {
  person: { id: string; name: string | null; email: string; avatarColor: string }
}) {
  return (
    <span className="inline-flex items-center gap-1.5 align-middle">
      <Avatar name={person.name} email={person.email} color={person.avatarColor} size="sm" />
      <span className="text-ink">{person.name ?? person.email.split("@")[0]}</span>
    </span>
  )
}
```

- [ ] **Step 2 : Commit**

```bash
git add components/books/CopyList.tsx
git commit -m "feat(ui): CopyList affiche les copies dans BookDetail"
```

### Task 6.2 : Refondre `BookDetail.tsx`

**Files:**
- Modify: `components/books/BookDetail.tsx` (réécriture complète)

- [ ] **Step 1 : Remplacer entièrement `components/books/BookDetail.tsx`**

```typescript
import Link from "next/link"
import { ArrowLeft, Download, Pencil, BookOpen } from "lucide-react"
import { Cover } from "@/components/ui/Cover"
import { Badge } from "@/components/ui/Badge"
import { type BookDetailDTO, digitalFormats, physicalCount } from "@/lib/books"
import { LoanRequestButton } from "@/components/books/LoanRequestButton"
import { CopyList } from "@/components/books/CopyList"

const dateFmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" })

type Props = {
  book: BookDetailDTO
  currentUser: { id: string; role: "ADMIN" | "USER" }
  // Loans actifs sur les copies physiques (key=copyId)
  activeLoansByCopy: Record<string, { id: string; status: "PENDING" | "ACCEPTED"; requester: { id: string; name: string | null; email: string; avatarColor: string } }>
  // Demandes que CET user a en cours (key=copyId)
  myActiveRequestsByCopy: Record<string, { id: string; status: "PENDING" | "ACCEPTED" }>
}

export function BookDetail({
  book,
  currentUser,
  activeLoansByCopy,
  myActiveRequestsByCopy
}: Props) {
  const formats = digitalFormats(book)
  const physicalCopies = book.copies.filter((c) => c.type === "PHYSICAL")
  const physicalsCount = physicalCount(book)

  // Édition autorisée si l'user a au moins une copie sur ce Book + admin.
  const canEditMetadata =
    currentUser.role === "ADMIN" ||
    book.copies.some((c) => c.addedBy.id === currentUser.id)

  // Premier format affiche en cover preview
  const previewFormat = formats[0] ?? null

  return (
    <article className="mx-auto max-w-4xl">
      <Link
        href="/bibliotheque"
        className="inline-flex items-center gap-1 text-[13px] text-ink-3 hover:text-ink"
      >
        <ArrowLeft size={14} />
        Retour a la bibliotheque
      </Link>

      <div className="mt-4 grid grid-cols-1 gap-8 md:grid-cols-[220px_minmax(0,1fr)]">
        <div className="mx-auto w-[180px] sm:w-[220px]">
          <Cover
            title={book.title}
            author={book.author}
            format={previewFormat}
            src={book.coverUrl}
          />
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {formats.map((f) => (
              <Badge key={f} tone="accent">
                {f}
              </Badge>
            ))}
            {physicalsCount > 0 ? (
              <Badge tone="warn">
                {physicalsCount === 1 ? "Physique" : `Physique × ${physicalsCount}`}
              </Badge>
            ) : null}
          </div>
          <h1 className="mt-3 font-serif text-3xl leading-tight text-ink">{book.title}</h1>
          {book.author ? <p className="mt-1 text-base text-ink-2">{book.author}</p> : null}

          {/* Actions principales : 1 bouton telechargement par format + bouton pret physique si pertinent */}
          <div className="mt-6 flex flex-wrap gap-2">
            {formats.map((f) => (
              <a
                key={f}
                href={`/api/books/${book.id}/download?format=${f}`}
                className="inline-flex h-9 items-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-accent-ink shadow-[var(--shadow-1)] transition hover:opacity-95"
              >
                <Download size={16} />
                Telecharger {f}
              </a>
            ))}
            {physicalCopies.length > 0 ? (
              <LoanRequestButton
                bookTitle={book.title}
                copies={physicalCopies.map((c) => ({
                  id: c.id,
                  ownerId: c.owner!.id,
                  ownerName: c.owner!.name ?? c.owner!.email.split("@")[0]!,
                  ownerEmail: c.owner!.email,
                  ownerColor: c.owner!.avatarColor,
                  isMyCopy: c.owner!.id === currentUser.id,
                  activeLoan: activeLoansByCopy[c.id] ?? null,
                  myActiveRequest: myActiveRequestsByCopy[c.id] ?? null
                }))}
              />
            ) : null}
            {canEditMetadata ? (
              <Link
                href={`/bibliotheque/${book.id}/modifier`}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--rule)] bg-paper px-4 text-sm font-medium text-ink-2 shadow-[var(--shadow-1)] transition hover:bg-paper-2 hover:text-ink"
              >
                <Pencil size={16} />
                Modifier la fiche
              </Link>
            ) : null}
          </div>

          {book.description ? (
            <section className="mt-8 border-t border-[var(--rule-2)] pt-6">
              <h2 className="font-serif text-lg text-ink">Description</h2>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink-2">
                {book.description}
              </p>
            </section>
          ) : null}

          <dl className="mt-8 grid grid-cols-1 gap-y-3 border-t border-[var(--rule-2)] pt-6 text-sm sm:grid-cols-2">
            <Item label="ISBN" value={book.isbn} mono />
            <Item label="Editeur" value={book.publisher} />
            <Item label="Annee" value={book.year ? String(book.year) : null} />
            <Item label="Langue" value={book.language?.toUpperCase()} mono />
            <Item label="Genre" value={book.genre} />
            <Item label="Ajoute le" value={dateFmt.format(book.addedAt)} />
          </dl>

          <CopyList bookId={book.id} copies={book.copies} currentUser={currentUser} />
        </div>
      </div>
    </article>
  )
}

function Item({
  label,
  value,
  mono = false
}: {
  label: string
  value: string | null | undefined
  mono?: boolean
}) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-widest text-ink-4">{label}</dt>
      <dd className={`mt-0.5 text-ink-2 ${mono ? "font-mono text-[13px]" : ""}`}>
        {value ?? "—"}
      </dd>
    </div>
  )
}
```

- [ ] **Step 2 : Adapter la page qui charge `BookDetail`**

Le fichier `app/(app)/bibliotheque/[id]/page.tsx` charge le book avec `loan` info. Il faut désormais :
1. Charger le book avec `PUBLIC_BOOK_SELECT` (qui inclut copies)
2. Charger les loans actifs sur **toutes** les copies physiques de ce book
3. Charger les demandes pending/accepted que l'user courant a sur ces mêmes copies

Lire le fichier actuel et adapter :

```bash
cat "app/(app)/bibliotheque/[id]/page.tsx"
```

Pattern à appliquer (signature attendue par `BookDetail`) :

```typescript
// app/(app)/bibliotheque/[id]/page.tsx
import { redirect, notFound } from "next/navigation"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { PUBLIC_BOOK_SELECT } from "@/lib/books"
import { BookDetail } from "@/components/books/BookDetail"

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect("/login")

  const book = await db.book.findUnique({ where: { id }, select: PUBLIC_BOOK_SELECT })
  if (!book) notFound()

  const physicalCopyIds = book.copies.filter((c) => c.type === "PHYSICAL").map((c) => c.id)

  const [activeLoans, myRequests] = await Promise.all([
    physicalCopyIds.length
      ? db.loan.findMany({
          where: {
            copyId: { in: physicalCopyIds },
            status: { in: ["PENDING", "ACCEPTED"] }
          },
          select: {
            id: true,
            copyId: true,
            status: true,
            requester: { select: { id: true, name: true, email: true, avatarColor: true } }
          }
        })
      : Promise.resolve([]),
    physicalCopyIds.length
      ? db.loan.findMany({
          where: {
            copyId: { in: physicalCopyIds },
            requesterId: session.user.id,
            status: { in: ["PENDING", "ACCEPTED"] }
          },
          select: { id: true, copyId: true, status: true }
        })
      : Promise.resolve([])
  ])

  const activeLoansByCopy: Record<string, { id: string; status: "PENDING" | "ACCEPTED"; requester: typeof activeLoans[number]["requester"] }> = {}
  for (const l of activeLoans) {
    activeLoansByCopy[l.copyId] = { id: l.id, status: l.status as "PENDING" | "ACCEPTED", requester: l.requester }
  }
  const myActiveRequestsByCopy: Record<string, { id: string; status: "PENDING" | "ACCEPTED" }> = {}
  for (const r of myRequests) {
    myActiveRequestsByCopy[r.copyId] = { id: r.id, status: r.status as "PENDING" | "ACCEPTED" }
  }

  return (
    <BookDetail
      book={book}
      currentUser={{ id: session.user.id, role: session.user.role }}
      activeLoansByCopy={activeLoansByCopy}
      myActiveRequestsByCopy={myActiveRequestsByCopy}
    />
  )
}
```

- [ ] **Step 3 : Commit**

```bash
git add components/books/BookDetail.tsx "app/(app)/bibliotheque/[id]/page.tsx"
git commit -m "refactor(ui): BookDetail multi-formats + loans par copie"
```

### Task 6.3 : Refondre `LoanRequestButton.tsx`

**Files:**
- Modify: `components/books/LoanRequestButton.tsx` (réécriture)

- [ ] **Step 1 : Lire le fichier actuel**

```bash
cat components/books/LoanRequestButton.tsx
```

- [ ] **Step 2 : Remplacer entièrement par cette version multi-copies**

```typescript
"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Send, Check } from "lucide-react"
import { Button } from "@/components/ui/Button"
import { Modal } from "@/components/ui/Modal"
import { Avatar } from "@/components/ui/Avatar"

export type CopyForLoan = {
  id: string
  ownerId: string
  ownerName: string
  ownerEmail: string
  ownerColor: string
  isMyCopy: boolean
  activeLoan: { id: string; status: "PENDING" | "ACCEPTED" } | null
  myActiveRequest: { id: string; status: "PENDING" | "ACCEPTED" } | null
}

type Props = {
  bookTitle: string
  copies: CopyForLoan[]
}

export function LoanRequestButton({ bookTitle, copies }: Props) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [pending, setPending] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [done, setDone] = React.useState<string | null>(null)

  const requestLoan = async (copyId: string) => {
    setPending(copyId)
    setError(null)
    const res = await fetch("/api/loans", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ copyId })
    })
    setPending(null)
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null
      setError(body?.error ?? "Echec de la demande.")
      return
    }
    setDone(copyId)
    router.refresh()
  }

  const requestable = copies.filter(
    (c) => !c.isMyCopy && !c.myActiveRequest && c.activeLoan?.status !== "ACCEPTED"
  )
  if (requestable.length === 0) {
    return null
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} variant="primary">
        <Send size={16} />
        Demander en pret
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Demander en pret">
        <p className="text-[13px] text-ink-3">
          Choisissez l'exemplaire physique de <strong>{bookTitle}</strong> que vous souhaitez emprunter.
        </p>
        <ul className="mt-3 space-y-2">
          {copies.map((c) => {
            const isOwn = c.isMyCopy
            const lent = c.activeLoan?.status === "ACCEPTED"
            const requested = !!c.myActiveRequest
            const disabled = isOwn || lent || requested || pending !== null
            const succeeded = done === c.id
            return (
              <li
                key={c.id}
                className="flex items-center gap-3 rounded-md border border-[var(--rule-2)] bg-paper-2/30 px-3 py-2"
              >
                <Avatar
                  name={c.ownerName}
                  email={c.ownerEmail}
                  color={c.ownerColor}
                  size="sm"
                />
                <div className="flex-1 min-w-0 text-[13px]">
                  <p className="text-ink">{c.ownerName}</p>
                  {isOwn ? (
                    <p className="text-[12px] text-ink-3">Vous etes proprietaire</p>
                  ) : lent ? (
                    <p className="text-[12px] text-ink-3">Deja prete a quelqu'un d'autre</p>
                  ) : requested ? (
                    <p className="text-[12px] text-ink-3">Demande deja envoyee</p>
                  ) : null}
                </div>
                {succeeded ? (
                  <span className="inline-flex items-center gap-1 text-[12px] text-[color:var(--ok)]">
                    <Check size={14} />
                    Envoyee
                  </span>
                ) : (
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => requestLoan(c.id)}
                    disabled={disabled}
                  >
                    Demander
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
        {error ? <p className="mt-2 text-[12px] text-[color:var(--err)]">{error}</p> : null}
      </Modal>
    </>
  )
}
```

- [ ] **Step 3 : Commit**

```bash
git add components/books/LoanRequestButton.tsx
git commit -m "refactor(ui): LoanRequestButton supporte plusieurs owners (copies)"
```

### Task 6.4 : Refondre `BookCard.tsx`

**Files:**
- Modify: `components/books/BookCard.tsx`

- [ ] **Step 1 : Lire le fichier actuel pour identifier la signature et les badges**

```bash
cat components/books/BookCard.tsx
```

- [ ] **Step 2 : Adapter `BookCard` au nouveau type `BookListed`**

Remplace les références à `book.format`/`book.type` par les helpers `digitalFormats(book)` et `physicalCount(book)` importés depuis `@/lib/books`. Les badges affichent : un par format digital, plus un "Physique" / "Physique × N" si physique présent.

Skeleton à adopter (à intégrer dans le composant existant en gardant le layout) :

```typescript
import { digitalFormats, physicalCount, type BookListed } from "@/lib/books"

// dans le composant :
const formats = digitalFormats(book)
const physicals = physicalCount(book)

// Dans le JSX, remplacer la zone de badges actuelle par :
<div className="flex flex-wrap gap-1">
  {formats.map((f) => (
    <span
      key={f}
      className="rounded-full bg-accent-soft px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-[#5a4711]"
    >
      {f}
    </span>
  ))}
  {physicals > 0 ? (
    <span className="rounded-full bg-[rgba(168,106,31,0.14)] px-2 py-0.5 text-[10px] text-[color:var(--warn)]">
      {physicals === 1 ? "Physique" : `Physique × ${physicals}`}
    </span>
  ) : null}
</div>
```

Adapter le type des props pour accepter `BookListed` (qui a `copies`).

- [ ] **Step 3 : Commit**

```bash
git add components/books/BookCard.tsx
git commit -m "refactor(ui): BookCard badges multi-formats via copies"
```

### Task 6.5 : Refondre `BookList.tsx`

**Files:**
- Modify: `components/books/BookList.tsx`

- [ ] **Step 1 : Lire le fichier actuel**

```bash
cat components/books/BookList.tsx
```

- [ ] **Step 2 : Remplacer la colonne "Format" par "Formats"**

Pour chaque ligne : rendre les formats digitaux (concaténés `EPUB · PDF`) puis si physique présent, ajouter `· Physique` ou `· Physique × N`.

Skeleton :

```typescript
import { digitalFormats, physicalCount, type BookListed } from "@/lib/books"

function FormatsCell({ book }: { book: BookListed }) {
  const formats = digitalFormats(book)
  const physicals = physicalCount(book)
  const parts: string[] = [...formats]
  if (physicals > 0) parts.push(physicals === 1 ? "Physique" : `Physique × ${physicals}`)
  if (parts.length === 0) return <span className="text-ink-4">—</span>
  return <span className="font-mono text-[12px] uppercase tracking-widest text-ink-2">{parts.join(" · ")}</span>
}
```

Remplacer la cellule actuelle par `<FormatsCell book={book} />`.

- [ ] **Step 3 : Commit**

```bash
git add components/books/BookList.tsx
git commit -m "refactor(ui): BookList colonne Formats via copies"
```

### Task 6.6 : Refondre `EditBookForm.tsx`

**Files:**
- Modify: `components/books/EditBookForm.tsx`

- [ ] **Step 1 : Lire le fichier actuel**

```bash
cat components/books/EditBookForm.tsx
```

- [ ] **Step 2 : Retirer toute référence à `format`, `fileSize`, `type`, `filePath`**

L'édition concerne désormais uniquement les métadonnées de l'œuvre. Si le formulaire actuel contient des champs `format`/`fileSize`, les supprimer (ils vivent sur les copies, pas le Book).

- [ ] **Step 3 : Commit**

```bash
git add components/books/EditBookForm.tsx
git commit -m "refactor(ui): EditBookForm retire les champs format/filePath (vivent sur Copy)"
```

### Task 6.7 : Supprimer `DeleteBookButton.tsx`

**Files:**
- Delete: `components/books/DeleteBookButton.tsx`

La suppression est désormais portée par `CopyList` (suppression de copie). Le bouton "supprimer le Book" complet n'a plus de sens côté user (réservé admin via SQL ou API directe).

- [ ] **Step 1 : Vérifier qu'aucun import ne référence ce fichier**

```bash
grep -r "DeleteBookButton" --include='*.tsx' --include='*.ts'
```

Si toutes les références ont été retirées par les tâches précédentes (BookDetail notamment), on peut supprimer le fichier. Sinon, retirer les imports résiduels.

- [ ] **Step 2 : Supprimer le fichier et commit**

```bash
git rm components/books/DeleteBookButton.tsx
git commit -m "refactor(ui): supprime DeleteBookButton (remplace par DeleteCopy dans CopyList)"
```

---

## Phase 7 — Pages annexes

### Task 7.1 : Adapter `/mes-livres`

**Files:**
- Modify: `app/(app)/mes-livres/page.tsx`

- [ ] **Step 1 : Lire le fichier actuel**

```bash
cat "app/(app)/mes-livres/page.tsx"
```

- [ ] **Step 2 : Remplacer le filtre `addedById = me` ou `ownerId = me` (ancien Book) par un filtre via copies**

Pattern :

```typescript
const books = await db.book.findMany({
  where: { copies: { some: { addedById: session.user.id } } },
  orderBy: { addedAt: "desc" },
  select: PUBLIC_BOOK_SELECT
})
```

Adapter le rendu (BookGrid attend désormais `BookListed[]` avec `copies[]`).

- [ ] **Step 3 : Commit**

```bash
git add "app/(app)/mes-livres/page.tsx"
git commit -m "refactor(pages): /mes-livres filtre via copies.some(addedById)"
```

### Task 7.2 : Adapter `/pret`

**Files:**
- Modify: `app/(app)/pret/page.tsx`

- [ ] **Step 1 : Lire le fichier actuel**

```bash
cat "app/(app)/pret/page.tsx"
```

- [ ] **Step 2 : Remplacer toute référence à `loan.book` par `loan.copy.book` (titre, cover, lien fiche)**

Le shape API renvoie maintenant `loan.copy.book.{id,title,author,coverUrl}` (cf. Task 4.1 sur loanSelect). Adapter les composants enfants en conséquence.

- [ ] **Step 3 : Commit**

```bash
git add "app/(app)/pret/page.tsx"
git commit -m "refactor(pages): /pret traverse copy.book"
```

### Task 7.3 : Adapter `/bibliotheque` (toolbar + grid)

**Files:**
- Modify: `app/(app)/bibliotheque/page.tsx`
- Modify: `components/books/BibliothequeToolbar.tsx` si nécessaire

- [ ] **Step 1 : Lire les deux fichiers**

```bash
cat "app/(app)/bibliotheque/page.tsx"
cat components/books/BibliothequeToolbar.tsx
```

- [ ] **Step 2 : Vérifier que la page passe `BookListed[]` à `BookGrid`/`BookList`**

Le `GET /api/books` retourne déjà le bon shape (Task 3.2). Si la page de catalogue charge directement via Prisma plutôt que via l'API, utiliser `PUBLIC_BOOK_SELECT` du nouveau `lib/books.ts`.

- [ ] **Step 3 : Vérifier que la toolbar passe les filtres (`type`, `format`) au format attendu**

Les params restent identiques (`?type=DIGITAL`, `?format=EPUB`), mais la sémantique côté API a changé (`copies.some(...)`). Aucun changement à faire côté toolbar à priori.

- [ ] **Step 4 : Commit (si modifications)**

```bash
git add "app/(app)/bibliotheque/page.tsx" components/books/BibliothequeToolbar.tsx
git commit -m "refactor(pages): /bibliotheque consomme le shape copies"
```

---

## Phase 8 — Compilation, smoke E2E, doc

### Task 8.1 : Compilation TypeScript propre

**Files:** aucun (vérification).

- [ ] **Step 1 : Build TS strict**

```bash
npx tsc --noEmit
```

Expected : zéro erreur. Si erreurs résiduelles : les corriger en référence aux tâches précédentes (oubli d'un import, signature de prop manquante).

- [ ] **Step 2 : Build Next**

```bash
npm run build
```

Expected : build OK.

- [ ] **Step 3 : Commit (si fix en cascade)**

```bash
git add -A
git commit -m "chore: fixs compilation V1.3 (cascade)"
```

### Task 8.2 : Smoke E2E manuel

**Files:** aucun (test manuel).

- [ ] **Step 1 : Démarrer la stack**

```bash
docker compose up -d
npm run dev
```

- [ ] **Step 2 : Login admin**

```bash
npx tsx scripts/dev-magic-link.ts
```

Coller l'URL imprimée dans le navigateur.

- [ ] **Step 3 : Dérouler les 15 scénarios listés en spec section 8**

Pour chaque scénario, vérifier le comportement attendu et noter PASS/FAIL.

```
1.  Upload digital nouveau Book                                   → fiche créée
2.  Upload digital sur Book existant via match ISBN               → auto-merge silencieux + toast
3.  Upload digital match slug → modale → Fusionner                → copie ajoutée
4.  Upload digital match slug → modale → Fiche distincte          → 2 Books distincts
5.  Upload digital avec format déjà présent                       → 409 propre
6.  Ajout physique sur Book digital existant                      → fusion via match
7.  Ajout physique alors que l'user a déjà sa copie physique      → 409 propre
8.  Téléchargement par format depuis BookDetail                   → fichier servi
9.  Demande de prêt avec un seul owner physique                   → modal -> 1 ligne -> demande envoyée
10. Demande de prêt avec 2 owners physiques                       → modal de choix
11. Suppression d'une copie digitale                              → fichier supprimé du disque
12. Suppression d'une copie physique avec loan PENDING            → 409 propre
13. Suppression de la dernière copie d'un Book                    → Book + Readings supprimés
14. Edit métadonnées Book par un user qui a une copie             → OK
15. Edit métadonnées Book par un user sans copie                  → 403
```

- [ ] **Step 4 : Si tout PASS, créer un dev `scripts/dev-magic-link.ts` deuxième user pour les tests multi-utilisateur**

```bash
npx tsx scripts/dev-magic-link.ts alice@test.fr
npx tsx scripts/dev-magic-link.ts bob@test.fr
```

Tester scénarios 9, 10, 12, 14, 15 avec ces comptes.

### Task 8.3 : Mettre à jour `PROGRESS.md`

**Files:**
- Modify: `PROGRESS.md`

- [ ] **Step 1 : Ajouter une ligne dans le tableau "Versions livrées" et adapter "Reste à faire"**

Ouvrir `PROGRESS.md` et :

1. Dans le tableau, ajouter une nouvelle ligne :

```
| V1.3 | <commit-sha> | Refactor Book + BookCopy : multi-formats par fiche, dédup à l'ajout (ISBN/slug), modale fusion, blocage conflit format/owner |
```

2. Dans la section "Reste à faire", supprimer le bloc "À arbitrer avec le user" (les questions sont résolues).

3. Adapter la section "Modèle de données" pour refléter le nouveau schéma : "Conforme à `CLAUDE.md` section 4 + spec V1.3 (`docs/superpowers/specs/2026-05-06-doublons-multiformats-design.md`)".

- [ ] **Step 2 : Commit**

```bash
git add PROGRESS.md
git commit -m "docs(progress): V1.3 livree (refactor Book + BookCopy)"
```

### Task 8.4 : Push et préparer la PR (ou merge direct)

**Files:** aucun (opération git/GitHub).

- [ ] **Step 1 : Push**

```bash
git push -u origin feat/v1-3-book-copies
```

- [ ] **Step 2 : Demander au user comment il veut intégrer**

Sortie attendue : message au user lui demandant son choix (PR sur GitHub ? merge direct dans `main` ? squash ?). Cette tâche n'execute aucun merge automatique — elle attend l'instruction explicite du user.

---

## Self-Review (faite au moment de l'écriture du plan)

**Spec coverage :**
- Section 1 (modèle de données) → Tasks 1.1, 1.2 ✅
- Section 2 (détection des doublons) → Tasks 2.1, 3.1 ✅
- Section 3 (flow UI ajout) → Tasks 5.1, 5.2, 5.3 ✅
- Section 4 (impacts API) → Tasks 3.1–3.6, 4.1–4.3 ✅
- Section 5 (impacts UI) → Tasks 6.1–6.7 ✅
- Section 6 (permissions) → distribuées dans Tasks 3.4, 3.5 et 6.1 ✅
- Section 7 (suppression et orphelinage) → Task 3.4 ✅
- Section 8 (smoke test) → Task 8.2 ✅
- Section 9 (hors scope) → respecté (rien d'ajouté) ✅
- Section 10 (DB reset) → Tasks 0.2, 1.2 ✅

**Placeholder scan :** aucun TBD/TODO. Tous les codes sont complets.

**Type consistency :**
- `BookListed`, `BookDetailDTO`, `CopyDTO` définis en Task 2.2 et utilisés cohéremment partout
- `computeMatchKey`, `findMatchingBook` définis en Task 2.1 et appelés en Tasks 2.2, 3.1, 3.2, 3.5
- `digitalFormats`, `physicalCount` définis en Task 2.2 et utilisés en Tasks 5.1, 6.2, 6.4, 6.5
- `LoanRequestButton.copies: CopyForLoan[]` défini en Task 6.3, propagé depuis `BookDetail` en Task 6.2
- `Loan.copy` traversal cohérent dans Tasks 4.1, 4.2, 4.3, 7.2

Aucune incohérence de signature détectée.
