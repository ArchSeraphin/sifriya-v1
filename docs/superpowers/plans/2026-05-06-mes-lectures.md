# V1.4 — Mes Lectures Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cabler la feature "Mes Lectures" (modèle `Reading` existant en DB depuis V0). Sélecteur 4 chips sur la fiche, bookmark rapide sur les BookCard pour la wishlist, page `/mes-lectures` avec 3 onglets. Privé strict, aucun croisement entre users.

**Architecture:** Refactor minimal. Pas de modification de schéma (`Reading` existe avec cascade onDelete depuis V1.3). 3 nouveaux endpoints API, 2 nouveaux composants UI, 4 fichiers existants modifiés. Branche dédiée `feat/v1-4-mes-lectures`.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Prisma 7, Postgres 17, next-auth v4, Tailwind v4, Zod v4, Lucide React.

**Convention projet — pas de TDD :** ce projet n'a pas de framework de test installé (cf. mémoire `feedback_conventions`). Les étapes "test fail → impl → test pass" sont remplacées par : implémenter → `tsc --noEmit` → smoke partiel manuel → commit.

**Branche de travail :** `feat/v1-4-mes-lectures`. Tous les commits du plan vivent dessus. Merge dans `main` à la fin.

---

## Setup — branche

### Task 0.1 : Créer la branche feature

**Files:** aucun (opération git).

- [ ] **Step 1 : Créer la branche depuis `main` à jour**

```bash
git checkout main
git pull --ff-only
git checkout -b feat/v1-4-mes-lectures
```

---

## Phase 1 — API endpoints `/api/readings`

### Task 1.1 : Créer `lib/readings.ts` — DTO partagé

**Files:**
- Create: `lib/readings.ts`

- [ ] **Step 1 : Créer le fichier**

```typescript
// lib/readings.ts
// DTO et selects partages pour les Readings (statut de lecture par user).
// Cascade onDelete: Cascade sur user et book deja en place (V1.3).

import type { ReadingStatus } from "@prisma/client"

export type ReadingDTO = {
  id: string
  status: ReadingStatus
  addedAt: Date
  updatedAt: Date
}

export const PUBLIC_READING_SELECT = {
  id: true,
  status: true,
  addedAt: true,
  updatedAt: true
} as const
```

- [ ] **Step 2 : Commit**

```bash
git add lib/readings.ts
git commit -m "feat(lib): add readings DTO + select"
```

### Task 1.2 : Créer `app/api/readings/[bookId]/route.ts` (PUT + DELETE)

**Files:**
- Create: `app/api/readings/[bookId]/route.ts`

- [ ] **Step 1 : Créer le fichier**

