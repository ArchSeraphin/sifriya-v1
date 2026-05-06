# Bulk Upload V1.4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre a un admin d'importer 100+ livres numeriques (EPUB/PDF) en une session, avec auto-matching haute confiance et review en lot des cas ambigus.

**Architecture:** Page admin dediee. Drag&drop dossier -> upload concurrent (3 simultanes) -> processing async par item (extraction + scoring) -> tableau de review filtrable -> commit partiel autorise. Session persistee en DB pour reprise apres crash.

**Tech Stack:** Next.js 16 App Router, Prisma 7, PostgreSQL, next-auth v4, Tailwind v4, Zod 4, lucide-react. Nouvelles deps : `jszip`, `pdf-parse`, `fast-levenshtein`.

**Spec:** `docs/superpowers/specs/2026-05-06-bulk-upload-design.md`

**Branche:** `feat/bulk-upload` (interdiction de pousser sur `main` — auto-deploy Coolify).

---

## Conventions du projet (rappel pour l'engineer)

- Pas de framework de tests (jest/vitest). Les tests = smoke scripts dans `scripts/*-smoke.ts` lances via `npx tsx`. Verifier le typecheck avec `npm run typecheck` et lint avec `npm run lint`.
- Commits frequents, messages en francais, format conventionnel (`feat(api):`, `fix(ui):`, `refactor(lib):`).
- DB locale en dev : Postgres Docker port **5433**. Login sans SMTP via `npx tsx scripts/dev-magic-link.ts <email>`.
- Aucun emoji dans l'UI. Icones : Lucide React uniquement.
- Couleurs : tokens CSS (`var(--accent)`, `var(--warn)`, etc.), zero hex hardcode.
- TypeScript strict. Aucun `any`.
- Toute payload API validee cote serveur via Zod.
- Toute route API admin verifie `session.user.role === "ADMIN"` (pattern existant `app/api/admin/invites/route.ts:14-18`).
- Avant chaque commit majeur : `npm run typecheck && npm run lint`.

---

## Task 0: Setup branche

**Files:** N/A (operation git)

- [ ] **Step 1: Creer la branche de travail**

```bash
git checkout -b feat/bulk-upload
git status
```

Expected: `On branch feat/bulk-upload`, working tree clean (sauf modifs non commitees existantes).

- [ ] **Step 2: Verifier l'etat de la DB locale**

```bash
docker ps | grep postgres
npm run prisma:generate
```

Expected: container postgres up sur port 5433, prisma client genere sans erreur.

---

## Task 1: Schema Prisma + migration

**Files:**
- Modify: `prisma/schema.prisma` (ajout 2 modeles + 3 enums + 2 backref)

- [ ] **Step 1: Ajouter les enums et modeles a la fin de `prisma/schema.prisma`**

Coller a la fin du fichier (apres le dernier `model`/`enum`) :

```prisma
model BulkImportSession {
  id          String   @id @default(cuid())
  ownerId     String
  owner       User     @relation(fields: [ownerId], references: [id])
  status      BulkImportSessionStatus @default(IN_PROGRESS)
  totalFiles  Int      @default(0)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  committedAt DateTime?
  items       BulkImportItem[]

  @@index([ownerId, status])
}

enum BulkImportSessionStatus {
  IN_PROGRESS
  COMMITTED
  ABANDONED
}

model BulkImportItem {
  id              String   @id @default(cuid())
  sessionId       String
  session         BulkImportSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  filename        String
  format          FileFormat
  fileSize        Int
  uploadId        String?

  status          BulkImportItemStatus @default(PENDING)
  extractedTitle  String?
  extractedAuthor String?
  extractedIsbn   String?
  candidatesJson  Json?
  chosenCandidate Json?
  mergeIntoBookId String?
  mergeIntoBook   Book?    @relation("BulkImportMergeTarget", fields: [mergeIntoBookId], references: [id])

  decision        BulkImportDecision @default(NONE)
  errorMessage    String?
  committedBookId String?
  committedCopyId String?

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([sessionId, status])
}

enum BulkImportItemStatus {
  PENDING
  PROCESSING
  AUTO_OK
  TO_REVIEW
  MANUAL
  DUPLICATE
  ERROR
}

enum BulkImportDecision {
  NONE
  CREATE
  MERGE
  SKIP
}
```

- [ ] **Step 2: Ajouter les backrefs sur User et Book**

Dans le bloc `model User { ... }`, ajouter avant l'accolade fermante :

```prisma
  bulkImportSessions BulkImportSession[]
```

Dans le bloc `model Book { ... }`, ajouter avant l'accolade fermante (apres `readings`) :

```prisma
  bulkImportItems BulkImportItem[] @relation("BulkImportMergeTarget")
```

- [ ] **Step 3: Generer la migration**

```bash
npm run prisma:migrate -- --name add_bulk_import
```

Expected: migration creee dans `prisma/migrations/<timestamp>_add_bulk_import/migration.sql`, prisma client regenere automatiquement.

- [ ] **Step 4: Verifier le typecheck**

```bash
npm run typecheck
```

Expected: aucune erreur.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(db): bulk import session + item models"
```

---

## Task 2: Dependances + constantes de limites

**Files:**
- Modify: `package.json` (deps)
- Create: `lib/bulk-import-limits.ts`

- [ ] **Step 1: Ajouter les dependances npm**

```bash
npm install jszip pdf-parse fast-levenshtein
npm install -D @types/pdf-parse @types/fast-levenshtein
```

Expected: `package.json` et `package-lock.json` modifies, `node_modules/` mis a jour. (`jszip` a ses propres types embarques, pas besoin de `@types/jszip`.)

- [ ] **Step 2: Creer `lib/bulk-import-limits.ts`**

```typescript
// lib/bulk-import-limits.ts
// =====================================================================
// Sifriya — limites et constantes du bulk import
// V1.5+ : MAX_FILES_USER ajoutera un cap pour les non-admin (10-20).
// =====================================================================

export const MAX_FILES_ADMIN = 500
export const WARN_FILES_ADMIN = 200

// Concurrence d'upload cote client (evite de saturer le reseau)
export const CONCURRENT_UPLOADS = 3

// Throttle entre 2 calls API metadata (evite de hammer Google Books)
export const METADATA_CALL_DELAY_MS = 100

// Polling client de l'etat de la session (ms)
export const SESSION_POLL_INTERVAL_MS = 3000

// Cleanup
export const SESSION_ABANDON_AFTER_DAYS = 7
export const SESSION_PURGE_AFTER_DAYS = 30
```

- [ ] **Step 3: Verifier le typecheck et le lint**

```bash
npm run typecheck && npm run lint
```

Expected: aucune erreur.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json lib/bulk-import-limits.ts
git commit -m "feat(deps): jszip, pdf-parse, fast-levenshtein + bulk limits"
```

---

## Task 3: Helper requireAdmin + refacto lib/books.ts

**Files:**
- Modify: `lib/auth.ts` (ajout helper `requireAdmin`)
- Modify: `lib/books.ts` (extraction `createBookWithCopy`, `addCopyToBook`)
- Modify: `app/api/books/route.ts` (utilise les helpers de lib/books.ts)
- Modify: `app/api/books/[id]/copies/route.ts` (utilise les helpers)
- Modify: `app/api/admin/invites/route.ts` (utilise requireAdmin)
- Modify: `app/api/admin/users/[id]/route.ts` (utilise requireAdmin)

- [ ] **Step 1: Ajouter `requireAdmin` dans `lib/auth.ts`**

A la fin de `lib/auth.ts`, exporter :

```typescript
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"

// Helper pour les routes admin. Renvoie une Response 401/403 si non autorise,
// sinon la session avec userId garanti.
export async function requireAdmin(): Promise<
  | { ok: true; userId: string; email: string }
  | { ok: false; response: NextResponse }
> {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return { ok: false, response: NextResponse.json({ error: "Non authentifie." }, { status: 401 }) }
  }
  if (session.user.role !== "ADMIN") {
    return { ok: false, response: NextResponse.json({ error: "Acces refuse." }, { status: 403 }) }
  }
  return { ok: true, userId: session.user.id, email: session.user.email ?? "" }
}
```