```typescript
// app/api/readings/[bookId]/route.ts
import { NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { PUBLIC_READING_SELECT } from "@/lib/readings"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const StatusBody = z.object({
  status: z.enum(["TO_READ", "READING", "READ"])
})

export async function PUT(req: Request, ctx: { params: Promise<{ bookId: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Non authentifie." }, { status: 401 })

  const { bookId } = await ctx.params

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 })
  }
  const parsed = StatusBody.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: "Statut invalide." }, { status: 400 })
  }

  const book = await db.book.findUnique({ where: { id: bookId }, select: { id: true } })
  if (!book) return NextResponse.json({ error: "Livre introuvable." }, { status: 404 })

  const reading = await db.reading.upsert({
    where: { userId_bookId: { userId: session.user.id, bookId } },
    update: { status: parsed.data.status },
    create: { userId: session.user.id, bookId, status: parsed.data.status },
    select: PUBLIC_READING_SELECT
  })

  return NextResponse.json({ reading }, { status: 200 })
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ bookId: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Non authentifie." }, { status: 401 })

  const { bookId } = await ctx.params

  // Idempotent : on accepte le cas ou la row n'existe pas.
  await db.reading
    .delete({
      where: { userId_bookId: { userId: session.user.id, bookId } }
    })
    .catch((err) => {
      // P2025 = "Record to delete does not exist" — on ignore.
      if (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code?: string }).code === "P2025"
      ) {
        return
      }
      throw err
    })

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2 : Commit**

```bash
git add "app/api/readings/[bookId]/route.ts"
git commit -m "feat(api): PUT/DELETE /api/readings/[bookId] (upsert + idempotent delete)"
```

### Task 1.3 : Créer `app/api/readings/route.ts` (GET groupé)

**Files:**
- Create: `app/api/readings/route.ts`

- [ ] **Step 1 : Créer le fichier**

```typescript
// app/api/readings/route.ts
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { PUBLIC_BOOK_SELECT } from "@/lib/books"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(_req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Non authentifie." }, { status: 401 })

  const userId = session.user.id

  // 3 fetch parallèles, groupés par status. Tri : Reading.addedAt desc.
  const [toReadRows, readingRows, readRows] = await Promise.all([
    db.reading.findMany({
      where: { userId, status: "TO_READ" },
      orderBy: { addedAt: "desc" },
      select: { book: { select: PUBLIC_BOOK_SELECT } }
    }),
    db.reading.findMany({
      where: { userId, status: "READING" },
      orderBy: { addedAt: "desc" },
      select: { book: { select: PUBLIC_BOOK_SELECT } }
    }),
    db.reading.findMany({
      where: { userId, status: "READ" },
      orderBy: { addedAt: "desc" },
      select: { book: { select: PUBLIC_BOOK_SELECT } }
    })
  ])

  return NextResponse.json({
    toRead: toReadRows.map((r) => r.book),
    reading: readingRows.map((r) => r.book),
    read: readRows.map((r) => r.book)
  })
}
```

- [ ] **Step 2 : Commit**

```bash
git add app/api/readings/route.ts
git commit -m "feat(api): GET /api/readings (3 listes groupees par statut)"
```

---

## Phase 2 — Composant `<ReadingStatusPicker>`

### Task 2.1 : Créer `components/books/ReadingStatusPicker.tsx`

**Files:**
- Create: `components/books/ReadingStatusPicker.tsx`

- [ ] **Step 1 : Créer le fichier**

```typescript
"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import type { ReadingStatus } from "@prisma/client"

type Props = {
  bookId: string
  currentStatus: ReadingStatus | null
}

const OPTIONS: ReadonlyArray<{ value: ReadingStatus | null; label: string }> = [
  { value: null, label: "Aucun statut" },
  { value: "TO_READ", label: "A lire" },
  { value: "READING", label: "En cours" },
  { value: "READ", label: "Lu" }
]

export function ReadingStatusPicker({ bookId, currentStatus }: Props) {
  const router = useRouter()
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const setStatus = async (next: ReadingStatus | null) => {
    if (next === currentStatus) return
    setPending(true)
    setError(null)
    const res =
      next === null
        ? await fetch(`/api/readings/${bookId}`, { method: "DELETE" })
        : await fetch(`/api/readings/${bookId}`, {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ status: next })
          })
    setPending(false)
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null
      setError(body?.error ?? "Echec de la mise a jour.")
      return
    }
    router.refresh()
  }

  return (
    <div className="space-y-1">
      <p className="text-[11px] font-medium uppercase tracking-widest text-ink-4">Mes lectures</p>
      <div className="flex flex-wrap gap-1.5">
        {OPTIONS.map((opt) => {
          const active = opt.value === currentStatus
          return (
            <button
              key={opt.value ?? "none"}
              type="button"
              onClick={() => setStatus(opt.value)}
              disabled={pending}
              className={
                active
                  ? "inline-flex h-7 items-center rounded-full bg-accent px-3 text-[12px] font-medium text-accent-ink shadow-[var(--shadow-1)]"
                  : "inline-flex h-7 items-center rounded-full border border-[var(--rule)] bg-paper px-3 text-[12px] text-ink-2 shadow-[var(--shadow-1)] transition hover:bg-paper-2 hover:text-ink disabled:opacity-60"
              }
              style={pending ? { opacity: 0.6 } : undefined}
              aria-pressed={active}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
      {error ? <p className="text-[12px] text-[color:var(--err)]">{error}</p> : null}
    </div>
  )
}
```

- [ ] **Step 2 : Commit**

```bash
git add components/books/ReadingStatusPicker.tsx
git commit -m "feat(ui): ReadingStatusPicker (4 chips Aucun/A lire/En cours/Lu)"
```

---

## Phase 3 — Composant `<BookmarkButton>`

### Task 3.1 : Créer `components/books/BookmarkButton.tsx`

**Files:**
- Create: `components/books/BookmarkButton.tsx`

- [ ] **Step 1 : Créer le fichier**

```typescript
"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Bookmark, BookOpen, CircleCheck } from "lucide-react"
import type { ReadingStatus } from "@prisma/client"

type Props = {
  bookId: string
  status: ReadingStatus | null
}

// Bouton overlay sur la cover d'une BookCard.
// - Pas de Reading      : Bookmark outlined, click -> PUT TO_READ
// - TO_READ             : Bookmark plein dore, click -> DELETE (toggle off)
// - READING             : BookOpen non-cliquable (geree depuis la fiche)
// - READ                : CircleCheck non-cliquable
export function BookmarkButton({ bookId, status }: Props) {
  const router = useRouter()
  const [pending, setPending] = React.useState(false)

  const interactive = status === null || status === "TO_READ"
  const tooltip =
    status === "READING" || status === "READ" ? "Statut gere depuis la fiche" : undefined

  const onClick = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!interactive || pending) return
    setPending(true)
    const res =
      status === "TO_READ"
        ? await fetch(`/api/readings/${bookId}`, { method: "DELETE" })
        : await fetch(`/api/readings/${bookId}`, {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ status: "TO_READ" })
          })
    setPending(false)
    if (res.ok) router.refresh()
  }

  const icon =
    status === "READING" ? (
      <BookOpen size={16} />
    ) : status === "READ" ? (
      <CircleCheck size={16} />
    ) : (
      <Bookmark size={16} fill={status === "TO_READ" ? "currentColor" : "none"} />
    )

  const label =
    status === "TO_READ"
      ? "Retirer de ma liste"
      : status === "READING"
        ? "En cours de lecture"
        : status === "READ"
          ? "Lu"
          : "Ajouter a ma liste"

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!interactive || pending}
      title={tooltip}
      aria-label={label}
      className={
        interactive
          ? "absolute right-1.5 top-1.5 z-[3] inline-flex h-7 w-7 items-center justify-center rounded-full bg-paper/85 text-accent shadow-[var(--shadow-1)] backdrop-blur-sm transition hover:bg-paper disabled:opacity-50"
          : "absolute right-1.5 top-1.5 z-[3] inline-flex h-7 w-7 cursor-default items-center justify-center rounded-full bg-paper/85 text-accent shadow-[var(--shadow-1)] backdrop-blur-sm"
      }
    >
      {icon}
    </button>
  )
}
```

- [ ] **Step 2 : Commit**

```bash
git add components/books/BookmarkButton.tsx
git commit -m "feat(ui): BookmarkButton (overlay sur BookCard, toggle TO_READ)"
```

---

## Phase 4 — Intégration `BookCard` + `BookGrid` + `BookList`

### Task 4.1 : Modifier `BookCard.tsx` pour rendre `<BookmarkButton>`

**Files:**
- Modify: `components/books/BookCard.tsx`

- [ ] **Step 1 : Lire le fichier actuel pour repérer la prop interface et le rendu de la cover**

```bash
cat components/books/BookCard.tsx
```

- [ ] **Step 2 : Modifications à appliquer**

1. Ajouter import en haut du fichier :

```typescript
import type { ReadingStatus } from "@prisma/client"
import { BookmarkButton } from "@/components/books/BookmarkButton"
```

2. Étendre les props pour accepter `readingStatus`:

```typescript
type Props = {
  book: BookListed
  readingStatus?: ReadingStatus | null
}
```

(Adapter le destructuring : `function BookCard({ book, readingStatus }: Props)`)

3. **Avant** le `<Cover>` ou juste après, dans le wrapper `position: relative` qui contient la cover, ajouter :

```tsx
{readingStatus !== undefined ? (
  <BookmarkButton bookId={book.id} status={readingStatus ?? null} />
) : null}
```

(Le `readingStatus !== undefined` permet de ne pas afficher le bouton dans les contextes où on ne passe pas la prop — fallback safe.)

4. Vérifier que le wrapper de la cover a bien `relative` dans ses classes (sinon ajouter `relative`). Le `BookmarkButton` utilise `position: absolute` sur le parent.

- [ ] **Step 3 : Commit**

```bash
git add components/books/BookCard.tsx
git commit -m "feat(ui): BookCard accepte readingStatus et rend BookmarkButton"
```

### Task 4.2 : Modifier `BookGrid.tsx` pour propager `readingByBookId`

**Files:**
- Modify: `components/books/BookGrid.tsx`

- [ ] **Step 1 : Lire le fichier**

```bash
cat components/books/BookGrid.tsx
```

- [ ] **Step 2 : Modifications**

1. Ajouter import :

```typescript
import type { ReadingStatus } from "@prisma/client"
```

2. Étendre les props :

```typescript
type Props = {
  books: BookListed[]
  // Map { bookId -> ReadingStatus }. Si undefined, BookCard ne rend pas le BookmarkButton.
  readingByBookId?: Map<string, ReadingStatus>
}
```

3. Adapter le destructuring : `function BookGrid({ books, readingByBookId }: Props)`

4. Dans le map, propager :

```tsx
<BookCard
  book={book}
  readingStatus={readingByBookId ? (readingByBookId.get(book.id) ?? null) : undefined}
  ... // autres props existantes inchangees