(Note: si `lib/auth.ts` n'importe pas deja `NextResponse` ou `getServerSession`, ajouter les imports en haut de fichier.)

- [ ] **Step 2: Migrer `app/api/admin/invites/route.ts` et `app/api/admin/users/[id]/route.ts` vers `requireAdmin`**

Remplacer le bloc :

```typescript
const session = await getServerSession(authOptions)
if (!session?.user || session.user.role !== "ADMIN") {
  return NextResponse.json({ error: "Acces refuse." }, { status: 403 })
}
```

Par :

```typescript
const auth = await requireAdmin()
if (!auth.ok) return auth.response
// Si besoin de l'userId admin : auth.userId
```

Adapter les imports en haut de chaque fichier.

- [ ] **Step 3: Extraire `createBookWithCopy` et `addCopyToBook` dans `lib/books.ts`**

A la fin de `lib/books.ts`, ajouter :

```typescript
import { db } from "@/lib/db"
import { commitPending } from "@/lib/storage"
import { computeMatchKey, normalizeIsbn } from "@/lib/match"
import type { FileFormat, CopyType, Prisma } from "@prisma/client"

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
```

- [ ] **Step 4: Refactorer `app/api/books/route.ts` pour utiliser `createBookWithCopy`**

Remplacer toute la logique de creation (apres validation Zod) dans `POST` par un appel a `createBookWithCopy`. Conserver la logique de gestion d'erreur unique violation (P2002 → 409 avec `conflictBookId`).

Pseudo-code de la version refactorisee :

```typescript
try {
  const { bookId } = await createBookWithCopy(
    {
      title: data.title,
      author: data.author ?? null,
      isbn: data.isbn ?? null,
      description: data.description ?? null,
      genre: data.genre ?? null,
      year: data.year ?? null,
      publisher: data.publisher ?? null,
      language: data.language ?? null,
      coverUrl: data.coverUrl ?? null,
      sourceApi: data.sourceApi ?? null,
      externalId: data.externalId ?? null
    },
    data.copyType === "DIGITAL"
      ? { type: "DIGITAL", uploadId: data.uploadId, format: data.format, fileSize: data.fileSize }
      : { type: "PHYSICAL" },
    session.user.id
  )
  const book = await db.book.findUnique({ where: { id: bookId }, select: PUBLIC_BOOK_SELECT })
  return NextResponse.json({ book }, { status: 201 })
} catch (err) {
  logger.error("create book failed", { err: String(err) })
  if (isUniqueViolation(err)) return await isbnConflictResponse(normalizeIsbn(data.isbn))
  return NextResponse.json({ error: "Impossible d'enregistrer le livre." }, { status: 500 })
}
```

Garder les helpers `isUniqueViolation` et `isbnConflictResponse` en bas de fichier — ils sont specifiques a la route HTTP.

- [ ] **Step 5: Refactorer `app/api/books/[id]/copies/route.ts` pour utiliser `addCopyToBook`**

Lire le fichier d'abord pour voir sa structure actuelle (`Read app/api/books/[id]/copies/route.ts`), puis remplacer la logique de creation de copy par un appel a `addCopyToBook`.

- [ ] **Step 6: Verifier typecheck + lint + smoke**

```bash
npm run typecheck && npm run lint
npx tsx scripts/match-smoke.ts
```

Expected: tout passe.

- [ ] **Step 7: Test manuel (fait par l'engineer en QA)**

Demarrer le serveur : `npm run dev`. Login admin via `npx tsx scripts/dev-magic-link.ts <admin@email>`.

Verifier que l'upload single d'un EPUB fonctionne toujours via `/bibliotheque` -> "Ajouter un Livre" -> "Numerique" -> drop fichier -> sauver. Verifier qu'aucune regression n'est apparue.

- [ ] **Step 8: Commit**

```bash
git add lib/auth.ts lib/books.ts app/api/books/route.ts app/api/books/[id]/copies/route.ts app/api/admin/invites/route.ts app/api/admin/users/[id]/route.ts
git commit -m "refactor(api): extract createBookWithCopy + addCopyToBook + requireAdmin helper"
```

---

## Task 4: Extraction metadata EPUB + PDF

**Files:**
- Modify: `lib/metadata.ts` (ajout `extractFromEpub`, `extractFromPdf`, type `ExtractedMetadata`)
- Create: `scripts/fixtures/bulk-import/.gitkeep` (dossier pour fichiers de test)
- Create: `scripts/extract-smoke.ts` (smoke test)
- Modify: `.gitignore` (ignorer fichiers fixtures sauf .gitkeep)

- [ ] **Step 1: Ajouter le type et les fonctions d'extraction dans `lib/metadata.ts`**

A la fin de `lib/metadata.ts`, ajouter :

```typescript
import JSZip from "jszip"
import { XMLParser } from "fast-xml-parser"
// pdf-parse n'a pas d'export ESM propre, on utilise require dynamique pour eviter les soucis avec Next bundler
// (le Route Handler ou le script qui appelle extractFromPdf doit tourner en runtime nodejs)

export type ExtractedMetadata = {
  title: string | null
  author: string | null
  isbn: string | null
  language: string | null
}

const EMPTY_META: ExtractedMetadata = { title: null, author: null, isbn: null, language: null }

// Extrait le titre/auteur/ISBN d'un EPUB en lisant le content.opf interne.
export async function extractFromEpub(buffer: Buffer): Promise<ExtractedMetadata> {
  try {
    const zip = await JSZip.loadAsync(buffer)
    // Trouver le content.opf via container.xml
    const containerXml = await zip.file("META-INF/container.xml")?.async("string")
    if (!containerXml) return EMPTY_META

    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" })
    const container = parser.parse(containerXml) as {
      container?: { rootfiles?: { rootfile?: { "@_full-path"?: string } } }
    }
    const opfPath = container.container?.rootfiles?.rootfile?.["@_full-path"]
    if (!opfPath) return EMPTY_META

    const opfXml = await zip.file(opfPath)?.async("string")
    if (!opfXml) return EMPTY_META

    const opf = parser.parse(opfXml) as {
      package?: {
        metadata?: Record<string, unknown>
      }
    }
    const md = opf.package?.metadata
    if (!md) return EMPTY_META

    return {
      title: pickString(md, "dc:title"),
      author: pickString(md, "dc:creator"),
      isbn: pickIsbn(md),
      language: pickString(md, "dc:language")
    }
  } catch {
    return EMPTY_META
  }
}

function pickString(md: Record<string, unknown>, key: string): string | null {
  const raw = md[key]
  if (!raw) return null
  if (typeof raw === "string") return raw.trim() || null
  if (typeof raw === "object" && raw !== null) {
    // forme { "#text": "...", "@_..." } ou tableau
    if (Array.isArray(raw)) return pickString({ [key]: raw[0] }, key)
    const text = (raw as Record<string, unknown>)["#text"]
    if (typeof text === "string") return text.trim() || null
  }
  return null
}

function pickIsbn(md: Record<string, unknown>): string | null {
  const ids = md["dc:identifier"]
  if (!ids) return null
  const list = Array.isArray(ids) ? ids : [ids]
  for (const entry of list) {
    if (typeof entry === "string") {
      const cleaned = entry.replace(/[^0-9X]/gi, "")
      if (cleaned.length === 10 || cleaned.length === 13) return cleaned.toUpperCase()
    } else if (typeof entry === "object" && entry !== null) {
      const text = (entry as Record<string, unknown>)["#text"]
      if (typeof text === "string") {
        const cleaned = text.replace(/[^0-9X]/gi, "")
        if (cleaned.length === 10 || cleaned.length === 13) return cleaned.toUpperCase()
      }
    }
  }
  return null
}

// Extrait le titre/auteur d'un PDF via pdf-parse (`pdf.info`).
// L'ISBN est rarement embarque dans un PDF, on le laisse a null.
export async function extractFromPdf(buffer: Buffer): Promise<ExtractedMetadata> {
  try {
    const pdfParse = (await import("pdf-parse")).default as (b: Buffer) => Promise<{ info?: Record<string, unknown> }>
    const result = await pdfParse(buffer)
    const info = result.info ?? {}
    const title = typeof info.Title === "string" ? info.Title.trim() : null
    const author = typeof info.Author === "string" ? info.Author.trim() : null
    return {
      title: title && !looksJunk(title) ? title : null,
      author: author && !looksJunk(author) ? author : null,
      isbn: null,
      language: null
    }
  } catch {
    return EMPTY_META
  }
}

// Heuristique : on rejette les titres pourris classiques de PDF.
function looksJunk(s: string): boolean {
  const lower = s.toLowerCase()
  return (
    lower.startsWith("microsoft word") ||
    lower.startsWith("untitled") ||
    lower.endsWith(".docx") ||
    lower.endsWith(".doc") ||
    lower.endsWith(".pdf") ||
    /^[a-z0-9_-]+\.(docx|doc|pdf)$/i.test(s)
  )
}
```

- [ ] **Step 2: Creer le dossier de fixtures et son .gitkeep**

```bash
mkdir -p scripts/fixtures/bulk-import
touch scripts/fixtures/bulk-import/.gitkeep
```

Ajouter dans `.gitignore` (avant la ligne `# docker`) :

```
# fixtures de test bulk-import (deposer en local, ne pas committer)
/scripts/fixtures/bulk-import/*
!/scripts/fixtures/bulk-import/.gitkeep
```

- [ ] **Step 3: Ecrire le smoke test `scripts/extract-smoke.ts`**

```typescript
// scripts/extract-smoke.ts
// Run avec : npx tsx scripts/extract-smoke.ts
// Necessite que l'engineer ait depose AU MOINS 1 EPUB et 1 PDF dans
// scripts/fixtures/bulk-import/ (gitignored).

import { readFileSync, readdirSync } from "fs"
import { join, extname } from "path"
import { extractFromEpub, extractFromPdf } from "../lib/metadata"

const FIXTURES = "scripts/fixtures/bulk-import"

async function main() {
  let files: string[] = []
  try {
    files = readdirSync(FIXTURES).filter((f) => /\.(epub|pdf)$/i.test(f))
  } catch {
    console.log(`Dossier ${FIXTURES} introuvable. Skip.`)
    return
  }
  if (files.length === 0) {
    console.log(`Aucun fichier .epub/.pdf dans ${FIXTURES}. Skip.`)
    return
  }
  for (const f of files) {
    const buf = readFileSync(join(FIXTURES, f))
    const ext = extname(f).toLowerCase()
    const meta =
      ext === ".epub" ? await extractFromEpub(buf) : await extractFromPdf(buf)
    console.log(`-- ${f} --`)
    console.log(`   title : ${meta.title ?? "<null>"}`)
    console.log(`   author: ${meta.author ?? "<null>"}`)
    console.log(`   isbn  : ${meta.isbn ?? "<null>"}`)
    console.log(`   lang  : ${meta.language ?? "<null>"}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
```

- [ ] **Step 4: Test manuel — l'engineer depose 2-3 fichiers de test puis lance le smoke**

```bash
# L'engineer copie 1 EPUB + 1 PDF + 1 PDF "pourri" dans scripts/fixtures/bulk-import/
npx tsx scripts/extract-smoke.ts
```

Expected: pour l'EPUB, titre/auteur extraits correctement. Pour le PDF clean, titre/auteur extraits. Pour le PDF pourri, titre = `<null>` (filtre par `looksJunk`).

- [ ] **Step 5: Verifier typecheck + lint**

```bash
npm run typecheck && npm run lint
```

- [ ] **Step 6: Commit**

```bash
git add lib/metadata.ts scripts/extract-smoke.ts .gitignore scripts/fixtures/bulk-import/.gitkeep
git commit -m "feat(metadata): extract EPUB + PDF embedded metadata"
```

---

## Task 5: Logique de scoring + smoke test

**Files:**
- Create: `lib/bulk-import-scoring.ts`
- Create: `scripts/scoring-smoke.ts`

- [ ] **Step 1: Ecrire `lib/bulk-import-scoring.ts`**

```typescript
// lib/bulk-import-scoring.ts
// =====================================================================
// Sifriya — scoring des candidats bulk import
// Decide si un item passe en AUTO_OK (decision pre-remplie) ou en
// TO_REVIEW / DUPLICATE / MANUAL (decision admin requise).
// =====================================================================

import levenshtein from "fast-levenshtein"
import type { BookMetadata } from "@/lib/metadata"
import type { BookMatch } from "@/lib/match"
import type { ExtractedMetadata } from "@/lib/metadata"

export type ScoringStatus = "AUTO_OK" | "TO_REVIEW" | "MANUAL" | "DUPLICATE"

export type ScoringResult = {
  status: ScoringStatus
  chosenCandidate: BookMetadata | null
  mergeIntoBookId: string | null
}

// Normalisation pour le scoring (lowercase, sans diacritiques, espaces nets)
function norm(s: string | null | undefined): string {
  if (!s) return ""
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

// Similarite normalisee : 1 = identique, 0 = totalement different.
function similarity(a: string, b: string): number {
  const A = norm(a)
  const B = norm(b)
  if (!A || !B) return 0
  const max = Math.max(A.length, B.length)
  if (max === 0) return 1
  const dist = levenshtein.get(A, B)
  return 1 - dist / max
}

export function scoreCandidates(input: {
  extracted: ExtractedMetadata
  candidates: BookMetadata[]
  existingMatch: BookMatch | null
}): ScoringResult {
  const { extracted, candidates, existingMatch } = input

  // 1) Doublon avec biblio existante (priorite absolue)
  if (existingMatch) {
    const matchedCandidate =
      candidates.find((c) => c.isbn && extracted.isbn && c.isbn === extracted.isbn) ??
      candidates[0] ??
      null
    return {
      status: "DUPLICATE",
      chosenCandidate: matchedCandidate,
      mergeIntoBookId: existingMatch.bookId
    }
  }

  // 2) Match ISBN strict avec un candidat API
  if (extracted.isbn) {
    const isbnHit = candidates.find((c) => c.isbn === extracted.isbn)
    if (isbnHit) {
      return { status: "AUTO_OK", chosenCandidate: isbnHit, mergeIntoBookId: null }
    }
  }

  // 3) Match titre+auteur unique fort
  if (extracted.title && candidates.length > 0) {
    const scored = candidates
      .map((c) => ({
        c,
        titleScore: similarity(extracted.title!, c.title),
        authorScore:
          extracted.author && c.author ? similarity(extracted.author, c.author) : 0
      }))
      .sort((a, b) => b.titleScore + b.authorScore - (a.titleScore + a.authorScore))

    const top = scored[0]
    const others = scored.slice(1, 3)
    const topStrong =
      top.titleScore >= 0.85 &&
      top.authorScore >= 0.85
    const noOtherCloseEnough = others.every((o) => o.titleScore < 0.7)

    if (topStrong && noOtherCloseEnough) {
      return { status: "AUTO_OK", chosenCandidate: top.c, mergeIntoBookId: null }
    }
  }

  // 4) Au moins un candidat -> review manuel
  if (candidates.length > 0) {
    return { status: "TO_REVIEW", chosenCandidate: null, mergeIntoBookId: null }
  }

  // 5) Rien du tout -> saisie manuelle
  return { status: "MANUAL", chosenCandidate: null, mergeIntoBookId: null }
}
```

- [ ] **Step 2: Ecrire le smoke test `scripts/scoring-smoke.ts`**

```typescript
// scripts/scoring-smoke.ts
// Run avec : npx tsx scripts/scoring-smoke.ts
// Verifie le scoring sur une matrice de cas types.

import { scoreCandidates } from "../lib/bulk-import-scoring"
import type { BookMetadata } from "../lib/metadata"

const cand = (overrides: Partial<BookMetadata>): BookMetadata => ({
  source: "google_books",
  externalId: "x",
  title: "Test",
  author: null,
  isbn: null,
  year: null,
  publisher: null,
  language: null,
  coverUrl: null,
  description: null,
  genre: null,
  ...overrides
})

type Case = { label: string; expect: string; got: string }

const cases: Case[] = []

function run(label: string, expect: string, gotStatus: string) {
  const ok = expect === gotStatus
  cases.push({ label, expect, got: gotStatus })
  console.log(`${ok ? "OK" : "FAIL"}  ${label} (expect ${expect}, got ${gotStatus})`)
}

// 1. Doublon ISBN biblio
run(
  "doublon ISBN biblio",
  "DUPLICATE",
  scoreCandidates({
    extracted: { title: "X", author: null, isbn: "9782070408469", language: null },
    candidates: [cand({ isbn: "9782070408469", title: "X" })],
    existingMatch: { bookId: "book1", confidence: "high" }
  }).status
)

// 2. ISBN strict avec candidat API
run(
  "ISBN strict candidat API",
  "AUTO_OK",
  scoreCandidates({
    extracted: { title: "Candide", author: "Voltaire", isbn: "9782070408469", language: "fr" },
    candidates: [cand({ isbn: "9782070408469", title: "Candide", author: "Voltaire" })],
    existingMatch: null
  }).status
)

// 3. Titre+auteur unique fort
run(
  "titre auteur unique fort",
  "AUTO_OK",
  scoreCandidates({
    extracted: { title: "Le Comte de Monte-Cristo", author: "Alexandre Dumas", isbn: null, language: null },
    candidates: [cand({ title: "Le Comte de Monte-Cristo", author: "Alexandre Dumas" })],
    existingMatch: null
  }).status
)

// 4. Titre similaire mais 2 candidats proches -> TO_REVIEW
run(
  "deux candidats proches",
  "TO_REVIEW",
  scoreCandidates({
    extracted: { title: "Document Final", author: "Auteur Inconnu", isbn: null, language: null },
    candidates: [
      cand({ title: "Document Final", author: "Auteur A" }),
      cand({ title: "Document Final", author: "Auteur B" })
    ],
    existingMatch: null
  }).status
)

// 5. Aucun candidat
run(
  "aucun candidat",
  "MANUAL",
  scoreCandidates({
    extracted: { title: "scan-2018", author: null, isbn: null, language: null },
    candidates: [],
    existingMatch: null
  }).status
)

// 6. Auteur manquant -> jamais AUTO_OK via titre seul
run(
  "auteur manquant -> TO_REVIEW",
  "TO_REVIEW",
  scoreCandidates({
    extracted: { title: "Le Petit Prince", author: null, isbn: null, language: null },
    candidates: [cand({ title: "Le Petit Prince", author: "Saint-Exupery" })],
    existingMatch: null
  }).status
)

const failed = cases.filter((c) => c.expect !== c.got).length
process.exit(failed === 0 ? 0 : 1)
```

- [ ] **Step 3: Lancer le smoke test**

```bash
npx tsx scripts/scoring-smoke.ts
```

Expected: tous les cas en "OK".

- [ ] **Step 4: Verifier typecheck + lint**

```bash
npm run typecheck && npm run lint
```

- [ ] **Step 5: Commit**

```bash
git add lib/bulk-import-scoring.ts scripts/scoring-smoke.ts
git commit -m "feat(bulk): scoring engine + smoke matrix"
```

---

## Task 6: API — POST/DELETE session

**Files:**
- Create: `app/api/admin/bulk-imports/route.ts` (POST create session)
- Create: `app/api/admin/bulk-imports/[id]/route.ts` (DELETE abandon)

- [ ] **Step 1: `app/api/admin/bulk-imports/route.ts`**

```typescript
import { NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { requireAdmin } from "@/lib/auth"
import { MAX_FILES_ADMIN } from "@/lib/bulk-import-limits"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const Body = z.object({
  totalFiles: z.number().int().min(1).max(MAX_FILES_ADMIN)
})

export async function POST(req: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 })
  }

  const parsed = Body.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: `Maximum ${MAX_FILES_ADMIN} fichiers par session.`, issues: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const session = await db.bulkImportSession.create({
    data: {
      ownerId: auth.userId,
      totalFiles: parsed.data.totalFiles
    },
    select: { id: true }
  })

  return NextResponse.json({ sessionId: session.id }, { status: 201 })
}
```

- [ ] **Step 2: `app/api/admin/bulk-imports/[id]/route.ts`**

```typescript
import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAdmin } from "@/lib/auth"
import { deletePending } from "@/lib/storage"
import { logger } from "@/lib/logger"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// DELETE — abandonne la session : status = ABANDONED, purge des pending files non commits.
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const { id } = await ctx.params

  const session = await db.bulkImportSession.findUnique({
    where: { id },
    select: { id: true, ownerId: true, status: true, items: { select: { id: true, uploadId: true, committedCopyId: true } } }
  })
  if (!session) return NextResponse.json({ error: "Session introuvable." }, { status: 404 })
  if (session.ownerId !== auth.userId) return NextResponse.json({ error: "Acces refuse." }, { status: 403 })
  if (session.status === "COMMITTED") {
    return NextResponse.json({ error: "Session deja commitee, impossible d'abandonner." }, { status: 409 })
  }

  // Purger les pending files non commits
  for (const item of session.items) {
    if (item.uploadId && !item.committedCopyId) {
      await deletePending(item.uploadId).catch((err) => {
        logger.warn("delete pending failed", { itemId: item.id, err: String(err) })
      })
    }
  }

  await db.bulkImportSession.update({
    where: { id },
    data: { status: "ABANDONED" }
  })

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: Verifier que `deletePending` existe dans `lib/storage.ts`**

```bash
grep -n "deletePending\|export" lib/storage.ts | head -20
```

Si la fonction n'existe pas sous ce nom, la rechercher (`grep -rn "pending" lib/storage.ts`) et adapter le nom dans la route DELETE.

- [ ] **Step 4: Verifier typecheck + lint**

```bash
npm run typecheck && npm run lint
```

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/bulk-imports/
git commit -m "feat(api): create + abandon bulk import session"
```

---

## Task 7: API — upload single file dans une session

**Files:**
- Create: `app/api/admin/bulk-imports/[id]/upload/route.ts`

- [ ] **Step 1: Ecrire la route POST upload**

```typescript
import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAdmin } from "@/lib/auth"
import { savePending } from "@/lib/storage"
import { validateUpload } from "@/lib/file-validation"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const { id: sessionId } = await ctx.params
  const session = await db.bulkImportSession.findUnique({
    where: { id: sessionId },
    select: { id: true, ownerId: true, status: true }
  })
  if (!session) return NextResponse.json({ error: "Session introuvable." }, { status: 404 })
  if (session.ownerId !== auth.userId) return NextResponse.json({ error: "Acces refuse." }, { status: 403 })
  if (session.status !== "IN_PROGRESS") {
    return NextResponse.json({ error: "Session cloturee." }, { status: 409 })
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: "Requete invalide." }, { status: 400 })
  }

  const file = form.get("file")
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Aucun fichier envoye." }, { status: 400 })
  }

  const validation = await validateUpload(file)
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: validation.status })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const { id: uploadId } = await savePending(buffer, validation.ext)

  const item = await db.bulkImportItem.create({
    data: {
      sessionId,
      filename: file.name,
      format: validation.format,
      fileSize: validation.size,
      uploadId,
      status: "PENDING"
    },
    select: { id: true }
  })

  return NextResponse.json({ itemId: item.id, status: "PENDING" }, { status: 201 })
}
```

- [ ] **Step 2: Verifier que la signature `validateUpload` retourne bien `{ ok, ext, format, size }`**

```bash
grep -n "export\|return" lib/file-validation.ts
```

Adapter les noms de proprietes si necessaire (ex: si c'est `extension` au lieu de `ext`).

- [ ] **Step 3: Verifier typecheck + lint**

```bash
npm run typecheck && npm run lint
```

- [ ] **Step 4: Commit**

```bash
git add app/api/admin/bulk-imports/[id]/upload/route.ts
git commit -m "feat(api): upload file into bulk import session"
```

---

## Task 8: API — process item (extraction + recherche + scoring)

**Files:**
- Create: `app/api/admin/bulk-imports/[id]/items/[itemId]/process/route.ts`

- [ ] **Step 1: Ecrire la route POST process**

```typescript
import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAdmin } from "@/lib/auth"
import { readPending } from "@/lib/storage"
import { extractFromEpub, extractFromPdf, queryFromFilename, searchBooks } from "@/lib/metadata"
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
      session: { select: { ownerId: true } }
    }
  })
  if (!item || item.sessionId !== sessionId) {
    return NextResponse.json({ error: "Item introuvable." }, { status: 404 })
  }
  if (item.session.ownerId !== auth.userId) {
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 })
  }
  if (!item.uploadId) {
    await db.bulkImportItem.update({
      where: { id: itemId },
      data: { status: "ERROR", errorMessage: "Pending file manquant." }
    })
    return NextResponse.json({ error: "Pending file manquant." }, { status: 422 })
  }

  // Marquer PROCESSING tot pour que le polling client le voit
  await db.bulkImportItem.update({
    where: { id: itemId },
    data: { status: "PROCESSING" }
  })

  try {
    const buffer = await readPending(item.uploadId)
    const extracted =
      item.format === "EPUB"
        ? await extractFromEpub(buffer)
        : await extractFromPdf(buffer)

    // Fallback nom de fichier si extraction muette
    const queryParts = [
      extracted.title ?? queryFromFilename(item.filename),
      extracted.author
    ]
      .filter(Boolean)
      .join(" ")
    const isbnQuery = normalizeIsbn(extracted.isbn)

    await sleep(METADATA_CALL_DELAY_MS)
    const search = isbnQuery
      ? await searchBooks(isbnQuery)
      : await searchBooks(queryParts || item.filename)

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
```

- [ ] **Step 2: Verifier que `readPending` existe dans `lib/storage.ts`**

```bash
grep -n "readPending\|getPending" lib/storage.ts
```

Si la fonction n'existe pas, l'ajouter (lecture du fichier pending dans `UPLOAD_DIR/_pending/<id>.<ext>`). Voir la signature de `savePending` pour comprendre le format de stockage.

- [ ] **Step 3: Verifier typecheck + lint**

```bash
npm run typecheck && npm run lint
```

- [ ] **Step 4: Commit**

```bash
git add app/api/admin/bulk-imports/[id]/items/[itemId]/process/route.ts lib/storage.ts
git commit -m "feat(api): process bulk import item (extract + search + scoring)"
```

---

## Task 9: API — GET session + PATCH item (decisions admin)

**Files:**
- Modify: `app/api/admin/bulk-imports/[id]/route.ts` (ajout GET)
- Create: `app/api/admin/bulk-imports/[id]/items/[itemId]/route.ts` (PATCH)

- [ ] **Step 1: Ajouter le handler GET dans `app/api/admin/bulk-imports/[id]/route.ts`**

En haut du fichier, ajouter l'export `GET` :

```typescript
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const { id } = await ctx.params
  const session = await db.bulkImportSession.findUnique({
    where: { id },
    select: {
      id: true,
      ownerId: true,
      status: true,
      totalFiles: true,
      createdAt: true,
      updatedAt: true,
      committedAt: true,
      items: {
        select: {
          id: true,
          filename: true,
          format: true,
          fileSize: true,
          status: true,
          extractedTitle: true,
          extractedAuthor: true,
          extractedIsbn: true,
          candidatesJson: true,
          chosenCandidate: true,
          mergeIntoBookId: true,
          decision: true,
          errorMessage: true,
          committedBookId: true,
          committedCopyId: true,
          createdAt: true,
          updatedAt: true
        },
        orderBy: { createdAt: "asc" }
      }
    }
  })
  if (!session) return NextResponse.json({ error: "Session introuvable." }, { status: 404 })
  if (session.ownerId !== auth.userId) return NextResponse.json({ error: "Acces refuse." }, { status: 403 })

  return NextResponse.json({ session })
}
```

- [ ] **Step 2: Creer `app/api/admin/bulk-imports/[id]/items/[itemId]/route.ts`**

```typescript
import { NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { requireAdmin } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const ChosenCandidate = z
  .object({
    source: z.enum(["google_books", "open_library", "bnf"]),
    externalId: z.string(),
    title: z.string(),
    author: z.string().nullable(),
    isbn: z.string().nullable(),
    year: z.number().nullable(),
    publisher: z.string().nullable(),
    language: z.string().nullable(),
    coverUrl: z.string().nullable(),
    description: z.string().nullable(),
    genre: z.string().nullable()
  })
  .nullable()

const FormOverrides = z
  .object({
    title: z.string().trim().min(1).max(500).optional(),
    author: z.string().trim().max(300).nullable().optional(),
    isbn: z.string().trim().max(20).nullable().optional(),
    description: z.string().trim().max(5000).nullable().optional(),
    genre: z.string().trim().max(120).nullable().optional(),
    year: z.number().int().min(0).max(2200).nullable().optional(),
    publisher: z.string().trim().max(200).nullable().optional(),
    language: z.string().trim().max(10).nullable().optional(),
    coverUrl: z.string().trim().nullable().optional()
  })
  .optional()

const PatchBody = z.object({
  decision: z.enum(["NONE", "CREATE", "MERGE", "SKIP"]),
  chosenCandidate: ChosenCandidate.optional(),
  mergeIntoBookId: z.string().nullable().optional(),
  formOverrides: FormOverrides
})

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string; itemId: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const { id: sessionId, itemId } = await ctx.params

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

  const item = await db.bulkImportItem.findUnique({
    where: { id: itemId },
    select: { id: true, sessionId: true, session: { select: { ownerId: true } } }
  })
  if (!item || item.sessionId !== sessionId) {
    return NextResponse.json({ error: "Item introuvable." }, { status: 404 })
  }
  if (item.session.ownerId !== auth.userId) {
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 })
  }

  // formOverrides est merge dans chosenCandidate si fourni (ne touche pas aux champs API).
  // L'admin peut ainsi corriger une erreur API avant le commit.
  let chosen = parsed.data.chosenCandidate ?? null
  if (parsed.data.formOverrides && chosen) {
    chosen = { ...chosen, ...parsed.data.formOverrides }
  }

  await db.bulkImportItem.update({
    where: { id: itemId },
    data: {
      decision: parsed.data.decision,
      chosenCandidate: chosen as unknown as object,
      mergeIntoBookId: parsed.data.mergeIntoBookId ?? undefined
    }
  })

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: Verifier typecheck + lint**