/>
```

- [ ] **Step 3 : Commit**

```bash
git add components/books/BookGrid.tsx
git commit -m "feat(ui): BookGrid propage readingByBookId aux BookCard"
```

### Task 4.3 : `BookList.tsx` — pas de modification

`BookList` est une vue tableau plus dense — la spec V1.4 ne l'inclut pas dans la propagation du statut Reading (cf. spec §3, "Optionnel : on n'ajoute pas pour V1.4"). Aucune modif. Skip.

---

## Phase 5 — Intégration `BookDetail` + page fiche

### Task 5.1 : Modifier `BookDetail.tsx` pour rendre `<ReadingStatusPicker>`

**Files:**
- Modify: `components/books/BookDetail.tsx`

- [ ] **Step 1 : Lire le fichier actuel**

```bash
cat components/books/BookDetail.tsx
```

- [ ] **Step 2 : Modifications**

1. Ajouter imports :

```typescript
import type { ReadingStatus } from "@prisma/client"
import { ReadingStatusPicker } from "@/components/books/ReadingStatusPicker"
```

2. Étendre les `Props` :

```typescript
type Props = {
  book: BookDetailDTO
  currentUser: { id: string; role: "ADMIN" | "USER" }
  activeLoansByCopy: Record<string, { id: string; status: "PENDING" | "ACCEPTED"; requester: { id: string; name: string | null; email: string; avatarColor: string } }>
  myActiveRequestsByCopy: Record<string, { id: string; status: "PENDING" | "ACCEPTED" }>
  currentReading?: { status: ReadingStatus } | null
}
```

3. Adapter le destructuring :

```typescript
export function BookDetail({
  book,
  currentUser,
  activeLoansByCopy,
  myActiveRequestsByCopy,
  currentReading
}: Props) {
```

4. Rendre `<ReadingStatusPicker>` **après les badges format/physique et avant le titre `<h1>`**. Concrètement, juste après la `<div className="flex flex-wrap items-center gap-2">{formats.map(...)}{physicalsCount...}</div>` et avant `<h1 className="mt-3 ...">{book.title}</h1>`, intercaler :

```tsx
<div className="mt-4">
  <ReadingStatusPicker
    bookId={book.id}
    currentStatus={currentReading?.status ?? null}
  />
</div>
```

- [ ] **Step 3 : Commit**

```bash
git add components/books/BookDetail.tsx
git commit -m "feat(ui): BookDetail rend ReadingStatusPicker"
```

### Task 5.2 : Modifier `app/(app)/bibliotheque/[id]/page.tsx` pour charger la Reading

**Files:**
- Modify: `app/(app)/bibliotheque/[id]/page.tsx`

- [ ] **Step 1 : Modifier la page pour ajouter le fetch de la Reading**

Dans le `Promise.all` existant qui charge `activeLoans` et `myRequests`, ajouter un 3e fetch pour la Reading single de l'user courant. Remplacer le bloc :

```typescript
const [activeLoans, myRequests] = await Promise.all([
  ...
])
```

par :

```typescript
const [activeLoans, myRequests, currentReading] = await Promise.all([
  // ... activeLoans existant inchange
  // ... myRequests existant inchange
  db.reading.findUnique({
    where: { userId_bookId: { userId: session.user.id, bookId: id } },
    select: { status: true }
  })
])
```

- [ ] **Step 2 : Passer la prop à `<BookDetail>`**

Dans le `return <BookDetail ... />` final, ajouter `currentReading={currentReading}` :

```tsx
return (
  <BookDetail
    book={book}
    currentUser={{ id: session.user.id, role: session.user.role }}
    activeLoansByCopy={activeLoansByCopy}
    myActiveRequestsByCopy={myActiveRequestsByCopy}
    currentReading={currentReading}
  />
)
```

- [ ] **Step 3 : Commit**

```bash
git add "app/(app)/bibliotheque/[id]/page.tsx"
git commit -m "feat(pages): /bibliotheque/[id] charge la Reading + transmet a BookDetail"
```

---

## Phase 6 — Intégration des pages catalogue

### Task 6.1 : Modifier `app/(app)/bibliotheque/page.tsx` pour charger les Readings

**Files:**
- Modify: `app/(app)/bibliotheque/page.tsx`

- [ ] **Step 1 : Lire le fichier**

```bash
cat "app/(app)/bibliotheque/page.tsx"
```

- [ ] **Step 2 : Modifications**

Localiser le `db.book.findMany` qui charge la liste paginée. Juste après ce fetch (ou en parallèle si possible), ajouter :

```typescript
const readings = await db.reading.findMany({
  where: {
    userId: session.user.id,
    bookId: { in: books.map((b) => b.id) }
  },
  select: { bookId: true, status: true }
})
const readingByBookId = new Map(readings.map((r) => [r.bookId, r.status] as const))
```

Puis passer la prop à `<BookGrid>` :

```tsx
<BookGrid books={books} readingByBookId={readingByBookId} />
```

**Note** : si la page utilise `<BookList>` aussi (toggle vue), `BookList` n'accepte pas la prop (Phase 4.3 — pas de modif). Pas grave, le fallback safe (`readingByBookId` undefined) signifie que `BookList` n'affichera pas le statut. C'est attendu pour V1.4.

Si possible, paralléliser avec le fetch des books :

```typescript
const [{ books, total, totalPages }, readings] = await Promise.all([
  fetchBooksAndPagination(...),
  // Mais attention : on a besoin des bookIds pour filtrer les readings.
  // Donc on fait sequentiel : books d'abord, puis readings.
  Promise.resolve(null) // placeholder, voir code reel
])
```

En pratique, le pattern `bookIds dépend de books` impose deux étapes :

```typescript
const books = await db.book.findMany(...)
const readings = await db.reading.findMany({ where: { userId, bookId: { in: books.map(b => b.id) } } })
```

C'est OK : Postgres exécute le 2e SELECT en quelques ms.

- [ ] **Step 3 : Commit**

```bash
git add "app/(app)/bibliotheque/page.tsx"
git commit -m "feat(pages): /bibliotheque charge readingByBookId pour BookGrid"
```

### Task 6.2 : Modifier `app/(app)/mes-livres/page.tsx` pour charger les Readings

**Files:**
- Modify: `app/(app)/mes-livres/page.tsx`

- [ ] **Step 1 : Lire le fichier**

```bash
cat "app/(app)/mes-livres/page.tsx"
```

- [ ] **Step 2 : Appliquer le même pattern que Task 6.1**

```typescript
const books = await db.book.findMany({
  where: { copies: { some: { addedById: session.user.id } } },
  orderBy: { addedAt: "desc" },
  select: PUBLIC_BOOK_SELECT
})

const readings = await db.reading.findMany({
  where: {
    userId: session.user.id,
    bookId: { in: books.map((b) => b.id) }
  },
  select: { bookId: true, status: true }
})
const readingByBookId = new Map(readings.map((r) => [r.bookId, r.status] as const))
```

Passer à `<BookGrid>` : `<BookGrid books={books} readingByBookId={readingByBookId} />`

- [ ] **Step 3 : Commit**

```bash
git add "app/(app)/mes-livres/page.tsx"
git commit -m "feat(pages): /mes-livres charge readingByBookId pour BookGrid"
```

---

## Phase 7 — Page `/mes-lectures` complète

### Task 7.1 : Réécrire `app/(app)/mes-lectures/page.tsx`

**Files:**
- Modify: `app/(app)/mes-lectures/page.tsx` (réécriture complète)

- [ ] **Step 1 : Remplacer entièrement le contenu**

```typescript
import type { Metadata } from "next"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Bookmark, BookOpen, CircleCheck } from "lucide-react"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { PUBLIC_BOOK_SELECT } from "@/lib/books"
import { BookGrid } from "@/components/books/BookGrid"
import type { ReadingStatus } from "@prisma/client"