```bash
npm run typecheck && npm run lint
```

- [ ] **Step 4: Commit**

```bash
git add app/api/admin/bulk-imports/[id]/route.ts app/api/admin/bulk-imports/[id]/items/[itemId]/route.ts
git commit -m "feat(api): GET session + PATCH item decision"
```

---

## Task 10: API — commit avec groupage doublons internes

**Files:**
- Create: `app/api/admin/bulk-imports/[id]/commit/route.ts`
- Create: `lib/bulk-import-commit.ts` (logique de groupage extraite, testable)
- Create: `scripts/commit-grouping-smoke.ts`

- [ ] **Step 1: Ecrire `lib/bulk-import-commit.ts`**

```typescript
// lib/bulk-import-commit.ts
// =====================================================================
// Sifriya — groupage des items CREATE par signature commune (doublons
// internes au lot). Sortie : un mapping signature -> liste d'items.
// =====================================================================

import { computeMatchKey, normalizeIsbn } from "@/lib/match"

export type CommitItemInput = {
  id: string
  extractedIsbn: string | null
  chosenCandidate: { isbn?: string | null; externalId?: string; title: string; author: string | null } | null
}

// Une "signature" identifie un Book unique. Priorite ISBN > externalId > matchKey.
export function signatureFor(item: CommitItemInput): string {
  const isbn = normalizeIsbn(item.chosenCandidate?.isbn ?? item.extractedIsbn)
  if (isbn) return `isbn:${isbn}`
  if (item.chosenCandidate?.externalId) return `ext:${item.chosenCandidate.externalId}`
  if (item.chosenCandidate) {
    return `mk:${computeMatchKey(item.chosenCandidate.title, item.chosenCandidate.author)}`
  }
  // item sans candidat (cas formOverrides en MANUAL) -> signature unique par item.id
  return `solo:${item.id}`
}

// Groupe les items par signature. L'ordre des items est preserve dans chaque groupe
// (le premier item du groupe sera celui qui cree le Book).
export function groupBySignature(items: CommitItemInput[]): Map<string, CommitItemInput[]> {
  const groups = new Map<string, CommitItemInput[]>()
  for (const item of items) {
    const sig = signatureFor(item)
    const list = groups.get(sig) ?? []
    list.push(item)
    groups.set(sig, list)
  }
  return groups
}
```

- [ ] **Step 2: Ecrire `scripts/commit-grouping-smoke.ts`**

```typescript
// scripts/commit-grouping-smoke.ts
// Run avec : npx tsx scripts/commit-grouping-smoke.ts

import { groupBySignature, signatureFor } from "../lib/bulk-import-commit"

const items = [
  {
    id: "a",
    extractedIsbn: "9782070408469",
    chosenCandidate: { isbn: "9782070408469", externalId: "g:1", title: "Candide", author: "Voltaire" }
  },
  {
    id: "b", // meme ISBN que a (EPUB + PDF du meme livre)
    extractedIsbn: null,
    chosenCandidate: { isbn: "978-2-07-040846-9", externalId: "g:2", title: "Candide", author: "Voltaire" }
  },
  {
    id: "c",
    extractedIsbn: null,
    chosenCandidate: { isbn: null, externalId: "g:3", title: "1984", author: "Orwell" }
  },
  {
    id: "d", // meme externalId que c
    extractedIsbn: null,
    chosenCandidate: { isbn: null, externalId: "g:3", title: "1984", author: "Orwell" }
  },
  {
    id: "e", // sans candidat
    extractedIsbn: null,
    chosenCandidate: null
  }
]

const groups = groupBySignature(items)
let failed = 0
function expect(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "OK" : "FAIL"}  ${label}${detail ? " — " + detail : ""}`)
  if (!ok) failed++
}

expect("4 groupes attendus", groups.size === 4, `got ${groups.size}`)

const groupCounts = [...groups.values()].map((g) => g.length).sort()
expect("repartition [1,1,2,2]", JSON.stringify(groupCounts) === "[1,1,2,2]", `got ${JSON.stringify(groupCounts)}`)

expect("a et b dans meme groupe", signatureFor(items[0]) === signatureFor(items[1]))
expect("c et d dans meme groupe", signatureFor(items[2]) === signatureFor(items[3]))
expect("e isole", signatureFor(items[4]) === `solo:e`)

process.exit(failed === 0 ? 0 : 1)
```

- [ ] **Step 3: Lancer le smoke test**

```bash
npx tsx scripts/commit-grouping-smoke.ts
```

Expected: tous OK.

- [ ] **Step 4: Ecrire la route `app/api/admin/bulk-imports/[id]/commit/route.ts`**

```typescript
import { NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { requireAdmin } from "@/lib/auth"
import { deletePending } from "@/lib/storage"
import { createBookWithCopy, addCopyToBook, type BookMetadataInput } from "@/lib/books"
import { groupBySignature, type CommitItemInput } from "@/lib/bulk-import-commit"
import { logger } from "@/lib/logger"
import type { BulkImportItem, FileFormat } from "@prisma/client"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const Body = z.object({
  itemIds: z.array(z.string()).optional()
})

type CommitError = { itemId: string; error: string }

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const { id: sessionId } = await ctx.params

  let raw: unknown = {}
  try {
    raw = await req.json()
  } catch {
    /* body optionnel */
  }
  const parsed = Body.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: "Donnees invalides." }, { status: 400 })
  }

  const session = await db.bulkImportSession.findUnique({
    where: { id: sessionId },
    select: { id: true, ownerId: true, status: true }
  })
  if (!session) return NextResponse.json({ error: "Session introuvable." }, { status: 404 })
  if (session.ownerId !== auth.userId) return NextResponse.json({ error: "Acces refuse." }, { status: 403 })
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

  // 1) SKIP : delete pending file
  for (const item of items.filter((i) => i.decision === "SKIP")) {
    try {
      if (item.uploadId) await deletePending(item.uploadId)
      await db.bulkImportItem.update({ where: { id: item.id }, data: { uploadId: null } })
      skipped++
    } catch (err) {
      errors.push({ itemId: item.id, error: String(err) })
    }
  }

  // 2) MERGE : ajout copy a Book existant
  for (const item of items.filter((i) => i.decision === "MERGE")) {
    if (!item.mergeIntoBookId || !item.uploadId) {
      errors.push({ itemId: item.id, error: "Donnees incompletes pour merge." })
      continue
    }
    try {
      const { copyId } = await addCopyToBook(
        item.mergeIntoBookId,
        { type: "DIGITAL", uploadId: item.uploadId, format: item.format, fileSize: item.fileSize },
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

  // 3) CREATE : groupage par signature commune
  const createItems = items.filter((i) => i.decision === "CREATE")
  const grouped = groupBySignature(createItems.map(toCommitInput))

  for (const [, group] of grouped) {
    if (group.length === 0) continue
    const head = createItems.find((i) => i.id === group[0].id)!
    const meta = metadataFromItem(head)
    if (!meta || !head.uploadId) {
      errors.push({ itemId: head.id, error: "Metadata ou upload manquant." })
      continue
    }
    try {
      const { bookId, copyId } = await createBookWithCopy(
        meta,
        { type: "DIGITAL", uploadId: head.uploadId, format: head.format, fileSize: head.fileSize },
        auth.userId
      )
      await db.bulkImportItem.update({
        where: { id: head.id },
        data: { committedBookId: bookId, committedCopyId: copyId }
      })
      created++

      // Items suivants du groupe -> addCopy au Book qui vient d'etre cree
      for (const sib of group.slice(1)) {
        const sibItem = createItems.find((i) => i.id === sib.id)!
        if (!sibItem.uploadId) {
          errors.push({ itemId: sib.id, error: "Upload manquant." })
          continue
        }
        try {
          const { copyId: siblingCopyId } = await addCopyToBook(
            bookId,
            { type: "DIGITAL", uploadId: sibItem.uploadId, format: sibItem.format, fileSize: sibItem.fileSize },
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

  // Cloturer la session si tous les items ont une decision finale
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
  const chosen = (item.chosenCandidate ?? null) as CommitItemInput["chosenCandidate"]
  return {
    id: item.id,
    extractedIsbn: item.extractedIsbn,
    chosenCandidate: chosen
  }
}

function metadataFromItem(item: BulkImportItem): BookMetadataInput | null {
  const chosen = item.chosenCandidate as Partial<BookMetadataInput & { isbn?: string | null }> | null
  if (!chosen && !item.extractedTitle) return null
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
    sourceApi: (chosen?.sourceApi as BookMetadataInput["sourceApi"]) ?? "manual",
    externalId: chosen?.externalId ?? null
  }
}
```

(Note pour l'engineer: le typage du `chosen` est lache car les Json Prisma sont `JsonValue`. Le narrowing strict serait verbeux pour peu de gain. Le scoring + le PATCH s'occupent de la coherence amont.)

Pour le compileur TS, on importe `FileFormat` depuis `@prisma/client` (deja fait dans la signature) — cela evite l'erreur de typage sur `item.format` dans `addCopyToBook`.

- [ ] **Step 5: Verifier typecheck + lint**

```bash
npm run typecheck && npm run lint
```

- [ ] **Step 6: Commit**

```bash
git add app/api/admin/bulk-imports/[id]/commit/route.ts lib/bulk-import-commit.ts scripts/commit-grouping-smoke.ts
git commit -m "feat(api): commit endpoint with internal duplicate grouping"
```

---

## Task 11: Etendre cleanup-pending pour les sessions

**Files:**
- Modify: `scripts/cleanup-pending.ts`

- [ ] **Step 1: Lire le script existant**

```bash
cat scripts/cleanup-pending.ts
```

Comprendre la logique actuelle (lecture pending dir + suppression par age).

- [ ] **Step 2: Ajouter la logique sessions**

Apres la logique existante de purge des pending, ajouter (en preservant les imports/exports existants) :

```typescript
import { db } from "../lib/db"
import { deletePending } from "../lib/storage"
import {
  SESSION_ABANDON_AFTER_DAYS,
  SESSION_PURGE_AFTER_DAYS
} from "../lib/bulk-import-limits"

async function cleanupBulkImportSessions() {
  const now = Date.now()
  const abandonThreshold = new Date(now - SESSION_ABANDON_AFTER_DAYS * 86_400_000)
  const purgeThreshold = new Date(now - SESSION_PURGE_AFTER_DAYS * 86_400_000)

  // 1) IN_PROGRESS sans update depuis > 7j -> ABANDONED + purge pending
  const stale = await db.bulkImportSession.findMany({
    where: { status: "IN_PROGRESS", updatedAt: { lt: abandonThreshold } },
    select: {
      id: true,
      items: { select: { id: true, uploadId: true, committedCopyId: true } }
    }
  })
  for (const s of stale) {
    for (const item of s.items) {
      if (item.uploadId && !item.committedCopyId) {
        await deletePending(item.uploadId).catch(() => {})
      }
    }
    await db.bulkImportSession.update({
      where: { id: s.id },
      data: { status: "ABANDONED" }
    })
    console.log(`[cleanup] session ${s.id} abandoned (${s.items.length} items)`)
  }

  // 2) ABANDONED ou COMMITTED depuis > 30j -> delete cascade
  const old = await db.bulkImportSession.findMany({
    where: {
      status: { in: ["ABANDONED", "COMMITTED"] },
      updatedAt: { lt: purgeThreshold }
    },
    select: { id: true }
  })
  for (const s of old) {
    await db.bulkImportSession.delete({ where: { id: s.id } })
    console.log(`[cleanup] session ${s.id} deleted (purged)`)
  }
}

// Appeler la fonction depuis le main du script existant.
// Si le script utilise un IIFE async, ajouter la ligne :
//   await cleanupBulkImportSessions()
// juste avant la fin du main.
```

L'engineer adapte l'integration selon la structure exacte du script existant (point d'appel a la fin du `main()` ou equivalent).

- [ ] **Step 3: Test manuel — lancer le script**

```bash
npm run cleanup:pending
```

Expected: aucune erreur. Pas de session a nettoyer (DB fraiche), output silencieux ou messages "0 items".

- [ ] **Step 4: Verifier typecheck + lint**

```bash
npm run typecheck && npm run lint
```

- [ ] **Step 5: Commit**

```bash
git add scripts/cleanup-pending.ts
git commit -m "feat(cleanup): purge stale bulk import sessions"
```

---

## Task 12: UI — page index admin (drop + sessions actives)

**Files:**
- Create: `app/admin/bulk-import/page.tsx`
- Create: `components/admin/bulk-import/DropZone.tsx`
- Create: `components/admin/bulk-import/SessionList.tsx`
- Modify: `components/layout/Sidebar.tsx` (ajout lien admin)

- [ ] **Step 1: Creer la page index**

```typescript
// app/admin/bulk-import/page.tsx
import { redirect } from "next/navigation"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { DropZone } from "@/components/admin/bulk-import/DropZone"
import { SessionList } from "@/components/admin/bulk-import/SessionList"

export const dynamic = "force-dynamic"

export default async function BulkImportPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== "ADMIN") redirect("/bibliotheque")

  const active = await db.bulkImportSession.findMany({
    where: { ownerId: session.user.id, status: "IN_PROGRESS" },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      totalFiles: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { items: true } }
    }
  })

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-6">
      <header>
        <h1 className="font-serif text-2xl text-ink">Import en masse</h1>
        <p className="mt-1 text-[13px] text-ink-3">
          Deposez un dossier de livres numeriques (EPUB / PDF). Maximum 500 fichiers par session.
        </p>
      </header>

      <DropZone />

      {active.length > 0 ? (
        <section>
          <h2 className="mb-3 font-serif text-lg text-ink">Sessions en cours</h2>
          <SessionList sessions={active} />
        </section>
      ) : null}
    </div>
  )
}
```

- [ ] **Step 2: Creer `components/admin/bulk-import/DropZone.tsx`**

```typescript
"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { FolderOpen, Upload } from "lucide-react"
import { Button } from "@/components/ui/Button"
import {
  MAX_FILES_ADMIN,
  WARN_FILES_ADMIN
} from "@/lib/bulk-import-limits"

const ACCEPTED_EXT = [".epub", ".pdf"]

export function DropZone() {
  const router = useRouter()
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [files, setFiles] = React.useState<File[]>([])
  const [error, setError] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)

  const handleFiles = (incoming: FileList | null) => {
    if (!incoming) return
    setError(null)
    const filtered = Array.from(incoming).filter((f) =>
      ACCEPTED_EXT.some((ext) => f.name.toLowerCase().endsWith(ext))
    )
    if (filtered.length === 0) {
      setError("Aucun fichier EPUB ou PDF detecte.")
      return
    }
    if (filtered.length > MAX_FILES_ADMIN) {
      setError(`Maximum ${MAX_FILES_ADMIN} fichiers par session (recu ${filtered.length}).`)
      return
    }
    setFiles(filtered)
  }

  const totalBytes = files.reduce((sum, f) => sum + f.size, 0)
  const totalMb = (totalBytes / (1024 * 1024)).toFixed(1)
  const epubCount = files.filter((f) => f.name.toLowerCase().endsWith(".epub")).length
  const pdfCount = files.length - epubCount

  const start = async () => {
    if (files.length === 0) return
    if (files.length > WARN_FILES_ADMIN) {
      const ok = window.confirm(
        `${files.length} fichiers vont etre importes — cela peut prendre plusieurs minutes. Continuer ?`
      )
      if (!ok) return
    }
    setPending(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/bulk-imports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ totalFiles: files.length })
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error ?? "Echec de la creation de session.")
      }
      const { sessionId } = (await res.json()) as { sessionId: string }
      // Stash files dans sessionStorage pour les recuperer cote /[id]
      ;(window as unknown as Record<string, unknown>).__bulkImportFiles = files
      router.push(`/admin/bulk-import/${sessionId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue.")
      setPending(false)
    }
  }

  return (
    <section className="space-y-3">
      <div
        onDrop={(e) => {
          e.preventDefault()
          handleFiles(e.dataTransfer.files)
        }}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click()
        }}
        className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[var(--rule)] bg-paper-2/40 px-6 py-12 text-center hover:border-ink-3"
      >
        <FolderOpen size={28} className="text-ink-3" />
        <p className="mt-3 font-serif text-lg text-ink">Deposez un dossier ici</p>
        <p className="mt-1 text-[13px] text-ink-3">ou cliquez pour parcourir</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          // @ts-expect-error — webkitdirectory n'est pas dans les types React
          webkitdirectory=""
          directory=""
          accept=".epub,.pdf,application/epub+zip,application/pdf"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {files.length > 0 ? (
        <div className="rounded-md border border-[var(--rule)] bg-paper p-3 text-[13px]">
          <p className="text-ink">
            <strong>{files.length}</strong> fichiers ({epubCount} EPUB + {pdfCount} PDF) —{" "}
            <span className="font-mono">{totalMb} Mo</span>
          </p>
          <div className="mt-3 flex justify-end">
            <Button onClick={start} disabled={pending}>
              <Upload size={14} />
              {pending ? "Creation de session..." : "Demarrer l'import"}
            </Button>
          </div>
        </div>
      ) : null}

      {error ? <p className="text-[13px] text-[color:var(--err)]">{error}</p> : null}
    </section>
  )
}
```

- [ ] **Step 3: Creer `components/admin/bulk-import/SessionList.tsx`**

```typescript
import Link from "next/link"
import { ArrowRight } from "lucide-react"

type SessionRow = {
  id: string
  totalFiles: number
  createdAt: Date
  updatedAt: Date
  _count: { items: number }
}

export function SessionList({ sessions }: { sessions: SessionRow[] }) {
  if (sessions.length === 0) return null
  return (
    <ul className="divide-y divide-[var(--rule-2)] rounded-md border border-[var(--rule)] bg-paper">
      {sessions.map((s) => (
        <li key={s.id}>
          <Link
            href={`/admin/bulk-import/${s.id}`}
            className="flex items-center justify-between px-4 py-3 hover:bg-paper-2/60"
          >
            <div>
              <p className="font-mono text-[12px] text-ink">#{s.id.slice(0, 8)}</p>
              <p className="text-[12px] text-ink-3">
                {s._count.items} / {s.totalFiles} fichiers · demarre le {s.createdAt.toLocaleString("fr-FR")}
              </p>
            </div>
            <ArrowRight size={16} className="text-ink-3" />
          </Link>
        </li>
      ))}
    </ul>
  )
}
```

- [ ] **Step 4: Ajouter le lien "Import en masse" dans la sidebar admin**

Lire `components/layout/Sidebar.tsx`. Reperer la section "Paramètres admin" / lien `/admin`. Ajouter un lien :

```tsx
{role === "ADMIN" ? (
  <Link href="/admin/bulk-import" className={navItemClass}>
    <Upload size={16} />
    Import en masse
  </Link>
) : null}
```

(Ajuster selon le pattern exact de la sidebar — ex: utiliser `usePathname()` pour l'etat actif).

- [ ] **Step 5: Test manuel — visiter `/admin/bulk-import` en tant qu'admin**

```bash
npm run dev
```

Expected: la page s'affiche, on peut deposer un dossier, le recap apparait. "Demarrer l'import" cree une session et redirige vers `/admin/bulk-import/<id>` (qui affiche 404 pour l'instant, c'est normal — task suivante).

- [ ] **Step 6: Verifier typecheck + lint**

```bash
npm run typecheck && npm run lint
```

- [ ] **Step 7: Commit**

```bash
git add app/admin/bulk-import/page.tsx components/admin/bulk-import/ components/layout/Sidebar.tsx
git commit -m "feat(admin): bulk import index page + drop zone"
```

---

## Task 13: UI — page review (tableau + filtres + progress)

**Files:**
- Create: `app/admin/bulk-import/[id]/page.tsx`
- Create: `components/admin/bulk-import/ImportClient.tsx` (Client Component principal qui orchestre upload + polling + tableau)
- Create: `components/admin/bulk-import/ImportTable.tsx`
- Create: `components/admin/bulk-import/ImportTableRow.tsx`
- Create: `components/admin/bulk-import/ImportFilters.tsx`
- Create: `components/admin/bulk-import/ImportProgressBar.tsx`
- Create: `lib/use-bulk-import-uploads.ts` (hook de gestion concurrent uploads + processing fire-and-forget)

- [ ] **Step 1: Page serveur fine — recupere l'etat initial et passe a un Client Component**

```typescript
// app/admin/bulk-import/[id]/page.tsx
import { redirect, notFound } from "next/navigation"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { ImportClient } from "@/components/admin/bulk-import/ImportClient"

export const dynamic = "force-dynamic"

export default async function BulkImportSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== "ADMIN") redirect("/bibliotheque")
  const { id } = await params

  const importSession = await db.bulkImportSession.findUnique({
    where: { id },
    select: {
      id: true,
      ownerId: true,
      status: true,
      totalFiles: true,
      createdAt: true
    }
  })
  if (!importSession || importSession.ownerId !== session.user.id) notFound()

  return <ImportClient sessionId={importSession.id} totalFiles={importSession.totalFiles} initialStatus={importSession.status} />
}
```

- [ ] **Step 2: Hook `lib/use-bulk-import-uploads.ts`**

```typescript
// lib/use-bulk-import-uploads.ts
"use client"

import * as React from "react"
import { CONCURRENT_UPLOADS } from "@/lib/bulk-import-limits"

export type UploadJob = { file: File; status: "queued" | "uploading" | "processing" | "done" | "error"; itemId?: string; error?: string }

export function useBulkImportUploads(sessionId: string, files: File[]) {
  const [jobs, setJobs] = React.useState<UploadJob[]>(
    () => files.map((f) => ({ file: f, status: "queued" }))
  )
  const startedRef = React.useRef(false)

  React.useEffect(() => {
    if (startedRef.current) return
    if (files.length === 0) return
    startedRef.current = true

    const queue = files.map((_, idx) => idx)
    let active = 0
    let cursor = 0

    const updateJob = (idx: number, patch: Partial<UploadJob>) =>
      setJobs((prev) => prev.map((j, i) => (i === idx ? { ...j, ...patch } : j)))

    const next = async () => {
      while (active < CONCURRENT_UPLOADS && cursor < queue.length) {
        const idx = queue[cursor++]
        active++
        ;(async () => {
          updateJob(idx, { status: "uploading" })
          try {
            const fd = new FormData()
            fd.append("file", files[idx])
            const res = await fetch(`/api/admin/bulk-imports/${sessionId}/upload`, {
              method: "POST",
              body: fd
            })
            if (!res.ok) {
              const body = (await res.json().catch(() => null)) as { error?: string } | null
              throw new Error(body?.error ?? "Upload echoue.")
            }
            const { itemId } = (await res.json()) as { itemId: string }
            updateJob(idx, { status: "processing", itemId })

            // Process fire-and-forget — le polling de la page mettra a jour le tableau
            void fetch(`/api/admin/bulk-imports/${sessionId}/items/${itemId}/process`, {
              method: "POST"
            }).then(() => updateJob(idx, { status: "done" }))
              .catch((err) => updateJob(idx, { status: "error", error: String(err) }))
          } catch (err) {
            updateJob(idx, { status: "error", error: err instanceof Error ? err.message : String(err) })
          } finally {
            active--
            void next()
          }
        })()
      }
    }
    void next()
  }, [files, sessionId])

  return { jobs }
}
```

- [ ] **Step 3: Composant `ImportClient.tsx`**

```typescript
"use client"

import * as React from "react"
import { useBulkImportUploads } from "@/lib/use-bulk-import-uploads"
import { SESSION_POLL_INTERVAL_MS } from "@/lib/bulk-import-limits"
import { ImportTable } from "./ImportTable"
import { ImportFilters } from "./ImportFilters"
import { ImportProgressBar } from "./ImportProgressBar"
import type { BulkImportItem, BulkImportSessionStatus } from "@prisma/client"

type Props = {
  sessionId: string
  totalFiles: number
  initialStatus: BulkImportSessionStatus
}

export type ItemForUI = Omit<BulkImportItem, "candidatesJson" | "chosenCandidate"> & {
  candidatesJson: unknown
  chosenCandidate: unknown
}

export function ImportClient({ sessionId, totalFiles, initialStatus }: Props) {
  // Files presents en sessionStorage (poses par DropZone). Si la page est rechargee
  // sans files (reprise apres crash), on ne re-upload pas — l'admin reprend la review.
  const initialFiles = React.useMemo<File[]>(() => {
    if (typeof window === "undefined") return []
    const stash = (window as unknown as Record<string, unknown>).__bulkImportFiles
    if (Array.isArray(stash)) {
      delete (window as unknown as Record<string, unknown>).__bulkImportFiles
      return stash as File[]
    }
    return []
  }, [])

  useBulkImportUploads(sessionId, initialFiles)

  const [items, setItems] = React.useState<ItemForUI[]>([])
  const [status, setStatus] = React.useState<BulkImportSessionStatus>(initialStatus)
  const [filter, setFilter] = React.useState<string>("ALL")

  // Polling
  React.useEffect(() => {
    let stopped = false
    const tick = async () => {
      try {
        const res = await fetch(`/api/admin/bulk-imports/${sessionId}`)
        if (!res.ok) return
        const body = (await res.json()) as { session: { status: BulkImportSessionStatus; items: ItemForUI[] } }
        if (stopped) return
        setItems(body.session.items)
        setStatus(body.session.status)
        const stillProcessing = body.session.items.some((i) => i.status === "PENDING" || i.status === "PROCESSING")
        if (!stillProcessing && body.session.status !== "IN_PROGRESS") return
        if (!stillProcessing) {
          // Plus rien a processer mais session encore IN_PROGRESS — l'admin review.
          // On garde un polling lent (toutes les 10s) pour detecter les decisions admin sur d'autres onglets.
        }
      } catch {
        /* silencieux */
      }
    }
    void tick()
    const interval = window.setInterval(tick, SESSION_POLL_INTERVAL_MS)
    return () => {
      stopped = true
      window.clearInterval(interval)
    }
  }, [sessionId])

  const counts = React.useMemo(() => {
    const buckets = { AUTO_OK: 0, TO_REVIEW: 0, MANUAL: 0, DUPLICATE: 0, ERROR: 0, PROCESSING: 0, PENDING: 0 }
    for (const i of items) buckets[i.status as keyof typeof buckets] = (buckets[i.status as keyof typeof buckets] ?? 0) + 1
    return buckets
  }, [items])

  const visibleItems = filter === "ALL" ? items : items.filter((i) => i.status === filter)
  const processedCount = items.filter((i) => i.status !== "PENDING" && i.status !== "PROCESSING").length

  return (
    <div className="space-y-4 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-xl text-ink">Import #{sessionId.slice(0, 8)}</h1>
          <p className="text-[12px] text-ink-3">{totalFiles} fichiers · {status}</p>
        </div>
      </header>

      <ImportProgressBar processed={processedCount} total={totalFiles} />
      <ImportFilters counts={counts} total={items.length} active={filter} onChange={setFilter} sessionId={sessionId} />
      <ImportTable items={visibleItems} sessionId={sessionId} />
    </div>
  )
}
```

- [ ] **Step 4: `ImportProgressBar.tsx`**

```typescript
export function ImportProgressBar({ processed, total }: { processed: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((processed / total) * 100)
  return (
    <div className="rounded-md bg-paper-2/60 p-3">
      <div className="mb-1 flex justify-between text-[11px] text-ink-3">
        <span>Processing</span>
        <span>{processed} / {total}</span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-paper-3">
        <div className="h-full bg-accent transition-[width] duration-200" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
```

- [ ] **Step 5: `ImportFilters.tsx`**

```typescript
"use client"

import * as React from "react"
import { Button } from "@/components/ui/Button"

type Props = {
  counts: Record<string, number>
  total: number
  active: string
  onChange: (k: string) => void
  sessionId: string
}

const STATUSES: Array<{ key: string; label: string; color: string }> = [
  { key: "AUTO_OK", label: "Auto OK", color: "bg-[rgba(74,107,62,0.12)] text-[color:var(--ok)]" },
  { key: "TO_REVIEW", label: "A voir", color: "bg-[rgba(168,106,31,0.14)] text-[color:var(--warn)]" },
  { key: "DUPLICATE", label: "Doublon", color: "bg-accent-soft text-[#5a4711]" },
  { key: "MANUAL", label: "Manuel", color: "bg-[rgba(138,48,48,0.10)] text-[color:var(--err)]" },
  { key: "ERROR", label: "Erreur", color: "bg-[rgba(138,48,48,0.18)] text-[color:var(--err)]" }
]

export function ImportFilters({ counts, total, active, onChange, sessionId }: Props) {
  const [pending, setPending] = React.useState(false)
  const autoOkCount = counts.AUTO_OK ?? 0

  const bulkImportAutoOk = async () => {
    if (autoOkCount === 0) return
    setPending(true)
    try {
      const res = await fetch(`/api/admin/bulk-imports/${sessionId}/commit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}) // commit tous les items decidés (CREATE pre-rempli)
      })
      if (!res.ok) throw new Error("Echec du commit.")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => onChange("ALL")}
          className={`rounded-full px-3 py-1 text-[12px] ${active === "ALL" ? "bg-paper-3 text-ink" : "bg-paper-2 text-ink-2"}`}
        >
          Tous {total}
        </button>
        {STATUSES.map((s) => (
          <button
            key={s.key}
            onClick={() => onChange(s.key)}
            className={`rounded-full px-3 py-1 text-[12px] ${s.color} ${active === s.key ? "ring-1 ring-ink-3" : ""}`}
          >
            {s.label} {counts[s.key] ?? 0}
          </button>
        ))}
      </div>

      <Button onClick={bulkImportAutoOk} disabled={pending || autoOkCount === 0}>
        Importer {autoOkCount} OK
      </Button>
    </div>
  )
}
```

- [ ] **Step 6: `ImportTable.tsx` + `ImportTableRow.tsx`**

```typescript
// components/admin/bulk-import/ImportTable.tsx
"use client"