export const metadata: Metadata = {
  title: "Mes lectures"
}

export const dynamic = "force-dynamic"

type Tab = "to-read" | "reading" | "read"

const TAB_TO_STATUS: Record<Tab, ReadingStatus> = {
  "to-read": "TO_READ",
  reading: "READING",
  read: "READ"
}

const TABS: ReadonlyArray<{
  key: Tab
  label: string
  empty: string
  Icon: typeof Bookmark
}> = [
  {
    key: "to-read",
    label: "A lire",
    empty: "Vous n'avez encore rien marque a lire.",
    Icon: Bookmark
  },
  {
    key: "reading",
    label: "En cours",
    empty: "Aucun livre en cours de lecture.",
    Icon: BookOpen
  },
  {
    key: "read",
    label: "Lu",
    empty: "Aucun livre marque comme lu pour le moment.",
    Icon: CircleCheck
  }
]

function parseTab(raw: string | string[] | undefined): Tab {
  if (raw === "reading" || raw === "read" || raw === "to-read") return raw
  return "to-read"
}

export default async function MesLecturesPage(props: {
  searchParams: Promise<{ tab?: string }>
}) {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect("/login")
  const userId = session.user.id

  const { tab: rawTab } = await props.searchParams
  const tab = parseTab(rawTab)
  const status = TAB_TO_STATUS[tab]

  // Compteurs pour les onglets + Books de l'onglet courant.
  const [toReadCount, readingCount, readCount, rows] = await Promise.all([
    db.reading.count({ where: { userId, status: "TO_READ" } }),
    db.reading.count({ where: { userId, status: "READING" } }),
    db.reading.count({ where: { userId, status: "READ" } }),
    db.reading.findMany({
      where: { userId, status },
      orderBy: { addedAt: "desc" },
      select: { book: { select: PUBLIC_BOOK_SELECT } }
    })
  ])

  const counts: Record<Tab, number> = {
    "to-read": toReadCount,
    reading: readingCount,
    read: readCount
  }

  const books = rows.map((r) => r.book)
  // Toutes les Books de la page courante ont le statut courant -> map directe.
  const readingByBookId = new Map(books.map((b) => [b.id, status] as const))

  const empty = TABS.find((t) => t.key === tab)!.empty

  return (
    <section className="mx-auto max-w-6xl">
      <header className="mb-6">
        <h1 className="font-serif text-3xl text-ink">Mes lectures</h1>
        <p className="mt-1 text-sm text-ink-3">
          Suivez les livres que vous voulez lire, lisez ou avez lus.
        </p>
      </header>

      <nav className="mb-6 flex flex-wrap gap-2 border-b border-[var(--rule-2)] pb-3">
        {TABS.map((t) => {
          const active = t.key === tab
          const Icon = t.Icon
          return (
            <Link
              key={t.key}
              href={t.key === "to-read" ? "/mes-lectures" : `/mes-lectures?tab=${t.key}`}
              className={
                active
                  ? "inline-flex h-9 items-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-accent-ink shadow-[var(--shadow-1)]"
                  : "inline-flex h-9 items-center gap-2 rounded-md border border-[var(--rule)] bg-paper px-4 text-sm text-ink-2 shadow-[var(--shadow-1)] transition hover:bg-paper-2 hover:text-ink"
              }
              aria-current={active ? "page" : undefined}
            >
              <Icon size={14} />
              {t.label}
              <span
                className={
                  active
                    ? "rounded-full bg-[rgba(255,255,255,0.2)] px-1.5 text-[11px]"
                    : "rounded-full bg-paper-2 px-1.5 text-[11px] text-ink-3"
                }
              >
                {counts[t.key]}
              </span>
            </Link>
          )
        })}
      </nav>

      {books.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--rule)] bg-paper-2/40 p-10 text-center text-[13px] text-ink-3">
          {empty}
        </div>
      ) : (
        <BookGrid books={books} readingByBookId={readingByBookId} />
      )}
    </section>
  )
}
```

- [ ] **Step 2 : Commit**

```bash
git add "app/(app)/mes-lectures/page.tsx"
git commit -m "feat(pages): /mes-lectures avec 3 onglets + compteurs SSR"
```

---

## Phase 8 — Compile + smoke E2E + doc

### Task 8.1 : Compilation TypeScript propre

**Files:** aucun (vérification).

- [ ] **Step 1 : Build TS strict**

```bash
npx tsc --noEmit
```

Expected : zéro erreur. Si erreurs résiduelles (signature de prop manquante, import oublié), les corriger.

- [ ] **Step 2 : Build Next**

```bash
npm run build
```

Expected : build OK. Les routes `/api/readings` et `/api/readings/[bookId]` doivent apparaître dans la liste des routes générées.

- [ ] **Step 3 : Commit (si fix en cascade)**

```bash
git add -A
git commit -m "chore: fixs compilation V1.4 (cascade)"
```

### Task 8.2 : Smoke test E2E manuel

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

- [ ] **Step 3 : Dérouler les 14 scénarios listés en spec §6**

```
1.  Click bookmark sur card du catalogue                → icône passe en plein doré
2.  Click à nouveau bookmark sur la même card           → icône revient outlined
3.  Sur la fiche, click "À lire" dans le picker         → chip remplie, bookmark plein
4.  Sur la fiche, click "En cours"                      → bookmark devient BookOpen non-cliquable
5.  Sur la fiche, click "Lu"                            → bookmark devient CircleCheck
6.  Sur la fiche, click "Aucun statut"                  → bookmark revient outlined
7.  Aller sur /mes-lectures                             → onglet "À lire" actif, livres listés
8.  Switcher onglet "En cours"                          → URL ?tab=reading, livres listés
9.  Onglet "Lu"                                         → livres READ listés
10. Back/forward navigateur                             → onglet bien restauré
11. Onglet vide                                         → texte "Vous n'avez encore rien..."
12. User B se connecte, marque ses lectures             → ne voit pas celles de user A
13. Supprimer un Book qu'on avait marqué READ           → Reading disparaît, compteur "Lu" -1
14. Deux users marquent le même livre à des statuts ≠   → chacun voit son propre statut sur sa card
```

Pour multi-users : `npx tsx scripts/dev-magic-link.ts alice@test.fr` puis `bob@test.fr`.

### Task 8.3 : Mettre à jour `PROGRESS.md`

**Files:**
- Modify: `PROGRESS.md`

- [ ] **Step 1 : Ajouter la ligne V1.4 dans le tableau "Versions livrées"**

Après la ligne V1.3, ajouter :

```
| **V1.4** | branche `feat/v1-4-mes-lectures` | **Mes Lectures** : sélecteur 4 chips sur la fiche (`Aucun · À lire · En cours · Lu`), bookmark rapide sur les BookCard pour la wishlist, page `/mes-lectures` avec 3 onglets et compteurs. Privé strict. Spec : `docs/superpowers/specs/2026-05-06-mes-lectures-design.md`. |
```

- [ ] **Step 2 : Mettre à jour la section "Pages" pour refléter `/mes-lectures` opérationnelle**

Remplacer la ligne :
```
/mes-lectures                   placeholder V0 (aucune logique métier encore)
```
par :
```
/mes-lectures                   onglets À lire / En cours / Lu (?tab=...) avec compteurs
```

- [ ] **Step 3 : Mettre à jour la section "API"**

Ajouter dans le bloc `/api/...` :
```
PUT    /api/readings/[bookId]                 upsert statut (TO_READ | READING | READ)
DELETE /api/readings/[bookId]                 retire la Reading (idempotent)
GET    /api/readings                          3 listes groupées (toRead, reading, read)
```

- [ ] **Step 4 : Commit**

```bash
git add PROGRESS.md
git commit -m "docs(progress): V1.4 livree (Mes Lectures)"
```

### Task 8.4 : Push et merge

**Files:** aucun (opération git).

- [ ] **Step 1 : Push branche feature**

```bash
git push -u origin feat/v1-4-mes-lectures
```

- [ ] **Step 2 : Demander au user comment intégrer**

Sortie : message au user proposant les options (PR sur GitHub ? merge direct dans `main` ?). Cette tâche n'execute aucun merge automatique — elle attend l'instruction explicite du user (ou si le user a déjà donné son go en auto-mode, merger directement avec `--no-ff` puis `git push origin main`).

---

## Self-Review (faite à l'écriture du plan)

**Spec coverage :**
- Section 1 (modèle de données — pas de modif) → pas de tâche schéma, OK ✅
- Section 2 (API PUT/DELETE/GET) → Tasks 1.1, 1.2, 1.3 ✅
- Section 3 (UI ReadingStatusPicker, BookmarkButton, BookCard, BookDetail, /mes-lectures) → Tasks 2.1, 3.1, 4.1, 5.1, 7.1 ✅
- Section 4 (charge SSR readingByBookId dans /bibliotheque, /mes-livres, /mes-lectures + currentReading dans /bibliotheque/[id]) → Tasks 5.2, 6.1, 6.2, 7.1 ✅
- Section 5 (edge cases) → couverts par les implémentations (idempotence DELETE, fallback BookCard sans prop) ✅
- Section 6 (smoke E2E 14 scénarios) → Task 8.2 ✅
- Section 7 (hors scope) → respecté (rien d'ajouté hors scope) ✅

**Placeholder scan :** aucun TBD/TODO. Tous les codes sont complets. La task 4.3 dit "skip", c'est explicite et conforme à la spec §3.

**Type consistency :**
- `ReadingStatus` importé partout depuis `@prisma/client`
- `BookmarkButton` props `{ bookId, status }` — cohérent dans Task 3.1, 4.1, 6.1
- `ReadingStatusPicker` props `{ bookId, currentStatus }` — cohérent dans Task 2.1, 5.1
- `readingByBookId: Map<string, ReadingStatus>` — cohérent dans Tasks 4.2, 6.1, 6.2, 7.1
- `currentReading?: { status: ReadingStatus } | null` — cohérent dans Tasks 5.1, 5.2

Aucune incohérence détectée.