import { ImportTableRow } from "./ImportTableRow"
import type { ItemForUI } from "./ImportClient"

export function ImportTable({ items, sessionId }: { items: ItemForUI[]; sessionId: string }) {
  return (
    <div className="overflow-hidden rounded-md border border-[var(--rule)]">
      <div className="grid grid-cols-[1fr_180px_100px_24px] gap-2 bg-paper-2 px-4 py-2 text-[11px] font-medium text-ink-2">
        <div>Fichier</div>
        <div>Match propose</div>
        <div>Status</div>
        <div></div>
      </div>
      {items.length === 0 ? (
        <p className="px-4 py-8 text-center text-[12px] text-ink-3">Aucun item dans ce filtre.</p>
      ) : (
        items.map((item) => <ImportTableRow key={item.id} item={item} sessionId={sessionId} />)
      )}
    </div>
  )
}
```

```typescript
// components/admin/bulk-import/ImportTableRow.tsx
"use client"

import { ChevronRight } from "lucide-react"
import type { ItemForUI } from "./ImportClient"

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "En attente", cls: "bg-paper-2 text-ink-3" },
  PROCESSING: { label: "Process...", cls: "bg-paper-2 text-ink-3" },
  AUTO_OK: { label: "Auto OK", cls: "bg-[rgba(74,107,62,0.12)] text-[color:var(--ok)]" },
  TO_REVIEW: { label: "A voir", cls: "bg-[rgba(168,106,31,0.14)] text-[color:var(--warn)]" },
  DUPLICATE: { label: "Doublon", cls: "bg-accent-soft text-[#5a4711]" },
  MANUAL: { label: "Manuel", cls: "bg-[rgba(138,48,48,0.10)] text-[color:var(--err)]" },
  ERROR: { label: "Erreur", cls: "bg-[rgba(138,48,48,0.18)] text-[color:var(--err)]" }
}

export function ImportTableRow({ item, sessionId }: { item: ItemForUI; sessionId: string }) {
  const meta = STATUS_LABEL[item.status] ?? { label: item.status, cls: "bg-paper-2" }
  const chosen = item.chosenCandidate as { title?: string; author?: string | null } | null
  const candCount = Array.isArray(item.candidatesJson) ? (item.candidatesJson as unknown[]).length : 0

  const matchSummary =
    chosen?.title
      ? `${chosen.title}${chosen.author ? " — " + chosen.author : ""}`
      : item.status === "MANUAL"
      ? "Aucun candidat"
      : item.status === "PROCESSING" || item.status === "PENDING"
      ? "..."
      : `${candCount} candidats`

  return (
    <div
      className="grid cursor-pointer grid-cols-[1fr_180px_100px_24px] items-center gap-2 border-t border-[var(--rule-2)] px-4 py-2 text-[12px] hover:bg-paper-2/50"
      onClick={() => {
        // Ouverture drawer — geree par l'event "open-drawer" remontee a ImportClient
        window.dispatchEvent(new CustomEvent("bulk-import-open-drawer", { detail: { itemId: item.id, sessionId } }))
      }}
    >
      <div className="truncate font-mono text-ink-2">{item.filename}</div>
      <div className="truncate text-ink-2">{matchSummary}</div>
      <div>
        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] ${meta.cls}`}>{meta.label}</span>
      </div>
      <ChevronRight size={14} className="text-ink-3" />
    </div>
  )
}
```

(Note: l'event `bulk-import-open-drawer` sera ecoute par `ImportClient` au Task 14. Pour l'instant le clic ne fait rien d'observable — c'est OK.)

- [ ] **Step 7: Test manuel**

```bash
npm run dev
```

Aller sur `/admin/bulk-import`, deposer 3-5 fichiers test (depuis `scripts/fixtures/bulk-import/`), demarrer. Verifier :
- La page de review s'affiche
- Le tableau se remplit progressivement (polling)
- Les status apparaissent (Auto OK / A voir / Manuel)
- Le bouton "Importer X OK" cree des Books pour les Auto OK
- Verifier en DB ou via `/bibliotheque` que les livres sont bien crees

- [ ] **Step 8: Verifier typecheck + lint**

```bash
npm run typecheck && npm run lint
```

- [ ] **Step 9: Commit**

```bash
git add app/admin/bulk-import/[id]/ components/admin/bulk-import/ lib/use-bulk-import-uploads.ts
git commit -m "feat(admin): bulk import review table + concurrent uploads + polling"
```

---

## Task 14: UI — drawer drill-down (4 variants)

**Files:**
- Create: `components/admin/bulk-import/ItemDrawer.tsx` (router selon status)
- Create: `components/admin/bulk-import/DrawerAutoOk.tsx`
- Create: `components/admin/bulk-import/DrawerReview.tsx`
- Create: `components/admin/bulk-import/DrawerManual.tsx`
- Create: `components/admin/bulk-import/DrawerDuplicate.tsx`
- Modify: `components/admin/bulk-import/ImportClient.tsx` (ecoute event + monte le drawer)

- [ ] **Step 1: `ItemDrawer.tsx` — squelette + router**

```typescript
"use client"

import * as React from "react"
import { X } from "lucide-react"
import { DrawerAutoOk } from "./DrawerAutoOk"
import { DrawerReview } from "./DrawerReview"
import { DrawerManual } from "./DrawerManual"
import { DrawerDuplicate } from "./DrawerDuplicate"
import type { ItemForUI } from "./ImportClient"

type Props = {
  item: ItemForUI
  sessionId: string
  onClose: () => void
  onPrev: (() => void) | null
  onNext: (() => void) | null
  onUpdated: () => void
}

export function ItemDrawer({ item, sessionId, onClose, onPrev, onNext, onUpdated }: Props) {
  return (
    <div className="fixed right-0 top-0 z-40 h-full w-full max-w-md overflow-y-auto border-l border-[var(--rule)] bg-paper shadow-[var(--shadow-2)]">
      <header className="sticky top-0 flex items-center justify-between border-b border-[var(--rule-2)] bg-paper px-4 py-3">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-ink-3">{item.status}</p>
          <p className="font-mono text-[12px] text-ink">{item.filename}</p>
        </div>
        <button onClick={onClose} aria-label="Fermer" className="text-ink-3 hover:text-ink">
          <X size={18} />
        </button>
      </header>

      <div className="p-4">
        {item.status === "AUTO_OK" ? <DrawerAutoOk item={item} sessionId={sessionId} onUpdated={onUpdated} /> : null}
        {item.status === "TO_REVIEW" ? <DrawerReview item={item} sessionId={sessionId} onUpdated={onUpdated} /> : null}
        {item.status === "MANUAL" ? <DrawerManual item={item} sessionId={sessionId} onUpdated={onUpdated} /> : null}
        {item.status === "DUPLICATE" ? <DrawerDuplicate item={item} sessionId={sessionId} onUpdated={onUpdated} /> : null}
      </div>

      <footer className="sticky bottom-0 flex justify-between border-t border-[var(--rule-2)] bg-paper px-4 py-3 text-[11px] text-ink-3">
        <button onClick={onPrev ?? undefined} disabled={!onPrev} className="disabled:opacity-30">← Precedent</button>
        <button onClick={onNext ?? undefined} disabled={!onNext} className="disabled:opacity-30">Suivant →</button>
      </footer>
    </div>
  )
}
```

- [ ] **Step 2: `DrawerAutoOk.tsx`**

```typescript
"use client"

import { Cover } from "@/components/ui/Cover"
import { Button } from "@/components/ui/Button"
import type { ItemForUI } from "./ImportClient"

export function DrawerAutoOk({ item }: { item: ItemForUI; sessionId: string; onUpdated: () => void }) {
  const c = item.chosenCandidate as { title?: string; author?: string | null; coverUrl?: string | null; year?: number | null; publisher?: string | null } | null
  if (!c) return <p className="text-[13px] text-ink-3">Pas de candidat retenu.</p>
  return (
    <div className="space-y-3">
      <div className="flex gap-3">
        <Cover src={c.coverUrl ?? null} title={c.title ?? ""} className="h-28 w-20" />
        <div>
          <p className="font-serif text-base text-ink">{c.title}</p>
          <p className="text-[12px] text-ink-3">{c.author ?? "Auteur inconnu"}</p>
          <p className="mt-1 text-[11px] text-ink-3">{c.year ?? ""} · {c.publisher ?? ""}</p>
        </div>
      </div>
      <p className="text-[12px] text-ink-3">
        Match retenu automatiquement. Sera importe comme nouvelle fiche au prochain commit.
      </p>
      <Button variant="ghost">Modifier le match</Button>
    </div>
  )
}
```

(Note: "Modifier le match" est un placeholder — son comportement bascule en mode review. Pour V1.4 garder simple : on laisse l'admin re-classer en TO_REVIEW manuellement via PATCH si besoin. Si critique, ajouter en V1.4.1.)

- [ ] **Step 3: `DrawerReview.tsx` — picker de candidats**

```typescript
"use client"

import * as React from "react"
import { Cover } from "@/components/ui/Cover"
import { Button } from "@/components/ui/Button"
import type { ItemForUI } from "./ImportClient"

type Cand = {
  source: string
  externalId: string
  title: string
  author: string | null
  year: number | null
  publisher: string | null
  coverUrl: string | null
  isbn: string | null
  description: string | null
  language: string | null
  genre: string | null
}

export function DrawerReview({ item, sessionId, onUpdated }: { item: ItemForUI; sessionId: string; onUpdated: () => void }) {
  const candidates = (item.candidatesJson as Cand[] | null) ?? []
  const [picked, setPicked] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)

  const validate = async () => {
    if (!picked) return
    setPending(true)
    const cand = candidates.find((c) => c.externalId === picked)
    await fetch(`/api/admin/bulk-imports/${sessionId}/items/${item.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision: "CREATE", chosenCandidate: cand })
    })
    setPending(false)
    onUpdated()
  }

  const skip = async () => {
    setPending(true)
    await fetch(`/api/admin/bulk-imports/${sessionId}/items/${item.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision: "SKIP" })
    })
    setPending(false)
    onUpdated()
  }

  return (
    <div className="space-y-3">
      <p className="text-[12px] text-ink-3">
        Titre extrait : <em>{item.extractedTitle ?? "—"}</em>
      </p>

      <div className="space-y-2">
        {candidates.map((c) => (
          <button
            key={c.externalId}
            onClick={() => setPicked(c.externalId)}
            className={`flex w-full gap-2 rounded-md border p-2 text-left text-[12px] ${
              picked === c.externalId ? "border-[color:var(--accent)] bg-accent-soft/40" : "border-[var(--rule)] bg-paper"
            }`}
          >
            <Cover src={c.coverUrl} title={c.title} className="h-14 w-10" />
            <div>
              <p className="font-serif text-ink">{c.title}</p>
              <p className="text-ink-3">{c.author ?? "—"} · {c.year ?? "—"}</p>
              <p className="text-[10px] text-ink-3">{c.source} {c.isbn ? "· ISBN " + c.isbn : ""}</p>
            </div>
          </button>
        ))}
      </div>

      <div className="flex justify-between gap-2 pt-2">
        <Button variant="primary" onClick={validate} disabled={!picked || pending}>Valider</Button>
        <Button variant="ghost" onClick={skip} disabled={pending}>Ignorer</Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: `DrawerManual.tsx` — formulaire libre**

```typescript
"use client"

import * as React from "react"
import { Input } from "@/components/ui/Input"
import { Button } from "@/components/ui/Button"
import type { ItemForUI } from "./ImportClient"

export function DrawerManual({ item, sessionId, onUpdated }: { item: ItemForUI; sessionId: string; onUpdated: () => void }) {
  const [title, setTitle] = React.useState(item.extractedTitle ?? item.filename.replace(/\.(epub|pdf)$/i, ""))
  const [author, setAuthor] = React.useState(item.extractedAuthor ?? "")
  const [isbn, setIsbn] = React.useState(item.extractedIsbn ?? "")
  const [pending, setPending] = React.useState(false)

  const submit = async () => {
    setPending(true)
    await fetch(`/api/admin/bulk-imports/${sessionId}/items/${item.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        decision: "CREATE",
        chosenCandidate: {
          source: "manual",
          externalId: "",
          title,
          author: author || null,
          isbn: isbn || null,
          year: null,
          publisher: null,
          language: "fr",
          coverUrl: null,
          description: null,
          genre: null
        }
      })
    })
    setPending(false)
    onUpdated()
  }

  const skip = async () => {
    setPending(true)
    await fetch(`/api/admin/bulk-imports/${sessionId}/items/${item.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision: "SKIP" })
    })
    setPending(false)
    onUpdated()
  }

  return (
    <div className="space-y-3">
      <label className="block text-[12px] text-ink-2">
        Titre *
        <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={500} />
      </label>
      <label className="block text-[12px] text-ink-2">
        Auteur
        <Input value={author} onChange={(e) => setAuthor(e.target.value)} maxLength={300} />
      </label>
      <label className="block text-[12px] text-ink-2">
        ISBN
        <Input value={isbn} onChange={(e) => setIsbn(e.target.value)} maxLength={20} inputMode="numeric" />
      </label>

      <div className="flex justify-between gap-2 pt-2">
        <Button variant="primary" onClick={submit} disabled={!title.trim() || pending}>Valider</Button>
        <Button variant="ghost" onClick={skip} disabled={pending}>Ignorer</Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: `DrawerDuplicate.tsx`**

```typescript
"use client"

import * as React from "react"
import { Button } from "@/components/ui/Button"
import type { ItemForUI } from "./ImportClient"

export function DrawerDuplicate({ item, sessionId, onUpdated }: { item: ItemForUI; sessionId: string; onUpdated: () => void }) {
  const [pending, setPending] = React.useState(false)

  const choose = async (decision: "MERGE" | "CREATE" | "SKIP") => {
    setPending(true)
    await fetch(`/api/admin/bulk-imports/${sessionId}/items/${item.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        decision,
        chosenCandidate: item.chosenCandidate,
        mergeIntoBookId: decision === "MERGE" ? item.mergeIntoBookId : null
      })
    })
    setPending(false)
    onUpdated()
  }

  return (
    <div className="space-y-3">
      <p className="text-[13px] text-ink-2">
        Ce livre semble correspondre a une fiche deja presente dans la bibliotheque.
      </p>
      {item.mergeIntoBookId ? (
        <a
          href={`/bibliotheque/${item.mergeIntoBookId}`}
          target="_blank"
          rel="noreferrer"
          className="inline-block text-[12px] text-[color:var(--accent)] underline"
        >
          Voir la fiche existante →
        </a>
      ) : null}

      <div className="space-y-2 pt-2">
        <Button variant="primary" onClick={() => choose("MERGE")} disabled={pending}>
          Ajouter ma copie a la fiche existante
        </Button>
        <Button variant="secondary" onClick={() => choose("CREATE")} disabled={pending}>
          Creer une nouvelle fiche distincte
        </Button>
        <Button variant="ghost" onClick={() => choose("SKIP")} disabled={pending}>
          Ignorer ce fichier
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Brancher le drawer dans `ImportClient.tsx`**

Ajouter dans `ImportClient` :

```typescript
// State pour le drawer
const [openItemId, setOpenItemId] = React.useState<string | null>(null)

React.useEffect(() => {
  const handler = (e: Event) => {
    const detail = (e as CustomEvent<{ itemId: string }>).detail
    setOpenItemId(detail.itemId)
  }
  window.addEventListener("bulk-import-open-drawer", handler)
  return () => window.removeEventListener("bulk-import-open-drawer", handler)
}, [])

const openItem = items.find((i) => i.id === openItemId) ?? null
const sameStatusItems = openItem ? items.filter((i) => i.status === openItem.status) : []
const idx = openItem ? sameStatusItems.findIndex((i) => i.id === openItem.id) : -1
const onPrev = idx > 0 ? () => setOpenItemId(sameStatusItems[idx - 1].id) : null
const onNext = idx >= 0 && idx < sameStatusItems.length - 1 ? () => setOpenItemId(sameStatusItems[idx + 1].id) : null

const refetch = async () => {
  const res = await fetch(`/api/admin/bulk-imports/${sessionId}`)
  if (res.ok) {
    const body = (await res.json()) as { session: { items: ItemForUI[] } }
    setItems(body.session.items)
  }
}
```

Et dans le JSX retourne par `ImportClient`, juste avant le `</div>` final :

```tsx
{openItem ? (
  <ItemDrawer
    item={openItem}
    sessionId={sessionId}
    onClose={() => setOpenItemId(null)}
    onPrev={onPrev}
    onNext={onNext}
    onUpdated={refetch}
  />
) : null}
```

Importer `ItemDrawer` en haut.

- [ ] **Step 7: Test manuel**

Avec quelques fichiers fixtures :
- Cliquer sur une ligne TO_REVIEW → drawer s'ouvre, picker affiche les candidats, clic "Valider" → status passe AUTO_OK
- Cliquer sur une ligne MANUAL → formulaire, remplir titre, "Valider" → AUTO_OK
- Cliquer sur une ligne DUPLICATE (forcer en uploadant 2 fois le meme livre) → drawer offre Merger / Creer / Ignorer

- [ ] **Step 8: Verifier typecheck + lint**

```bash
npm run typecheck && npm run lint
```

- [ ] **Step 9: Commit**

```bash
git add components/admin/bulk-import/ItemDrawer.tsx components/admin/bulk-import/Drawer*.tsx components/admin/bulk-import/ImportClient.tsx
git commit -m "feat(admin): bulk import drawer drill-down (4 variants)"
```

---

## Task 15: QA E2E + lien sidebar + push branche

**Files:** N/A (test manuel + lien sidebar verifie)

- [ ] **Step 1: Verifier que le lien "Import en masse" est bien present dans la sidebar admin**

`npm run dev`, login admin, verifier la sidebar.

- [ ] **Step 2: Test E2E happy path**

Avec un dossier de 10-15 fichiers (mix EPUB, PDF clean, PDF pourri, doublon) :
1. Aller `/admin/bulk-import`, deposer le dossier
2. Demarrer → redirection page review
3. Verifier : la barre de progression avance, les status apparaissent au fur et a mesure
4. Cliquer "Importer X OK" → message commit
5. Drill-down sur un TO_REVIEW, choisir un candidat, valider
6. Drill-down sur un MANUAL, saisir titre+auteur, valider
7. Drill-down sur un DUPLICATE, choisir Merger
8. Recliquer "Importer X OK" pour finaliser
9. Verifier que la session passe COMMITTED
10. Aller sur `/bibliotheque` : tous les livres sont la, les Books groupes (meme ISBN) ont bien plusieurs copies

- [ ] **Step 3: Test reprise apres crash**

1. Demarrer un import de 5 fichiers
2. Fermer l'onglet apres le start (uploads en cours)
3. Aller sur `/admin/bulk-import` → la session apparait dans "Sessions en cours"
4. Cliquer dessus → la page review s'ouvre, l'etat est restaure (les items uploaded sont la, ceux non uploaded sont absents)
5. Note : sans les Files en sessionStorage, on ne re-upload pas. C'est OK pour V1.4 — l'admin doit recommencer pour les fichiers manquants ou abandonner la session.

- [ ] **Step 4: Test cleanup**

```bash
# Forcer une session vieille (en SQL direct ou via prisma studio)
# UPDATE "BulkImportSession" SET "updatedAt" = NOW() - INTERVAL '8 days' WHERE id = '<id>';
npm run cleanup:pending
```

Verifier que la session passe ABANDONED et les pending files sont purges.

- [ ] **Step 5: Verifier final typecheck + lint + smokes**

```bash
npm run typecheck && npm run lint
npx tsx scripts/match-smoke.ts
npx tsx scripts/scoring-smoke.ts
npx tsx scripts/commit-grouping-smoke.ts
npx tsx scripts/extract-smoke.ts
```

Tout doit passer.

- [ ] **Step 6: Push de la branche et ouvrir une PR**

```bash
git push -u origin feat/bulk-upload
gh pr create --title "feat: bulk upload V1.4 (admin)" --body "$(cat <<'EOF'
## Summary
- Admin peut importer 100+ livres numeriques en une session
- Tableau de review filtrable par status (Auto OK, A voir, Doublon, Manuel)
- Auto-matching ISBN + titre+auteur unique fort
- Commit partiel autorise (importer les Auto OK pendant la review)
- Reprise apres crash (session persistee en DB)
- Cleanup integre dans le cron existant

## Spec & plan
- Spec: docs/superpowers/specs/2026-05-06-bulk-upload-design.md
- Plan: docs/superpowers/plans/2026-05-06-bulk-upload.md

## Test plan
- [x] npm run typecheck && npm run lint
- [x] Smokes : match, scoring, commit-grouping, extract
- [x] E2E happy path (10-15 fichiers mix)
- [x] Reprise apres crash
- [x] Cleanup (force session > 7j)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR creee, l'URL retournee par gh est l'URL a partager. Coolify n'auto-deploie PAS sur cette branche.

---

## Auto-review (a faire par l'engineer apres execution)

- [ ] Tous les tasks (0-15) completes
- [ ] Aucune erreur typecheck / lint
- [ ] Tous les smokes passent
- [ ] Test E2E manuel valide
- [ ] PR ouverte mais NON mergee dans main avant validation user
