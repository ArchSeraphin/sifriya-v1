# V1.6 — Bibliothèques restreintes + Planches Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Livrer la V1.6 : système de bibliothèques restreintes par groupes d'users (Library + LibraryMembership + scoping `BookCopy.libraryId`) + 4ème mode d'ajout "Planche" (écrit personnel avec propriétaire, `Book.isPersonal=true`). Spec : `docs/superpowers/specs/2026-05-12-bibliotheques-et-planches-design.md`.

**Architecture:** 2 nouveaux modèles Prisma (`Library`, `LibraryMembership`), 2 modifs (`Book.isPersonal`, `BookCopy.libraryId` obligatoire). Helper centralisé `lib/libraries.ts` pour la visibilité (ADMIN super-visibilité + USER via membership). 6 nouvelles routes API sous `/api/libraries/*` + adaptations de 9 routes existantes pour appliquer le filtre. UI : section sidebar, page `/bibliotheques/[id]`, pages admin, sélecteur de bib intégré à AddBookFlow, nouveau `PlancheFlow`. Migration custom Prisma avec backfill : seed `lib_generale` + membership tous les users existants + assigne `libraryId` à toutes les copies actuelles.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Prisma 7, PostgreSQL 17, next-auth v4, Tailwind v4, Zod v4, Lucide React.

**Convention projet — pas de TDD strict :** ce projet n'a pas de framework de test installé (cf. mémoire `feedback_conventions`). Les étapes "test fail → impl → test pass" sont remplacées par : implémenter → `npm run typecheck` → smoke test custom (`scripts/*-smoke.ts`) si pertinent → smoke manuel → commit. `npm run lint` casse Next 16 — ne pas l'utiliser (cf. mémoire `feedback_gotchas`).

**Conventions UI (rappel mémoire) :** FR partout, zéro emoji dans l'UI, zéro hex hardcodé (tokens CSS dans `globals.css`), Lucide icons uniquement, Zod strict côté API.

**Branche de travail :** `feat/v1-6-bibliotheques`. Tous les commits du plan vivent dessus. Merge dans `main` à la fin via PR ou squash-merge direct selon préférence.

---

## Setup — branche

### Task 0.1 : Créer la branche feature

**Files:** aucun (opération git).

- [ ] **Step 1 : Créer la branche depuis `main` à jour**

```bash
git checkout main
git pull --ff-only
git checkout -b feat/v1-6-bibliotheques
```

---

## Phase 1 — Schéma Prisma & migration

### Task 1.1 : Ajouter les modèles `Library` + `LibraryMembership`

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1 : Ajouter les modèles dans `prisma/schema.prisma`** (après le bloc `// ----- Sifriya domain -----`, avant `model User`)

```prisma
model Library {
  id          String   @id @default(cuid())
  name        String
  description String?
  isDefault   Boolean  @default(false)
  managerId   String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  manager     User?                @relation("LibraryManager", fields: [managerId], references: [id])
  memberships LibraryMembership[]
  copies      BookCopy[]

  @@index([isDefault])
  @@index([managerId])
}

model LibraryMembership {
  id        String   @id @default(cuid())
  libraryId String
  userId    String
  addedAt   DateTime @default(now())

  library   Library @relation(fields: [libraryId], references: [id], onDelete: Cascade)
  user      User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([libraryId, userId])
  @@index([userId])
}
```

- [ ] **Step 2 : Ajouter les relations dans `model User`**

Ajouter (à la fin du bloc, avant les relations `bulkImportSessions`) :

```prisma
  managedLibraries Library[]            @relation("LibraryManager")
  memberships      LibraryMembership[]
```

- [ ] **Step 3 : Ajouter `isPersonal` dans `model Book`**

Ajouter avant `addedAt` :

```prisma
  isPersonal Boolean @default(false)
```

- [ ] **Step 4 : Ajouter `libraryId` dans `model BookCopy`**

Ajouter avant `ownerId`, en **nullable temporairement** pour permettre le backfill custom :

```prisma
  libraryId String?
  library   Library? @relation(fields: [libraryId], references: [id])
```

Ajouter l'index correspondant en bas du modèle :

```prisma
  @@index([libraryId])
```

- [ ] **Step 5 : Valider la syntaxe Prisma**

```bash
npx prisma format
npx prisma validate
```

Expected: aucune erreur.

### Task 1.2 : Créer la migration custom avec backfill

**Files:**
- Create: `prisma/migrations/<timestamp>_add_libraries_and_personal_books/migration.sql`

- [ ] **Step 1 : Générer la migration sans appliquer**

```bash
npx prisma migrate dev --create-only --name add_libraries_and_personal_books
```

Expected: un nouveau dossier sous `prisma/migrations/` avec un `migration.sql` auto-généré.

- [ ] **Step 2 : Éditer le `migration.sql` généré**

Garder les `CREATE TABLE` / `ALTER TABLE` générés par Prisma. **Insérer le backfill juste avant** la commande qui passe `libraryId` à `NOT NULL` (si elle n'y est pas, on l'ajoutera).

Structure attendue du fichier final :

```sql
-- 1. Création tables Library, LibraryMembership (généré par Prisma)
CREATE TABLE "Library" (...);
CREATE TABLE "LibraryMembership" (...);
CREATE UNIQUE INDEX ... ON "LibraryMembership"("libraryId", "userId");
CREATE INDEX ... ;

-- 2. Ajout Book.isPersonal (généré par Prisma)
ALTER TABLE "Book" ADD COLUMN "isPersonal" BOOLEAN NOT NULL DEFAULT false;

-- 3. Ajout BookCopy.libraryId nullable (généré par Prisma)
ALTER TABLE "BookCopy" ADD COLUMN "libraryId" TEXT;
CREATE INDEX ... ON "BookCopy"("libraryId");

-- 4. FK BookCopy -> Library (généré par Prisma)
ALTER TABLE "BookCopy" ADD CONSTRAINT ... FOREIGN KEY ("libraryId") REFERENCES "Library"("id") ...;

-- 5. BACKFILL DATA — ajouté à la main
INSERT INTO "Library" (id, name, "isDefault", "createdAt", "updatedAt")
VALUES ('lib_generale', 'Bibliothèque générale', true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO "LibraryMembership" (id, "libraryId", "userId", "addedAt")
SELECT gen_random_uuid()::text, 'lib_generale', id, NOW()
FROM "User"
ON CONFLICT ("libraryId", "userId") DO NOTHING;

UPDATE "BookCopy" SET "libraryId" = 'lib_generale' WHERE "libraryId" IS NULL;

-- 6. Lock — passer libraryId à NOT NULL
ALTER TABLE "BookCopy" ALTER COLUMN "libraryId" SET NOT NULL;
```

⚠️ Si la migration générée par Prisma ne contient pas la transition vers `NOT NULL` (car le schema l'a en `String?`), il faut **modifier le schema** à cette étape : passer `libraryId String?` → `libraryId String` et regénérer ? **Non** — meilleure approche : garder `libraryId String?` dans le schema TANT QUE la migration ne tourne pas, puis (Task 1.4) basculer à `String` et générer une 2e migration "lock_library_id_not_null". Cela évite de bidouiller `migration.sql` à la main pour la contrainte NOT NULL.

**Reformulation propre du flow** :
- Migration 1 (cette task) : tables + colonnes nullable + backfill data.
- Task 1.4 (plus bas) : schema modifié pour passer `libraryId` à `String` + nouvelle migration "lock_book_copy_library_id".

Donc dans cette task, le `migration.sql` ne contient PAS le `ALTER ... SET NOT NULL`. Il s'arrête après l'UPDATE.

- [ ] **Step 3 : Appliquer la migration en local**

```bash
npx prisma migrate dev
```

Expected: migration appliquée, message "Database is now in sync".

- [ ] **Step 4 : Vérifier le state DB**

```bash
docker exec -i sifriya-v1-db-1 psql -U sifriya -d sifriya -c "SELECT id, name, \"isDefault\" FROM \"Library\";"
docker exec -i sifriya-v1-db-1 psql -U sifriya -d sifriya -c "SELECT COUNT(*) FROM \"LibraryMembership\";"
docker exec -i sifriya-v1-db-1 psql -U sifriya -d sifriya -c "SELECT COUNT(*) FROM \"BookCopy\" WHERE \"libraryId\" IS NULL;"
```

Expected:
- 1 Library "Bibliothèque générale" `isDefault=true`
- N memberships (= N users existants)
- 0 BookCopy avec libraryId NULL

- [ ] **Step 5 : Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(db): add Library + LibraryMembership + Book.isPersonal + BookCopy.libraryId (V1.6)"
```

### Task 1.3 : Passer `BookCopy.libraryId` à NOT NULL

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_lock_book_copy_library_id/migration.sql`

- [ ] **Step 1 : Modifier le schema**

Dans `BookCopy` :
```prisma
  libraryId String
  library   Library @relation(fields: [libraryId], references: [id])
```

(Retirer les `?`.)

- [ ] **Step 2 : Générer la migration**

```bash
npx prisma migrate dev --name lock_book_copy_library_id
```

Expected: migration `ALTER TABLE "BookCopy" ALTER COLUMN "libraryId" SET NOT NULL;` appliquée sans erreur (le backfill a éliminé tous les NULL).

- [ ] **Step 3 : Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(db): lock BookCopy.libraryId NOT NULL after backfill"
```

### Task 1.4 : Adapter le seed (`prisma/seed.ts`)

**Files:**
- Modify: `prisma/seed.ts`

- [ ] **Step 1 : Lire le seed actuel**

```bash
cat prisma/seed.ts
```

- [ ] **Step 2 : Adapter pour créer la Générale si absente + membership admin**

Ajouter, après le `prisma.user.upsert` de l'admin :

```typescript
// V1.6 — Bibliothèque générale + membership de l'admin.
// Idempotent : safe à exécuter sur une DB déjà migrée (le backfill a déjà créé
// la Library mais le seed peut tourner sur une DB fresh sans migration data).
const generale = await prisma.library.upsert({
  where: { id: "lib_generale" },
  update: {},
  create: {
    id: "lib_generale",
    name: "Bibliothèque générale",
    isDefault: true
  }
})

await prisma.libraryMembership.upsert({
  where: { libraryId_userId: { libraryId: generale.id, userId: admin.id } },
  update: {},
  create: { libraryId: generale.id, userId: admin.id }
})

console.log(`Seeded Library Générale (${generale.id}) + admin membership`)
```

(Variable `admin` = résultat du `prisma.user.upsert` de l'admin déjà présent.)

- [ ] **Step 3 : Vérifier l'idempotence**

```bash
npm run db:seed
npm run db:seed
```

Expected: pas d'erreur, deuxième run = no-op.

- [ ] **Step 4 : Commit**

```bash
git add prisma/seed.ts
git commit -m "feat(seed): create lib_generale + admin membership (V1.6)"
```

---

## Phase 2 — Helper de visibilité (`lib/libraries.ts`)

### Task 2.1 : Créer le helper centralisé

**Files:**
- Create: `lib/libraries.ts`

- [ ] **Step 1 : Créer le fichier**

```typescript
// lib/libraries.ts
// =====================================================================
// Sifriya — helper centralisé pour la visibilité des bibliothèques (V1.6)
// Source unique de vérité utilisée par toutes les routes touchant
// Book/BookCopy/Loan. Toute logique de scoping passe par ici.
// =====================================================================

import type { PrismaClient } from "@prisma/client"
import { Role } from "@prisma/client"

export const GENERALE_LIBRARY_ID = "lib_generale"

// Retourne tous les libraryId visibles par l'user.
// - ADMIN global : retourne TOUTES les Library en base.
// - USER : retourne uniquement les libraryId où il a un LibraryMembership.
// La Générale est incluse comme tout autre membership (créé au seed/invite).
export async function getVisibleLibraryIds(
  db: Pick<PrismaClient, "user" | "libraryMembership" | "library">,
  userId: string
): Promise<string[]> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { role: true }
  })
  if (!user) return []

  if (user.role === Role.ADMIN) {
    const all = await db.library.findMany({ select: { id: true } })
    return all.map(l => l.id)
  }

  const memberships = await db.libraryMembership.findMany({
    where: { userId },
    select: { libraryId: true }
  })
  return memberships.map(m => m.libraryId)
}

// True si l'user est ADMIN global OU gérant de la bib.
export async function canManageLibrary(
  db: Pick<PrismaClient, "user" | "library">,
  userId: string,
  libraryId: string
): Promise<boolean> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { role: true }
  })
  if (!user) return false
  if (user.role === Role.ADMIN) return true

  const lib = await db.library.findUnique({
    where: { id: libraryId },
    select: { managerId: true }
  })
  return lib?.managerId === userId
}

// True si l'user est ADMIN global OU membre de la bib.
// Utilisé pour l'ajout de livres et la visibilité.
export async function isLibraryVisible(
  db: Pick<PrismaClient, "user" | "libraryMembership">,
  userId: string,
  libraryId: string
): Promise<boolean> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { role: true }
  })
  if (!user) return false
  if (user.role === Role.ADMIN) return true

  const membership = await db.libraryMembership.findUnique({
    where: { libraryId_userId: { libraryId, userId } },
    select: { id: true }
  })
  return Boolean(membership)
}

// Alias pour la sémantique d'ajout — strictement identique à isLibraryVisible
// (un membre peut ajouter, un non-membre ne peut pas).
export const canAddBookToLibrary = isLibraryVisible
```

- [ ] **Step 2 : Type-check**

```bash
npm run typecheck
```

Expected: aucune erreur.

- [ ] **Step 3 : Commit**

```bash
git add lib/libraries.ts
git commit -m "feat(lib): centralized visibility helper (V1.6)"
```

### Task 2.2 : Smoke test du helper

**Files:**
- Create: `scripts/libraries-smoke.ts`

- [ ] **Step 1 : Créer le smoke**

```typescript
// scripts/libraries-smoke.ts
// Lance : npx tsx scripts/libraries-smoke.ts
// Suppose : DB locale avec au moins 1 ADMIN + 1 USER + lib_generale seeded.

import { PrismaClient } from "@prisma/client"
import {
  getVisibleLibraryIds,
  canManageLibrary,
  isLibraryVisible,
  GENERALE_LIBRARY_ID
} from "../lib/libraries"

const db = new PrismaClient()

async function main() {
  const admin = await db.user.findFirst({ where: { role: "ADMIN" } })
  const user = await db.user.findFirst({ where: { role: "USER" } })

  if (!admin || !user) {
    console.error("Need at least 1 ADMIN + 1 USER. Run npm run db:seed first.")
    process.exit(1)
  }

  // Crée une bib de test
  const testLib = await db.library.upsert({
    where: { id: "lib_smoke_test" },
    update: {},
    create: { id: "lib_smoke_test", name: "Smoke Test Lib", managerId: user.id }
  })

  // Crée un membership user → testLib
  await db.libraryMembership.upsert({
    where: { libraryId_userId: { libraryId: testLib.id, userId: user.id } },
    update: {},
    create: { libraryId: testLib.id, userId: user.id }
  })

  const adminVisible = await getVisibleLibraryIds(db, admin.id)
  const userVisible = await getVisibleLibraryIds(db, user.id)

  console.log("ADMIN voit :", adminVisible.length, "bibs (doit inclure les 2)")
  console.log("USER voit :", userVisible.length, "bibs (doit inclure Générale + testLib)")

  const adminManages = await canManageLibrary(db, admin.id, testLib.id)
  const userManages = await canManageLibrary(db, user.id, testLib.id)
  console.log("ADMIN gère testLib :", adminManages, "(true attendu)")
  console.log("USER gère testLib :", userManages, "(true attendu — user est manager)")

  const adminSeesAny = await isLibraryVisible(db, admin.id, testLib.id)
  const userSeesAny = await isLibraryVisible(db, user.id, testLib.id)
  console.log("ADMIN voit testLib :", adminSeesAny, "(true attendu)")
  console.log("USER voit testLib :", userSeesAny, "(true attendu)")

  // Cleanup
  await db.libraryMembership.deleteMany({ where: { libraryId: testLib.id } })
  await db.library.delete({ where: { id: testLib.id } })

  console.log("\n✓ Smoke test OK")
  await db.$disconnect()
}

main().catch(async e => {
  console.error(e)
  await db.$disconnect()
  process.exit(1)
})
```

Note : pas d'emoji UI, mais le ✓ console est OK (logs dev).

- [ ] **Step 2 : Lancer le smoke**

```bash
npx tsx scripts/libraries-smoke.ts
```

Expected: tous les checks "true attendu" passent.

- [ ] **Step 3 : Commit**

```bash
git add scripts/libraries-smoke.ts
git commit -m "feat(test): libraries visibility smoke"
```

### Task 2.3 : Ajouter `requireLibraryManager` et `requireLibraryMember` dans `lib/auth.ts`

**Files:**
- Modify: `lib/auth.ts`

- [ ] **Step 1 : Localiser `requireAdmin` dans `lib/auth.ts`**

```bash
grep -n "export async function requireAdmin" lib/auth.ts
```

- [ ] **Step 2 : Ajouter les helpers juste après `requireAdmin`**

```typescript
// Guard pour les routes de gestion d'une biblio (ADMIN global ou gérant).
// Retourne la session si OK, sinon NextResponse 401/403.
export async function requireLibraryManager(libraryId: string) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "Non authentifié" }, { status: 401 }) }
  }
  const { canManageLibrary } = await import("@/lib/libraries")
  const ok = await canManageLibrary(db, session.user.id, libraryId)
  if (!ok) {
    return { error: NextResponse.json({ error: "Accès refusé" }, { status: 403 }) }
  }
  return { session }
}

// Guard pour ajouter du contenu dans une biblio (ADMIN global ou membre).
export async function requireLibraryMember(libraryId: string) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "Non authentifié" }, { status: 401 }) }
  }
  const { isLibraryVisible } = await import("@/lib/libraries")
  const ok = await isLibraryVisible(db, session.user.id, libraryId)
  if (!ok) {
    return { error: NextResponse.json({ error: "Accès refusé" }, { status: 403 }) }
  }
  return { session }
}
```

- [ ] **Step 3 : Type-check**

```bash
npm run typecheck
```

- [ ] **Step 4 : Commit**

```bash
git add lib/auth.ts
git commit -m "feat(auth): add requireLibraryManager + requireLibraryMember"
```

---

## Phase 3 — Adaptations `lib/match.ts` + `lib/books-mutations.ts`

### Task 3.1 : `lib/match.ts` skip dédup si `isPersonal`

**Files:**
- Modify: `lib/match.ts`

- [ ] **Step 1 : Modifier la signature de `findMatchingBook`**

Ajouter le champ `isPersonal?: boolean` à l'input :

```typescript
export async function findMatchingBook(
  db: Pick<PrismaClient, "book">,
  input: {
    title: string
    author?: string | null
    isbn?: string | null
    isPersonal?: boolean
  }
): Promise<BookMatch | null> {
  if (input.isPersonal) return null
  // ... reste inchangé
```

- [ ] **Step 2 : Type-check + smoke existant**

```bash
npm run typecheck
npx tsx scripts/match-smoke.ts
```

Expected: typecheck OK, smoke existant continue de passer (les appels sans isPersonal restent inchangés).

- [ ] **Step 3 : Commit**

```bash
git add lib/match.ts
git commit -m "feat(match): skip dedup for personal books (isPersonal=true)"
```

### Task 3.2 : `lib/books-mutations.ts` accepter `libraryId`

**Files:**
- Modify: `lib/books-mutations.ts`

- [ ] **Step 1 : Localiser `createBookWithCopy` et `addCopyToBook`**

```bash
grep -n "export async function createBookWithCopy\|export async function addCopyToBook" lib/books-mutations.ts
```

- [ ] **Step 2 : Adapter `createBookWithCopy`**

Ajouter `libraryId: string` au type d'input. Passer `libraryId` au `prisma.bookCopy.create` à l'intérieur. Si le champ n'est pas explicitement fourni, **lever une erreur** (no fallback silencieux) :

```typescript
type CreateBookInput = {
  // ... champs existants
  libraryId: string
  isPersonal?: boolean
}

export async function createBookWithCopy(input: CreateBookInput) {
  if (!input.libraryId) throw new Error("libraryId required")
  // ... création Book — passer isPersonal: input.isPersonal ?? false
  // ... création BookCopy — passer libraryId: input.libraryId
}
```

- [ ] **Step 3 : Adapter `addCopyToBook`**

Idem, ajouter `libraryId: string` et le passer au `prisma.bookCopy.create` :

```typescript
type AddCopyInput = {
  bookId: string
  // ... champs existants
  libraryId: string
}

export async function addCopyToBook(input: AddCopyInput) {
  if (!input.libraryId) throw new Error("libraryId required")
  // ... création BookCopy — passer libraryId
}
```

- [ ] **Step 4 : Type-check**

```bash
npm run typecheck
```

Expected: erreurs dans les appelants (routes qui appellent encore sans libraryId). C'est attendu — la Phase 4 va les corriger.

- [ ] **Step 5 : Commit (typecheck cassé temporairement — c'est ok, on enchaîne)**

```bash
git add lib/books-mutations.ts
git commit -m "feat(mutations): require libraryId in createBookWithCopy + addCopyToBook"
```

---

## Phase 4 — Adaptations routes API existantes

### Task 4.1 : `POST /api/books/match` — skip si `isPersonal`

**Files:**
- Modify: `app/api/books/match/route.ts`

- [ ] **Step 1 : Ajouter `isPersonal` au schema Zod et passer à `findMatchingBook`**

```typescript
const matchSchema = z.object({
  title: z.string().min(1),
  author: z.string().nullable().optional(),
  isbn: z.string().nullable().optional(),
  isPersonal: z.boolean().optional()
})

// Dans le handler :
const match = await findMatchingBook(db, {
  title: parsed.title,
  author: parsed.author,
  isbn: parsed.isbn,
  isPersonal: parsed.isPersonal
})
```

- [ ] **Step 2 : Type-check + commit**

```bash
npm run typecheck
git add app/api/books/match/route.ts
git commit -m "feat(api): /books/match accepts isPersonal flag (skip dedup)"
```

### Task 4.2 : `POST /api/books` — exiger `libraryId`, vérifier membre

**Files:**
- Modify: `app/api/books/route.ts`

- [ ] **Step 1 : Ajouter `libraryId` (obligatoire) et `isPersonal` (optionnel) au schema Zod**

```typescript
const createBookSchema = z.object({
  // ... champs existants
  libraryId: z.string().min(1),
  isPersonal: z.boolean().optional()
})
```

- [ ] **Step 2 : Vérifier visibility avant création**

Dans le handler POST :

```typescript
import { isLibraryVisible } from "@/lib/libraries"

const visible = await isLibraryVisible(db, session.user.id, parsed.libraryId)
if (!visible) {
  return NextResponse.json({ error: "Bibliothèque inaccessible" }, { status: 403 })
}
```

- [ ] **Step 3 : Passer `libraryId` et `isPersonal` à `createBookWithCopy`**

- [ ] **Step 4 : Adapter le GET pour filtrer par visibility**

Dans le handler GET :

```typescript
import { getVisibleLibraryIds } from "@/lib/libraries"

const visibleLibIds = await getVisibleLibraryIds(db, session.user.id)

// Adapter le `where` Prisma :
const where: Prisma.BookWhereInput = {
  copies: {
    some: {
      libraryId: { in: visibleLibIds }
    }
  },
  // ... autres filtres existants (q, type, format, sort)
}

// Si query param libraryId fourni : restreindre à cette bib (et vérifier visibility)
if (libraryIdParam) {
  if (!visibleLibIds.includes(libraryIdParam)) {
    return NextResponse.json({ error: "Bibliothèque inaccessible" }, { status: 403 })
  }
  where.copies = { some: { libraryId: libraryIdParam } }
}
```

- [ ] **Step 5 : Type-check + commit**

```bash
npm run typecheck
git add app/api/books/route.ts
git commit -m "feat(api): /books scoped by library visibility + libraryId required on POST"
```

### Task 4.3 : `GET /api/books/[id]` — 404 si pas de copie visible, filtrer `copies`

**Files:**
- Modify: `app/api/books/[id]/route.ts`

- [ ] **Step 1 : Adapter le GET pour filtrer `copies` sur visibility**

```typescript
const visibleLibIds = await getVisibleLibraryIds(db, session.user.id)

const book = await db.book.findFirst({
  where: {
    id,
    copies: { some: { libraryId: { in: visibleLibIds } } }
  },
  include: {
    copies: {
      where: { libraryId: { in: visibleLibIds } },
      include: { owner: true, library: true }
    }
  }
})

if (!book) return NextResponse.json({ error: "Introuvable" }, { status: 404 })
```

- [ ] **Step 2 : Adapter le DELETE — admin only inchangé, mais vérifier l'existence sous visibility**

(Le DELETE est admin only via `requireAdmin` — pas de scoping nécessaire pour admin grâce à la super-visibilité du helper.)

- [ ] **Step 3 : Adapter le PATCH (édition métadonnées)**

L'auteur d'une copie (`addedBy`) doit avoir au moins 1 copie dans une bib visible pour éditer. Vérifier ça en plus de la règle existante "addedBy OR admin".

- [ ] **Step 4 : Type-check + commit**

```bash
npm run typecheck
git add app/api/books/[id]/route.ts
git commit -m "feat(api): /books/[id] scoped by visibility (GET + PATCH)"
```

### Task 4.4 : `POST /api/books/[id]/copies` — exiger `libraryId`

**Files:**
- Modify: `app/api/books/[id]/copies/route.ts`

- [ ] **Step 1 : Ajouter `libraryId` au schema Zod (obligatoire)**

- [ ] **Step 2 : Vérifier visibility de la bib cible**

```typescript
const visible = await isLibraryVisible(db, session.user.id, parsed.libraryId)
if (!visible) {
  return NextResponse.json({ error: "Bibliothèque inaccessible" }, { status: 403 })
}
```

- [ ] **Step 3 : Vérifier que le Book lui-même a au moins 1 copie visible (sinon 404)**

```typescript
const visibleLibIds = await getVisibleLibraryIds(db, session.user.id)
const book = await db.book.findFirst({
  where: {
    id: params.id,
    copies: { some: { libraryId: { in: visibleLibIds } } }
  }
})
if (!book) return NextResponse.json({ error: "Introuvable" }, { status: 404 })
```

- [ ] **Step 4 : Adapter le check de duplicate format dans la même bib**

Le check actuel V1.3 (pas deux DIGITAL même format sur un Book) doit maintenant être scopé à la bib cible (un même Book peut avoir 1 EPUB en "Famille" et 1 EPUB en "Générale" — sont 2 copies distinctes valides).

```typescript
// Pour DIGITAL : check qu'il n'y a pas déjà un DIGITAL au même format dans CETTE bib
if (parsed.type === "DIGITAL") {
  const dup = await db.bookCopy.findFirst({
    where: {
      bookId: params.id,
      libraryId: parsed.libraryId,
      type: "DIGITAL",
      format: parsed.format
    }
  })
  if (dup) {
    return NextResponse.json({
      error: "Une copie de ce format existe déjà dans cette bibliothèque",
      conflictCopyId: dup.id
    }, { status: 409 })
  }
}

// Pour PHYSICAL : check qu'il n'y a pas déjà une copie de cet owner dans cette bib
if (parsed.type === "PHYSICAL") {
  const dup = await db.bookCopy.findFirst({
    where: {
      bookId: params.id,
      libraryId: parsed.libraryId,
      type: "PHYSICAL",
      ownerId: parsed.ownerId ?? session.user.id
    }
  })
  if (dup) {
    return NextResponse.json({
      error: "Vous possédez déjà une copie physique de ce livre dans cette bibliothèque",
      conflictCopyId: dup.id
    }, { status: 409 })
  }
}
```

- [ ] **Step 5 : Passer `libraryId` à `addCopyToBook`**

- [ ] **Step 6 : Type-check + commit**

```bash
npm run typecheck
git add app/api/books/[id]/copies/route.ts
git commit -m "feat(api): /books/[id]/copies scoped by library + libraryId required"
```

### Task 4.5 : `DELETE /api/books/[id]/copies/[cid]` — autoriser gérant de bib

**Files:**
- Modify: `app/api/books/[id]/copies/[cid]/route.ts`

- [ ] **Step 1 : Ajouter `canManageLibrary` à la liste des autorisations**

Permissions = owner OR addedBy OR ADMIN OR gérant de la bib de la copie.

```typescript
import { canManageLibrary } from "@/lib/libraries"

const copy = await db.bookCopy.findUnique({
  where: { id: cid },
  select: {
    bookId: true, libraryId: true, ownerId: true, addedById: true
  }
})
if (!copy || copy.bookId !== params.id) {
  return NextResponse.json({ error: "Introuvable" }, { status: 404 })
}

const isOwner = copy.ownerId === session.user.id
const isAdder = copy.addedById === session.user.id
const isAdmin = session.user.role === "ADMIN"
const isManager = await canManageLibrary(db, session.user.id, copy.libraryId)

if (!isOwner && !isAdder && !isAdmin && !isManager) {
  return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
}
```

- [ ] **Step 2 : Type-check + commit**

```bash
npm run typecheck
git add app/api/books/[id]/copies/[cid]/route.ts
git commit -m "feat(api): allow library manager to delete copies"
```

### Task 4.6 : `GET /api/books/[id]/download` — vérifier visibility

**Files:**
- Modify: `app/api/books/[id]/download/route.ts`

- [ ] **Step 1 : Vérifier visibility de la copie ciblée**

```typescript
import { isLibraryVisible } from "@/lib/libraries"

// Après avoir résolu la copie (existant) :
const visible = await isLibraryVisible(db, session.user.id, copy.libraryId)
if (!visible) {
  return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
}
```

- [ ] **Step 2 : Type-check + commit**

```bash
npm run typecheck
git add app/api/books/[id]/download/route.ts
git commit -m "feat(api): download 403 if copy not in visible library"
```

### Task 4.7 : `POST /api/loans` — vérifier visibility de la copie

**Files:**
- Modify: `app/api/loans/route.ts`

- [ ] **Step 1 : Vérifier visibility de la copie demandée**

```typescript
// Après avoir validé que copyId existe et que c'est physique :
const visible = await isLibraryVisible(db, session.user.id, copy.libraryId)
if (!visible) {
  return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
}
```

- [ ] **Step 2 : Adapter le `GET /api/loans` pour ne montrer que les prêts sur copies visibles**

Actuellement le GET montre `sent + received`. Avec V1.6, on garde la même logique (un user voit ses propres prêts envoyés/reçus quoi qu'il arrive — c'est SA donnée). **Pas de filtrage de visibility sur ce GET** — un prêt en cours sur une copie d'une bib dont le requester a été retiré reste visible côté requester ET owner pour cohérence physique.

- [ ] **Step 3 : Type-check + commit**

```bash
npm run typecheck
git add app/api/loans/route.ts
git commit -m "feat(api): /loans POST checks library visibility"
```

### Task 4.8 : `POST /api/admin/invites` — créer membership Générale

**Files:**
- Modify: `app/api/admin/invites/route.ts`

- [ ] **Step 1 : Ajouter `libraryIds` au schema Zod (optionnel, défaut = [])**

```typescript
const inviteSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
  role: z.enum(["USER", "ADMIN"]).optional(),
  libraryIds: z.array(z.string()).optional()  // bibs restreintes additionnelles
})
```

- [ ] **Step 2 : Créer le user + memberships dans une transaction**

```typescript
import { GENERALE_LIBRARY_ID } from "@/lib/libraries"

const created = await db.$transaction(async tx => {
  const user = await tx.user.upsert({
    where: { email: parsed.email },
    update: {},
    create: { email: parsed.email, name: parsed.name, role: parsed.role ?? "USER" }
  })

  // Toujours : membership Générale (idempotent)
  await tx.libraryMembership.upsert({
    where: { libraryId_userId: { libraryId: GENERALE_LIBRARY_ID, userId: user.id } },
    update: {},
    create: { libraryId: GENERALE_LIBRARY_ID, userId: user.id }
  })

  // Optionnel : memberships supplémentaires
  for (const libraryId of parsed.libraryIds ?? []) {
    if (libraryId === GENERALE_LIBRARY_ID) continue
    await tx.libraryMembership.upsert({
      where: { libraryId_userId: { libraryId, userId: user.id } },
      update: {},
      create: { libraryId, userId: user.id }
    })
  }

  return user
})
```

- [ ] **Step 3 : Type-check + commit**

```bash
npm run typecheck
git add app/api/admin/invites/route.ts
git commit -m "feat(invites): create membership in Générale + optional restricted libraries"
```

---

## Phase 5 — Nouvelles routes API `/api/libraries/*`

### Task 5.1 : `GET /api/libraries` + `POST /api/libraries`

**Files:**
- Create: `app/api/libraries/route.ts`

- [ ] **Step 1 : Créer le fichier**

```typescript
// app/api/libraries/route.ts
import { NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession } from "next-auth/next"
import { authOptions, requireAdmin } from "@/lib/auth"
import { db } from "@/lib/db"
import { getVisibleLibraryIds } from "@/lib/libraries"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 })
  }

  const visibleIds = await getVisibleLibraryIds(db, session.user.id)

  const libraries = await db.library.findMany({
    where: { id: { in: visibleIds } },
    include: {
      manager: { select: { id: true, name: true, email: true, avatarColor: true } },
      _count: { select: { copies: true, memberships: true } }
    },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }]
  })

  return NextResponse.json({
    libraries: libraries.map(l => ({
      id: l.id,
      name: l.name,
      description: l.description,
      isDefault: l.isDefault,
      manager: l.manager,
      bookCount: l._count.copies,
      memberCount: l._count.memberships
    }))
  })
}

const createSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  managerId: z.string().nullable().optional()
})

export async function POST(req: Request) {
  const adminCheck = await requireAdmin()
  if ("error" in adminCheck) return adminCheck.error

  const body = await req.json().catch(() => ({}))
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides", issues: parsed.error.issues }, { status: 400 })
  }

  // Validation manager existe (si fourni)
  if (parsed.data.managerId) {
    const user = await db.user.findUnique({ where: { id: parsed.data.managerId } })
    if (!user) {
      return NextResponse.json({ error: "Gérant introuvable" }, { status: 400 })
    }
  }

  const library = await db.library.create({
    data: {
      name: parsed.data.name,
      description: parsed.data.description,
      managerId: parsed.data.managerId ?? null,
      // Si un gérant est nommé, l'ajouter automatiquement comme membre
      memberships: parsed.data.managerId
        ? { create: { userId: parsed.data.managerId } }
        : undefined
    }
  })

  return NextResponse.json({ library }, { status: 201 })
}
```

- [ ] **Step 2 : Vérifier que `requireAdmin` existe dans `lib/auth.ts`**

```bash
grep -n "export async function requireAdmin" lib/auth.ts
```

Si absent, c'est anormal (V1.5 l'a ajouté). Investiguer.

- [ ] **Step 3 : Type-check + commit**

```bash
npm run typecheck
git add app/api/libraries/route.ts
git commit -m "feat(api): GET /libraries (list) + POST /libraries (admin create)"
```

### Task 5.2 : `GET /api/libraries/[id]` + `PATCH` + `DELETE`

**Files:**
- Create: `app/api/libraries/[id]/route.ts`

- [ ] **Step 1 : Créer le fichier**

```typescript
// app/api/libraries/[id]/route.ts
import { NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession } from "next-auth/next"
import { authOptions, requireAdmin } from "@/lib/auth"
import { db } from "@/lib/db"
import { isLibraryVisible, canManageLibrary, GENERALE_LIBRARY_ID } from "@/lib/libraries"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 })
  }

  const { id } = await params
  const visible = await isLibraryVisible(db, session.user.id, id)
  if (!visible) {
    return NextResponse.json({ error: "Introuvable" }, { status: 404 })
  }

  const canManage = await canManageLibrary(db, session.user.id, id)

  const library = await db.library.findUnique({
    where: { id },
    include: {
      manager: { select: { id: true, name: true, email: true, avatarColor: true } },
      memberships: canManage
        ? { include: { user: { select: { id: true, name: true, email: true, avatarColor: true } } } }
        : false,
      _count: { select: { copies: true, memberships: true } }
    }
  })

  if (!library) return NextResponse.json({ error: "Introuvable" }, { status: 404 })

  return NextResponse.json({
    library: {
      id: library.id,
      name: library.name,
      description: library.description,
      isDefault: library.isDefault,
      manager: library.manager,
      bookCount: library._count.copies,
      memberCount: library._count.memberships,
      members: canManage
        ? library.memberships.map(m => ({ ...m.user, addedAt: m.addedAt }))
        : null
    }
  })
}

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  managerId: z.string().nullable().optional()
})

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const adminCheck = await requireAdmin()
  if ("error" in adminCheck) return adminCheck.error

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides", issues: parsed.error.issues }, { status: 400 })
  }

  // Validation manager si modifié
  if (parsed.data.managerId !== undefined && parsed.data.managerId !== null) {
    const user = await db.user.findUnique({ where: { id: parsed.data.managerId } })
    if (!user) return NextResponse.json({ error: "Gérant introuvable" }, { status: 400 })
  }

  const updated = await db.$transaction(async tx => {
    const lib = await tx.library.update({
      where: { id },
      data: {
        name: parsed.data.name,
        description: parsed.data.description,
        managerId: parsed.data.managerId === undefined ? undefined : parsed.data.managerId
      }
    })

    // Si on change de gérant, le nouveau gérant devient membre auto
    if (parsed.data.managerId) {
      await tx.libraryMembership.upsert({
        where: { libraryId_userId: { libraryId: id, userId: parsed.data.managerId } },
        update: {},
        create: { libraryId: id, userId: parsed.data.managerId }
      })
    }

    return lib
  })

  return NextResponse.json({ library: updated })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const adminCheck = await requireAdmin()
  if ("error" in adminCheck) return adminCheck.error

  const { id } = await params

  if (id === GENERALE_LIBRARY_ID) {
    return NextResponse.json({ error: "La Bibliothèque générale ne peut pas être supprimée" }, { status: 403 })
  }

  const lib = await db.library.findUnique({
    where: { id },
    include: { _count: { select: { copies: true } } }
  })

  if (!lib) return NextResponse.json({ error: "Introuvable" }, { status: 404 })

  if (lib._count.copies > 0) {
    return NextResponse.json({
      error: "Bibliothèque non vide. Supprimez d'abord toutes les copies.",
      bookCount: lib._count.copies
    }, { status: 409 })
  }

  await db.library.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2 : Type-check + commit**

```bash
npm run typecheck
git add app/api/libraries/[id]/route.ts
git commit -m "feat(api): GET/PATCH/DELETE /libraries/[id]"
```

### Task 5.3 : `PUT /api/libraries/[id]/members` (batch replace)

**Files:**
- Create: `app/api/libraries/[id]/members/route.ts`

- [ ] **Step 1 : Créer le fichier**

```typescript
// app/api/libraries/[id]/members/route.ts
import { NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { canManageLibrary, GENERALE_LIBRARY_ID } from "@/lib/libraries"

const putSchema = z.object({
  userIds: z.array(z.string()).max(1000)
})

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 })
  }

  const { id: libraryId } = await params

  const canManage = await canManageLibrary(db, session.user.id, libraryId)
  if (!canManage) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const parsed = putSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides", issues: parsed.error.issues }, { status: 400 })
  }

  // Pour la Générale : interdit toute modification de memberships ici
  // (chaque user créé est ajouté automatiquement à la Générale via /api/admin/invites
  // ou suppression user → cascade. Pas de retrait manuel).
  if (libraryId === GENERALE_LIBRARY_ID) {
    return NextResponse.json({
      error: "La Bibliothèque générale a une appartenance gérée automatiquement"
    }, { status: 403 })
  }

  const targetIds = new Set(parsed.data.userIds)

  // Anti-lockout : le gérant courant ne peut pas se retirer lui-même par cette route.
  // L'admin global peut tout faire — il a la super-visibilité de toute façon.
  const lib = await db.library.findUnique({ where: { id: libraryId }, select: { managerId: true } })
  if (!lib) return NextResponse.json({ error: "Introuvable" }, { status: 404 })

  if (lib.managerId && lib.managerId === session.user.id && !targetIds.has(session.user.id)) {
    return NextResponse.json({
      error: "Vous ne pouvez pas vous retirer vous-même de la bibliothèque que vous gérez"
    }, { status: 400 })
  }

  // Valide que tous les userIds existent (1 seul roundtrip)
  const users = await db.user.findMany({
    where: { id: { in: parsed.data.userIds } },
    select: { id: true }
  })
  if (users.length !== parsed.data.userIds.length) {
    return NextResponse.json({ error: "Un ou plusieurs utilisateurs introuvables" }, { status: 400 })
  }

  // Diff : insère manquants, supprime en trop, dans une transaction
  await db.$transaction(async tx => {
    const existing = await tx.libraryMembership.findMany({
      where: { libraryId },
      select: { userId: true }
    })
    const existingIds = new Set(existing.map(m => m.userId))

    const toAdd = [...targetIds].filter(id => !existingIds.has(id))
    const toRemove = [...existingIds].filter(id => !targetIds.has(id))

    if (toAdd.length > 0) {
      await tx.libraryMembership.createMany({
        data: toAdd.map(userId => ({ libraryId, userId })),
        skipDuplicates: true
      })
    }
    if (toRemove.length > 0) {
      await tx.libraryMembership.deleteMany({
        where: { libraryId, userId: { in: toRemove } }
      })
    }
  })

  return NextResponse.json({ ok: true, memberCount: targetIds.size })
}
```

- [ ] **Step 2 : Type-check + commit**

```bash
npm run typecheck
git add app/api/libraries/[id]/members/route.ts
git commit -m "feat(api): PUT /libraries/[id]/members (atomic batch replace)"
```

### Task 5.4 : `DELETE /api/libraries/[id]/members/[userId]`

**Files:**
- Create: `app/api/libraries/[id]/members/[userId]/route.ts`

- [ ] **Step 1 : Créer le fichier**

```typescript
// app/api/libraries/[id]/members/[userId]/route.ts
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { canManageLibrary, GENERALE_LIBRARY_ID } from "@/lib/libraries"

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 })
  }

  const { id: libraryId, userId } = await params

  if (libraryId === GENERALE_LIBRARY_ID) {
    return NextResponse.json({
      error: "La Bibliothèque générale a une appartenance gérée automatiquement"
    }, { status: 403 })
  }

  const canManage = await canManageLibrary(db, session.user.id, libraryId)
  if (!canManage) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  // Anti-lockout : gérant ne peut pas se retirer lui-même
  const lib = await db.library.findUnique({ where: { id: libraryId }, select: { managerId: true } })
  if (lib?.managerId === userId) {
    return NextResponse.json({
      error: "Impossible de retirer le gérant. Changez d'abord le gérant via PATCH /libraries/[id]."
    }, { status: 400 })
  }

  await db.libraryMembership.deleteMany({
    where: { libraryId, userId }
  })

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2 : Type-check + commit**

```bash
npm run typecheck
git add app/api/libraries/[id]/members/[userId]/route.ts
git commit -m "feat(api): DELETE /libraries/[id]/members/[userId]"
```

---

## Phase 6 — UI : sélecteur bib + sidebar

### Task 6.1 : Hook + composant `LibrarySelector`

**Files:**
- Create: `components/libraries/LibrarySelector.tsx`
- Create: `lib/hooks/useLibraries.ts`

- [ ] **Step 1 : Créer le hook**

```typescript
// lib/hooks/useLibraries.ts
"use client"
import useSWR from "swr"

export type LibraryListItem = {
  id: string
  name: string
  description: string | null
  isDefault: boolean
  manager: { id: string; name: string | null; email: string; avatarColor: string } | null
  bookCount: number
  memberCount: number
}

const fetcher = (url: string) => fetch(url).then(r => r.json())

export function useLibraries() {
  const { data, error, isLoading, mutate } = useSWR<{ libraries: LibraryListItem[] }>(
    "/api/libraries",
    fetcher
  )
  return { libraries: data?.libraries ?? [], error, isLoading, mutate }
}
```

⚠️ Si SWR n'est pas dans les deps : vérifier avec `grep "\"swr\"" package.json`. Si absent, soit l'installer (`npm i swr`), soit utiliser un fetch direct dans un `useEffect`. **Préférer SWR si déjà utilisé ailleurs** — vérifier d'abord :

```bash
grep -r "from \"swr\"" lib components app 2>/dev/null | head -3
```

Si pas trouvé → fallback `useState + useEffect` :

```typescript
"use client"
import { useEffect, useState } from "react"

export function useLibraries() {
  const [libraries, setLibraries] = useState<LibraryListItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const refresh = async () => {
    try {
      const res = await fetch("/api/libraries")
      const json = await res.json()
      setLibraries(json.libraries ?? [])
    } catch (e) {
      setError(e as Error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { refresh() }, [])

  return { libraries, error, isLoading, mutate: refresh }
}
```

- [ ] **Step 2 : Créer le composant**

```typescript
// components/libraries/LibrarySelector.tsx
"use client"
import { useLibraries } from "@/lib/hooks/useLibraries"

type Props = {
  value: string
  onChange: (libraryId: string) => void
  disabled?: boolean
  label?: string
}

export function LibrarySelector({ value, onChange, disabled, label }: Props) {
  const { libraries, isLoading } = useLibraries()

  // Si une seule bib accessible : ne pas afficher le select (valeur figée)
  if (!isLoading && libraries.length === 1) {
    return null
  }

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-[13px] text-[var(--ink-3)] font-medium">
          {label}
        </label>
      )}
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled || isLoading}
        className="h-9 rounded-md border border-[var(--rule)] bg-[var(--paper)] px-3 text-[14px] text-[var(--ink)] shadow-[var(--shadow-1)]"
      >
        {libraries.map(lib => (
          <option key={lib.id} value={lib.id}>
            {lib.name}
          </option>
        ))}
      </select>
    </div>
  )
}
```

- [ ] **Step 3 : Type-check + commit**

```bash
npm run typecheck
git add components/libraries/LibrarySelector.tsx lib/hooks/useLibraries.ts
git commit -m "feat(ui): LibrarySelector + useLibraries hook"
```

### Task 6.2 : Adapter `Sidebar.tsx` — section "Mes Bibliothèques"

**Files:**
- Modify: `components/layout/Sidebar.tsx`

- [ ] **Step 1 : Lire le fichier actuel**

```bash
cat components/layout/Sidebar.tsx
```

- [ ] **Step 2 : Ajouter une section "Mes Bibliothèques" entre "Prêt" et "Ma Bibliothèque"**

Strat :
- Côté Sidebar (composant client), utiliser `useLibraries()` pour récupérer les bibs visibles.
- Filtrer celles avec `isDefault === false`.
- Afficher la section uniquement si la liste filtrée a ≥ 1 élément.

Ajouter (après le `NavItem` pour `/pret`) :

```tsx
{restrictedLibraries.length > 0 && (
  <>
    <div className="px-3 py-1.5 text-[11px] uppercase tracking-wide text-[var(--ink-3)]">
      Mes Bibliothèques
    </div>
    {restrictedLibraries.map(lib => (
      <NavItem
        key={lib.id}
        href={`/bibliotheques/${lib.id}`}
        icon={<BookOpen className="size-4" />}
        label={lib.name}
        isActive={pathname === `/bibliotheques/${lib.id}`}
      />
    ))}
  </>
)}
```

Avec :
```tsx
const { libraries } = useLibraries()
const restrictedLibraries = libraries.filter(l => !l.isDefault)
```

⚠️ Si la Sidebar n'est pas déjà un Client Component, l'identifier en haut avec `"use client"`. Probable qu'elle le soit déjà (utilise `usePathname()`).

- [ ] **Step 3 : Vérifier en dev**

```bash
npm run dev
```

Aller sur localhost:3000, login, observer :
- Sidebar : pas de section "Mes Bibliothèques" (pas encore de bib restreinte)

- [ ] **Step 4 : Commit**

```bash
git add components/layout/Sidebar.tsx
git commit -m "feat(ui): sidebar section Mes Bibliothèques"
```

---

## Phase 7 — UI : AddBookFlow + PlancheFlow

### Task 7.1 : Ajouter le 4e mode "Planche" dans AddBookFlow

**Files:**
- Modify: `components/books/AddBookFlow.tsx` (chercher le fichier — peut être `AddBookFlow.tsx` ou intégré dans `BookGrid.tsx` côté trigger)

- [ ] **Step 1 : Localiser le composant trigger d'ajout**

```bash
grep -rn "Numérique\|Physique" components/ | grep -i "ajout\|mode\|flow"
```

- [ ] **Step 2 : Ajouter une carte "Planche" en step 1**

Trois cartes existantes (Numérique / Physique) → quatre (+ Planche). Label UI : **"Planche"** (jamais "PDF personnel" côté UI).

```tsx
<button
  onClick={() => setMode("planche")}
  className="..."
>
  <FileText className="size-8" />  {/* ou ScrollText / Pen, à choisir */}
  <div>
    <div className="font-medium">Planche</div>
    <div className="text-[12px] text-[var(--ink-3)]">
      Écrit personnel
    </div>
  </div>
</button>
```

Icône : `FileText` ou `ScrollText` de Lucide. Cohérent avec le ton (pas d'emoji).

- [ ] **Step 3 : Brancher la route vers `PlancheFlow` (créé en Task 7.2)**

```tsx
{mode === "planche" && (
  <PlancheFlow onClose={onClose} initialLibraryId={initialLibraryId} />
)}
```

- [ ] **Step 4 : Type-check (pas encore de commit, PlancheFlow n'existe pas)**

### Task 7.2 : Créer `PlancheFlow.tsx`

**Files:**
- Create: `components/books/PlancheFlow.tsx`

- [ ] **Step 1 : Créer le composant**

```typescript
// components/books/PlancheFlow.tsx
"use client"
import { useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { LibrarySelector } from "@/components/libraries/LibrarySelector"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { GENERALE_LIBRARY_ID } from "@/lib/libraries-client"

type Props = {
  onClose: () => void
  initialLibraryId?: string
}

export function PlancheFlow({ onClose, initialLibraryId }: Props) {
  const { data: session } = useSession()
  const router = useRouter()
  const [step, setStep] = useState<"upload" | "form">("upload")
  const [uploadId, setUploadId] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Form fields
  const [title, setTitle] = useState("")
  const [author, setAuthor] = useState(session?.user?.name ?? "")
  const [description, setDescription] = useState("")
  const [year, setYear] = useState("")
  const [libraryId, setLibraryId] = useState(initialLibraryId ?? GENERALE_LIBRARY_ID)

  const onFile = async (file: File) => {
    setError(null)
    if (file.type !== "application/pdf") {
      setError("Seul le format PDF est accepté pour une Planche")
      return
    }
    if (file.size > 50 * 1024 * 1024) {
      setError("Fichier trop volumineux (max 50 Mo)")
      return
    }
    const fd = new FormData()
    fd.append("file", file)
    const res = await fetch("/api/uploads", { method: "POST", body: fd })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setError(j.error ?? "Erreur lors de l'upload")
      return
    }
    const { uploadId } = await res.json()
    setUploadId(uploadId)
    setFileName(file.name)
    setTitle(file.name.replace(/\.pdf$/i, ""))
    setStep("form")
  }

  const onSubmit = async () => {
    if (!uploadId) return
    setSubmitting(true)
    setError(null)
    const res = await fetch("/api/books", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        author: author || null,
        description: description || null,
        year: year ? Number(year) : null,
        type: "DIGITAL",
        format: "PDF",
        uploadId,
        libraryId,
        isPersonal: true
      })
    })
    setSubmitting(false)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setError(j.error ?? "Erreur lors de la création")
      return
    }
    const { book } = await res.json()
    onClose()
    router.push(`/bibliotheque/${book.id}`)
  }

  if (step === "upload") {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="font-serif text-[20px] text-[var(--ink)]">Nouvelle Planche</h2>
        <p className="text-[14px] text-[var(--ink-3)]">
          Importe un PDF personnel. Tu en es le propriétaire affiché.
        </p>
        <label className="cursor-pointer rounded-md border-2 border-dashed border-[var(--rule)] p-8 text-center hover:border-[var(--accent)]">
          <input
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={e => e.target.files?.[0] && onFile(e.target.files[0])}
          />
          <div className="text-[14px] text-[var(--ink-2)]">
            Cliquer pour choisir un PDF
          </div>
        </label>
        {error && <div className="text-[13px] text-[var(--err)]">{error}</div>}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-serif text-[20px] text-[var(--ink)]">Détails de la Planche</h2>
      <div className="text-[13px] text-[var(--ink-3)]">
        Fichier : <span className="font-mono">{fileName}</span>
      </div>

      <Input label="Titre *" value={title} onChange={e => setTitle(e.target.value)} />
      <Input label="Auteur" value={author} onChange={e => setAuthor(e.target.value)} />
      <Input label="Année" type="number" value={year} onChange={e => setYear(e.target.value)} />
      <div className="flex flex-col gap-1.5">
        <label className="text-[13px] text-[var(--ink-3)] font-medium">Description</label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={4}
          className="rounded-md border border-[var(--rule)] bg-[var(--paper)] p-3 text-[14px]"
        />
      </div>
      <LibrarySelector value={libraryId} onChange={setLibraryId} label="Bibliothèque" />

      {error && <div className="text-[13px] text-[var(--err)]">{error}</div>}

      <div className="flex gap-2 justify-end">
        <Button variant="ghost" onClick={onClose}>Annuler</Button>
        <Button variant="primary" onClick={onSubmit} disabled={!title || submitting}>
          {submitting ? "Création..." : "Créer la Planche"}
        </Button>
      </div>
    </div>
  )
}
```

⚠️ **Note** : `lib/libraries-client.ts` doit ré-exporter `GENERALE_LIBRARY_ID` côté client si `lib/libraries.ts` est marqué `server-only`. Vérifier dans Task 2.1 si server-only a été ajouté. Si oui, créer un mini-fichier `lib/libraries-client.ts` qui exporte juste la constante. Si non, importer directement depuis `lib/libraries`.

```bash
grep -n "server-only" lib/libraries.ts
```

Si trouvé : créer `lib/libraries-client.ts` avec `export const GENERALE_LIBRARY_ID = "lib_generale"`. Sinon : importer depuis `lib/libraries`.

- [ ] **Step 2 : Type-check + commit**

```bash
npm run typecheck
git add components/books/PlancheFlow.tsx components/books/AddBookFlow.tsx lib/libraries-client.ts 2>/dev/null
git commit -m "feat(ui): PlancheFlow + 4ème mode dans AddBookFlow"
```

### Task 7.3 : Propager `libraryId` dans `DigitalUploadFlow` + `PhysicalFlow`

**Files:**
- Modify: `components/books/DigitalUploadFlow.tsx`
- Modify: `components/books/PhysicalFlow.tsx`

- [ ] **Step 1 : Ajouter le `LibrarySelector` au step "fiche livre" des deux flows**

Pour les deux flows, ajouter dans le formulaire final un `<LibrarySelector value={libraryId} onChange={setLibraryId} />` (avant le bouton submit). Pré-sélectionner `initialLibraryId` (passé en prop depuis AddBookFlow).

```tsx
const [libraryId, setLibraryId] = useState(initialLibraryId ?? GENERALE_LIBRARY_ID)
```

Inclure `libraryId` dans le body du `POST /api/books` (et `POST /api/books/[id]/copies` pour les flows qui s'embranchent vers "ajout d'une copie sur Book existant" via la modale de doublon V1.3).

- [ ] **Step 2 : Type-check + commit**

```bash
npm run typecheck
git add components/books/DigitalUploadFlow.tsx components/books/PhysicalFlow.tsx
git commit -m "feat(ui): propagate libraryId in Digital + Physical flows"
```

### Task 7.4 : Adapter `BookGrid` pour passer `initialLibraryId` depuis le contexte

**Files:**
- Modify: `components/books/BookGrid.tsx` (ou `AddBookFlow.tsx` selon où vit le trigger)

- [ ] **Step 1 : Si la page courante est `/bibliotheques/[id]`, passer `id` comme `initialLibraryId`**

Dans le composant qui ouvre le drawer/modale d'ajout :
```tsx
const pathname = usePathname()
const match = pathname.match(/^\/bibliotheques\/([^/]+)/)
const initialLibraryId = match?.[1]

<AddBookFlow initialLibraryId={initialLibraryId} ... />
```

- [ ] **Step 2 : Type-check + commit**

```bash
npm run typecheck
git add components/books/BookGrid.tsx
git commit -m "feat(ui): pre-select current library when adding from library page"
```

---

## Phase 8 — UI : pages bib + admin

### Task 8.1 : Page `/bibliotheques/[id]` (catalogue scopé)

**Files:**
- Create: `app/(app)/bibliotheques/[id]/page.tsx`

- [ ] **Step 1 : Créer la page**

```typescript
// app/(app)/bibliotheques/[id]/page.tsx
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { isLibraryVisible, canManageLibrary } from "@/lib/libraries"
import { BookGrid } from "@/components/books/BookGrid"

type Props = { params: Promise<{ id: string }> }

export default async function LibraryPage({ params }: Props) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect("/login")

  const visible = await isLibraryVisible(db, session.user.id, id)
  if (!visible) notFound()

  const library = await db.library.findUnique({
    where: { id },
    include: {
      manager: { select: { id: true, name: true } },
      _count: { select: { copies: true, memberships: true } }
    }
  })
  if (!library) notFound()

  const canManage = await canManageLibrary(db, session.user.id, id)

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="font-serif text-[28px] text-[var(--ink)]">{library.name}</h1>
          {library.description && (
            <p className="text-[14px] text-[var(--ink-3)] mt-1">{library.description}</p>
          )}
          <div className="text-[13px] text-[var(--ink-3)] mt-2">
            {library._count.copies} livres · {library._count.memberships} membres
            {library.manager && ` · Gérant : ${library.manager.name ?? "—"}`}
          </div>
        </div>
        {canManage && (
          <Link
            href={`/admin/bibliotheques/${id}`}
            className="h-9 px-4 inline-flex items-center rounded-md bg-[var(--paper)] border border-[var(--rule)] text-[14px]"
          >
            Gérer la bibliothèque
          </Link>
        )}
      </header>

      <BookGrid libraryId={id} />
    </div>
  )
}
```

⚠️ Le composant `BookGrid` doit accepter une prop optionnelle `libraryId` qui scope l'appel `/api/books?libraryId=...`. À ajuster dans Task 8.4 si pas déjà le cas.

- [ ] **Step 2 : Type-check + commit**

```bash
npm run typecheck
git add app/(app)/bibliotheques/[id]/page.tsx
git commit -m "feat(ui): page /bibliotheques/[id] (scoped catalog)"
```

### Task 8.2 : Page admin `/admin/bibliotheques` (liste)

**Files:**
- Create: `app/admin/bibliotheques/page.tsx`

- [ ] **Step 1 : Créer la page**

```typescript
// app/admin/bibliotheques/page.tsx
import Link from "next/link"
import { redirect } from "next/navigation"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"

export default async function AdminLibrariesPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect("/login")
  if (session.user.role !== "ADMIN") redirect("/")

  const libraries = await db.library.findMany({
    include: {
      manager: { select: { name: true, email: true } },
      _count: { select: { copies: true, memberships: true } }
    },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }]
  })

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <h1 className="font-serif text-[28px] text-[var(--ink)]">Bibliothèques</h1>
        <Link
          href="/admin/bibliotheques/nouveau"
          className="h-9 px-4 inline-flex items-center rounded-md bg-[var(--accent)] text-[var(--accent-ink)] text-[14px]"
        >
          Créer une bibliothèque
        </Link>
      </header>

      <div className="rounded-md border border-[var(--rule)] divide-y divide-[var(--rule)] bg-[var(--paper)]">
        {libraries.map(lib => (
          <div key={lib.id} className="flex items-center justify-between px-4 py-3">
            <div className="flex-1">
              <div className="font-medium text-[var(--ink)]">{lib.name}</div>
              <div className="text-[13px] text-[var(--ink-3)] mt-0.5">
                {lib._count.copies} livres · {lib._count.memberships} membres
                {lib.manager && ` · Gérant : ${lib.manager.name ?? lib.manager.email}`}
                {lib.isDefault && " · Par défaut"}
              </div>
            </div>
            <Link
              href={`/admin/bibliotheques/${lib.id}`}
              className="text-[13px] text-[var(--accent)]"
            >
              {lib.isDefault ? "Voir" : "Gérer"}
            </Link>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2 : Créer la page de création `/admin/bibliotheques/nouveau`**

```typescript
// app/admin/bibliotheques/nouveau/page.tsx
import { redirect } from "next/navigation"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { CreateLibraryForm } from "@/components/libraries/CreateLibraryForm"
import { db } from "@/lib/db"

export default async function NewLibraryPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect("/login")
  if (session.user.role !== "ADMIN") redirect("/")

  const users = await db.user.findMany({
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" }
  })

  return (
    <div className="max-w-xl flex flex-col gap-6">
      <h1 className="font-serif text-[28px] text-[var(--ink)]">Nouvelle bibliothèque</h1>
      <CreateLibraryForm users={users} />
    </div>
  )
}
```

Plus le composant client :

```typescript
// components/libraries/CreateLibraryForm.tsx
"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"

type Props = {
  users: Array<{ id: string; name: string | null; email: string }>
}

export function CreateLibraryForm({ users }: Props) {
  const router = useRouter()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [managerId, setManagerId] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    const res = await fetch("/api/libraries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        description: description || undefined,
        managerId: managerId || null
      })
    })
    setSubmitting(false)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setError(j.error ?? "Erreur")
      return
    }
    const { library } = await res.json()
    router.push(`/admin/bibliotheques/${library.id}`)
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Input label="Nom *" value={name} onChange={e => setName(e.target.value)} required />
      <div className="flex flex-col gap-1.5">
        <label className="text-[13px] text-[var(--ink-3)] font-medium">Description</label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={3}
          className="rounded-md border border-[var(--rule)] bg-[var(--paper)] p-3 text-[14px]"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-[13px] text-[var(--ink-3)] font-medium">Gérant (optionnel)</label>
        <select
          value={managerId}
          onChange={e => setManagerId(e.target.value)}
          className="h-9 rounded-md border border-[var(--rule)] bg-[var(--paper)] px-3 text-[14px]"
        >
          <option value="">Aucun (admin seulement)</option>
          {users.map(u => (
            <option key={u.id} value={u.id}>
              {u.name ?? u.email}
            </option>
          ))}
        </select>
      </div>
      {error && <div className="text-[13px] text-[var(--err)]">{error}</div>}
      <div className="flex gap-2 justify-end">
        <Button type="submit" variant="primary" disabled={!name || submitting}>
          {submitting ? "Création..." : "Créer"}
        </Button>
      </div>
    </form>
  )
}
```

- [ ] **Step 3 : Type-check + commit**

```bash
npm run typecheck
git add app/admin/bibliotheques/ components/libraries/CreateLibraryForm.tsx
git commit -m "feat(ui): admin libraries index + create form"
```

### Task 8.3 : Page admin `/admin/bibliotheques/[id]` (gestion) + `MemberPicker`

**Files:**
- Create: `app/admin/bibliotheques/[id]/page.tsx`
- Create: `components/libraries/MemberPicker.tsx`
- Create: `components/libraries/EditLibraryForm.tsx`

- [ ] **Step 1 : Créer `MemberPicker.tsx`**

```typescript
// components/libraries/MemberPicker.tsx
"use client"
import { useState } from "react"
import { Button } from "@/components/ui/Button"

type Member = {
  id: string
  name: string | null
  email: string
  avatarColor: string
}

type Props = {
  libraryId: string
  allUsers: Member[]
  initialMemberIds: string[]
  managerId: string | null
  currentUserId: string
  onSaved?: () => void
}

export function MemberPicker({
  libraryId, allUsers, initialMemberIds, managerId, currentUserId, onSaved
}: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set(initialMemberIds))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const toggle = (userId: string) => {
    // Anti-lockout : impossible de se décocher si on est gérant
    if (userId === currentUserId && managerId === currentUserId && selected.has(userId)) {
      return
    }
    // Impossible de décocher le gérant (il doit rester membre)
    if (userId === managerId && selected.has(userId)) {
      return
    }
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
  }

  const onSubmit = async () => {
    setSubmitting(true)
    setError(null)
    setSuccess(false)
    const res = await fetch(`/api/libraries/${libraryId}/members`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userIds: [...selected] })
    })
    setSubmitting(false)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setError(j.error ?? "Erreur")
      return
    }
    setSuccess(true)
    onSaved?.()
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="max-h-96 overflow-y-auto rounded-md border border-[var(--rule)] divide-y divide-[var(--rule)] bg-[var(--paper)]">
        {allUsers.map(user => {
          const isManager = user.id === managerId
          const isCurrent = user.id === currentUserId
          const disabled = isManager  // gérant verrouillé
          const checked = selected.has(user.id)
          return (
            <label
              key={user.id}
              className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-[var(--paper-2)] ${
                disabled ? "opacity-60 cursor-not-allowed" : ""
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={() => toggle(user.id)}
              />
              <span
                className="size-7 rounded-full flex items-center justify-center text-[11px] text-white font-medium"
                style={{ backgroundColor: user.avatarColor }}
              >
                {(user.name ?? user.email).slice(0, 2).toUpperCase()}
              </span>
              <div className="flex-1">
                <div className="text-[14px] text-[var(--ink)]">
                  {user.name ?? user.email}
                  {isManager && (
                    <span className="ml-2 text-[11px] text-[var(--accent)]">(gérant)</span>
                  )}
                  {isCurrent && !isManager && (
                    <span className="ml-2 text-[11px] text-[var(--ink-3)]">(vous)</span>
                  )}
                </div>
                {user.name && (
                  <div className="text-[12px] text-[var(--ink-3)]">{user.email}</div>
                )}
              </div>
            </label>
          )
        })}
      </div>

      {error && <div className="text-[13px] text-[var(--err)]">{error}</div>}
      {success && <div className="text-[13px] text-[var(--ok)]">Membres mis à jour</div>}

      <Button variant="primary" onClick={onSubmit} disabled={submitting}>
        {submitting ? "Enregistrement..." : `Enregistrer (${selected.size} membres)`}
      </Button>
    </div>
  )
}
```

- [ ] **Step 2 : Créer `EditLibraryForm.tsx`** (nom + description + manager)

```typescript
// components/libraries/EditLibraryForm.tsx
"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"

type Props = {
  library: {
    id: string
    name: string
    description: string | null
    managerId: string | null
    isDefault: boolean
    bookCount: number
  }
  users: Array<{ id: string; name: string | null; email: string }>
}

export function EditLibraryForm({ library, users }: Props) {
  const router = useRouter()
  const [name, setName] = useState(library.name)
  const [description, setDescription] = useState(library.description ?? "")
  const [managerId, setManagerId] = useState(library.managerId ?? "")
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onSave = async () => {
    setSubmitting(true)
    setError(null)
    const res = await fetch(`/api/libraries/${library.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        description: description || null,
        managerId: managerId || null
      })
    })
    setSubmitting(false)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setError(j.error ?? "Erreur")
      return
    }
    router.refresh()
  }

  const onDelete = async () => {
    if (!confirm("Supprimer cette bibliothèque ?")) return
    setDeleting(true)
    setError(null)
    const res = await fetch(`/api/libraries/${library.id}`, { method: "DELETE" })
    setDeleting(false)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setError(j.error ?? "Erreur")
      return
    }
    router.push("/admin/bibliotheques")
  }

  const canDelete = !library.isDefault && library.bookCount === 0

  return (
    <div className="flex flex-col gap-4">
      <Input label="Nom" value={name} onChange={e => setName(e.target.value)} />
      <div className="flex flex-col gap-1.5">
        <label className="text-[13px] text-[var(--ink-3)] font-medium">Description</label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={3}
          className="rounded-md border border-[var(--rule)] bg-[var(--paper)] p-3 text-[14px]"
        />
      </div>
      {!library.isDefault && (
        <div className="flex flex-col gap-1.5">
          <label className="text-[13px] text-[var(--ink-3)] font-medium">Gérant</label>
          <select
            value={managerId}
            onChange={e => setManagerId(e.target.value)}
            className="h-9 rounded-md border border-[var(--rule)] bg-[var(--paper)] px-3 text-[14px]"
          >
            <option value="">Aucun (admin seulement)</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>{u.name ?? u.email}</option>
            ))}
          </select>
        </div>
      )}

      {error && <div className="text-[13px] text-[var(--err)]">{error}</div>}

      <div className="flex items-center justify-between pt-4 border-t border-[var(--rule)]">
        <Button
          variant="danger"
          onClick={onDelete}
          disabled={!canDelete || deleting}
          title={
            library.isDefault
              ? "La bibliothèque générale ne peut pas être supprimée"
              : library.bookCount > 0
              ? `Bibliothèque non vide (${library.bookCount} livres)`
              : undefined
          }
        >
          {deleting ? "Suppression..." : "Supprimer"}
        </Button>
        <Button variant="primary" onClick={onSave} disabled={submitting}>
          {submitting ? "Enregistrement..." : "Enregistrer"}
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3 : Créer la page de gestion**

```typescript
// app/admin/bibliotheques/[id]/page.tsx
import { redirect, notFound } from "next/navigation"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { canManageLibrary } from "@/lib/libraries"
import { EditLibraryForm } from "@/components/libraries/EditLibraryForm"
import { MemberPicker } from "@/components/libraries/MemberPicker"

type Props = { params: Promise<{ id: string }> }

export default async function AdminLibraryPage({ params }: Props) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect("/login")

  const canManage = await canManageLibrary(db, session.user.id, id)
  if (!canManage) redirect("/")

  const [library, allUsers] = await Promise.all([
    db.library.findUnique({
      where: { id },
      include: {
        memberships: { select: { userId: true } },
        _count: { select: { copies: true } }
      }
    }),
    db.user.findMany({
      select: { id: true, name: true, email: true, avatarColor: true },
      orderBy: { name: "asc" }
    })
  ])

  if (!library) notFound()

  const memberIds = library.memberships.map(m => m.userId)

  return (
    <div className="max-w-3xl flex flex-col gap-8">
      <header>
        <h1 className="font-serif text-[28px] text-[var(--ink)]">{library.name}</h1>
        {library.isDefault && (
          <p className="text-[13px] text-[var(--ink-3)] mt-1">
            Bibliothèque par défaut — appartenance gérée automatiquement
          </p>
        )}
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="font-serif text-[20px] text-[var(--ink)]">Paramètres</h2>
        <EditLibraryForm
          library={{
            id: library.id,
            name: library.name,
            description: library.description,
            managerId: library.managerId,
            isDefault: library.isDefault,
            bookCount: library._count.copies
          }}
          users={allUsers}
        />
      </section>

      {!library.isDefault && (
        <section className="flex flex-col gap-3">
          <h2 className="font-serif text-[20px] text-[var(--ink)]">Membres</h2>
          <MemberPicker
            libraryId={library.id}
            allUsers={allUsers}
            initialMemberIds={memberIds}
            managerId={library.managerId}
            currentUserId={session.user.id}
          />
        </section>
      )}
    </div>
  )
}
```

- [ ] **Step 4 : Type-check + commit**

```bash
npm run typecheck
git add app/admin/bibliotheques/[id]/page.tsx components/libraries/MemberPicker.tsx components/libraries/EditLibraryForm.tsx
git commit -m "feat(ui): admin library management page + MemberPicker + EditForm"
```

### Task 8.4 : Adapter `BookGrid` pour accepter une prop `libraryId`

**Files:**
- Modify: `components/books/BookGrid.tsx`

- [ ] **Step 1 : Ajouter la prop optionnelle**

```typescript
type Props = {
  libraryId?: string
  // ... props existantes
}

export function BookGrid({ libraryId, ...rest }: Props) {
  // Construire l'URL de fetch avec libraryId
  const url = `/api/books?${new URLSearchParams({
    ...(libraryId ? { libraryId } : {}),
    // ... autres params (q, type, format, sort, page)
  })}`
  // ...
}
```

- [ ] **Step 2 : Type-check + commit**

```bash
npm run typecheck
git add components/books/BookGrid.tsx
git commit -m "feat(ui): BookGrid accepts libraryId prop for scoped catalog"
```

---

## Phase 9 — UI : badges + fiche livre Planche

### Task 9.1 : Badge bib sur les BookCard (vues transverses)

**Files:**
- Modify: `components/books/BookCard.tsx`
- Modify: `components/books/Badges.tsx`

- [ ] **Step 1 : Ajouter un composant `LibraryBadge` dans `Badges.tsx`**

```typescript
export function LibraryBadge({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center h-5 px-2 rounded-full text-[11px] bg-[var(--paper-2)] text-[var(--ink-2)]">
      {name}
    </span>
  )
}
```

- [ ] **Step 2 : Étendre la prop du BookCard pour recevoir `library: { id, name, isDefault } | null` (issue des copies)**

Logique d'affichage du badge :
- Si la card est rendue sur `/bibliotheque` (Générale) : pas de badge.
- Si la card est rendue sur `/bibliotheques/[id]` : pas de badge.
- Si la card est rendue sur `/mes-livres`, `/mes-lectures`, recherche transverse : badge si `library.isDefault === false`.

Strat : passer la prop `showLibraryBadge: boolean` depuis le parent qui sait dans quel contexte on est. Plus simple que faire de l'usePathname dans BookCard.

```typescript
type BookCardProps = {
  // ... props existantes
  showLibraryBadge?: boolean
}

// Dans le rendu, à côté du badge format :
{showLibraryBadge && book.libraryName && !book.libraryIsDefault && (
  <LibraryBadge name={book.libraryName} />
)}
```

⚠️ Question : un Book a N copies, donc N libraries potentielles. Pour le badge, prendre la première bib non-défaut, sinon ne rien afficher. Logique côté API (DTO Book) : exposer un champ `primaryLibrary` qui = première copie visible non-Générale, sinon Générale.

- [ ] **Step 3 : Adapter le DTO Book**

Dans `GET /api/books` et `GET /api/books/[id]`, ajouter au DTO renvoyé :

```typescript
const primary = book.copies.find(c => !c.library.isDefault) ?? book.copies[0]
return {
  ...book,
  primaryLibrary: primary ? {
    id: primary.library.id,
    name: primary.library.name,
    isDefault: primary.library.isDefault
  } : null
}
```

- [ ] **Step 4 : Passer `showLibraryBadge` depuis les pages transverses**

- `/mes-livres` : `<BookGrid showLibraryBadge />`
- `/mes-lectures` : `<BookGrid showLibraryBadge />`
- Recherche transverse (topbar) : idem

- [ ] **Step 5 : Type-check + commit**

```bash
npm run typecheck
git add components/books/BookCard.tsx components/books/Badges.tsx app/api/books/route.ts app/api/books/[id]/route.ts app/(app)/
git commit -m "feat(ui): library badge on cross-library views"
```

### Task 9.2 : Fiche livre — badge "Planche" + propriétaire affiché

**Files:**
- Modify: `components/books/BookDetail.tsx`

- [ ] **Step 1 : Lire le composant**

```bash
cat components/books/BookDetail.tsx | head -100
```

- [ ] **Step 2 : Ajouter le badge "Planche" en haut de la fiche si `book.isPersonal`**

```tsx
{book.isPersonal && (
  <span className="inline-flex items-center h-6 px-2.5 rounded-full text-[12px] bg-[var(--accent-soft)] text-[#5a4711]">
    Planche
  </span>
)}
```

- [ ] **Step 3 : Pour les Planches, masquer le bouton "Demander en prêt" et "Télécharger" (le téléchargement reste OK si autorisation)**

Logique :
- Bouton "Télécharger" : visible pour tous les copies DIGITAL, y compris Planches (l'auteur ET les membres de la bib peuvent télécharger). Pas de masquage spécial.
- Bouton "Demander en prêt" : seulement pour copies PHYSICAL — donc déjà non-affiché sur Planches (qui sont DIGITAL PDF).

→ Aucun changement de bouton nécessaire ; juste afficher le badge.

- [ ] **Step 4 : Pour les Planches DIGITAL, afficher le propriétaire (uploader) sous la couverture**

Aujourd'hui le propriétaire (`BookCopy.owner`) n'est affiché que pour les copies PHYSICAL. Étendre à : "afficher si owner non null", indépendamment de type. Pour les Planches, l'owner sera l'uploader (cf. Task 7.2).

```tsx
{copy.owner && (
  <div className="flex items-center gap-2 text-[13px] text-[var(--ink-3)]">
    <span
      className="size-6 rounded-full flex items-center justify-center text-[10px] text-white"
      style={{ backgroundColor: copy.owner.avatarColor }}
    >
      {(copy.owner.name ?? copy.owner.email).slice(0, 2).toUpperCase()}
    </span>
    <span>
      {book.isPersonal ? "Auteur" : "Propriétaire"} : {copy.owner.name ?? "—"}
    </span>
  </div>
)}
```

- [ ] **Step 5 : Type-check + commit**

```bash
npm run typecheck
git add components/books/BookDetail.tsx
git commit -m "feat(ui): Planche badge + owner display on book detail"
```

### Task 9.3 : Adapter `lib/books-mutations.ts` (création Planche) — passer `ownerId = uploader`

**Files:**
- Modify: `lib/books-mutations.ts`

- [ ] **Step 1 : Dans `createBookWithCopy`, si `isPersonal === true`, forcer `ownerId = uploaderId`**

Côté `POST /api/books`, on passe déjà `session.user.id` comme `addedById`. Pour les Planches, propager comme `ownerId` aussi :

```typescript
// Dans createBookWithCopy :
const copy = await tx.bookCopy.create({
  data: {
    bookId: book.id,
    libraryId: input.libraryId,
    type: input.type,
    format: input.format,
    filePath: input.filePath,
    fileSize: input.fileSize,
    addedById: input.addedById,
    ownerId: input.isPersonal ? input.addedById : input.ownerId ?? null
  }
})
```

- [ ] **Step 2 : Type-check + commit**

```bash
npm run typecheck
git add lib/books-mutations.ts
git commit -m "feat(mutations): set ownerId=uploader for Planche copies"
```

---

## Phase 10 — Compilation, smoke E2E manuel, finalisation

### Task 10.1 : Type-check global + build

**Files:** aucun.

- [ ] **Step 1 : Type-check complet**

```bash
npm run typecheck
```

Expected: 0 erreur.

- [ ] **Step 2 : Build Next 16**

```bash
npm run build
```

Expected: build sans erreur, "Compiled successfully" + collecte des pages.

### Task 10.2 : Smoke E2E manuel (14 scénarios)

**Files:** aucun (test manuel).

Référence : spec §10. Pour chaque scénario, cocher quand validé. Utiliser :
- Au moins 1 ADMIN
- Au moins 2 USER (`alice@test.fr`, `bob@test.fr`)
- Une bib "Famille" créée par l'admin avec Alice + admin comme membres

Préparation :
```bash
docker compose up -d
npx prisma migrate deploy
npm run db:seed
npm run dev

# Dans un autre terminal, créer les users de test :
npx tsx scripts/dev-magic-link.ts alice@test.fr
npx tsx scripts/dev-magic-link.ts bob@test.fr
```

Scénarios à dérouler :

- [ ] **S1** : Admin crée "Famille", nomme Alice gérante, coche Alice. Alice voit "Famille" dans la sidebar. Bob ne voit pas.
- [ ] **S2** : Bob lance une recherche topbar sur un titre exclusif Famille → 0 résultat.
- [ ] **S3** : Alice retire un membre via cases à cocher → le retiré perd l'accès. Si un prêt en cours, il reste dans `/pret` jusqu'à `RETURNED`.
- [ ] **S4** : Alice ajoute "Madame Bovary" en Famille via mode Numérique → visible Alice + admin, invisible Bob.
- [ ] **S5** : Bob ajoute "Madame Bovary" (même ISBN) en Générale → dédup : 1 Book en DB, 2 BookCopy. Bob voit 1 copie. Alice voit 2 copies sur la fiche.
- [ ] **S6** : Alice crée une Planche via mode "Planche" → upload PDF, badge "Planche" visible, propriétaire = Alice, dédup ISBN désactivée (essayer de re-uploader le même PDF → nouvelle Planche créée, pas de dédup).
- [ ] **S7** : Admin tente de supprimer "Famille" qui contient encore "Madame Bovary" + la Planche → 409, bouton greyed, tooltip explicite.
- [ ] **S8** : Alice supprime ses copies en Famille (les 2). Admin supprime "Famille" → OK, cascade des memberships.
- [ ] **S9** : Admin tente DELETE sur la Générale → 403.
- [ ] **S10** : Admin invite charlie@test.fr en cochant "Famille" → user créé + memberships Générale + Famille (vérifier via `psql` que les 2 LibraryMembership existent).
- [ ] **S11** : Bob tente de télécharger une copie EPUB en Famille (URL devinée) → 403.
- [ ] **S12** : Bob tente POST /api/loans avec copyId d'une copie en Famille → 403.
- [ ] **S13** : Bob lance recherche topbar sur "Madame Bovary" qui existe en Générale aussi → trouve 1 résultat (sa propre copie).
- [ ] **S14** : Admin renomme la Générale en "Bibliothèque principale" → OK, isDefault préservé. Re-tente suppression Générale → 403.

### Task 10.3 : Vérifier édition fiche livre (déjà existante) + scénario Planche

**Files:** aucun.

- [ ] **Step 1 : Vérifier qu'un membre de Famille peut éditer la fiche d'une Planche qu'il a uploadée**

Aller sur `/bibliotheque/<book_id>/modifier` pour une Planche dont l'user est addedBy → OK, modification visible.

- [ ] **Step 2 : Vérifier qu'un non-membre tombe sur 404 si l'URL est devinée**

Tester `/bibliotheque/<book_id_planche_famille>/modifier` avec un user non-membre → 404.

### Task 10.4 : Mettre à jour `PROGRESS.md`

**Files:**
- Modify: `PROGRESS.md`

- [ ] **Step 1 : Ajouter une entrée V1.6**

Ajouter dans le tableau des versions livrées :

```markdown
| **V1.6** | branche `feat/v1-6-bibliotheques` | **Bibliothèques restreintes par groupes** (Library + LibraryMembership + scope BookCopy.libraryId) + **mode "Planche"** (écrit personnel, Book.isPersonal, propriétaire affiché). Visibilité ADMIN super-visibilité, USER via memberships explicites. Plan : `docs/superpowers/plans/2026-05-12-bibliotheques-et-planches.md`. Spec : `docs/superpowers/specs/2026-05-12-bibliotheques-et-planches-design.md`. |
```

Ajouter dans la section API :

```
GET    /api/libraries                              liste des bibs visibles
GET    /api/libraries/[id]                         détails (members si gérant/admin)
POST   /api/libraries                              admin only — créer
PATCH  /api/libraries/[id]                         admin only — rename/manager/desc
DELETE /api/libraries/[id]                         admin only — 409 si non vide, interdit si isDefault
PUT    /api/libraries/[id]/members                 admin/gérant — batch replace
DELETE /api/libraries/[id]/members/[userId]        admin/gérant — retire un membre
```

- [ ] **Step 2 : Commit**

```bash
git add PROGRESS.md
git commit -m "docs: update PROGRESS.md for V1.6"
```

### Task 10.5 : Push + ouvrir PR (ou squash-merge direct)

**Files:** aucun.

- [ ] **Step 1 : Push de la branche**

```bash
git push -u origin feat/v1-6-bibliotheques
```

- [ ] **Step 2 : Au choix**

(a) PR avec relecture :
```bash
gh pr create --title "feat: V1.6 — Bibliothèques restreintes + Planches" --body "$(cat <<'EOF'
## Summary
- Système de bibliothèques restreintes par groupes d'users (Library + LibraryMembership)
- Scope BookCopy.libraryId — œuvre Book partagée, copies scopées
- 4e mode d'ajout "Planche" pour écrits personnels (Book.isPersonal=true)
- Helper de visibilité centralisé lib/libraries.ts (ADMIN super-visibilité + USER via memberships)
- Migration custom avec backfill : seed lib_generale + memberships tous users existants

## Test plan
- [x] Type-check
- [x] Build Next 16
- [x] 14 scénarios E2E manuels (cf. plan §10.2)
- [x] Smoke libraries-smoke.ts

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

(b) Squash-merge direct sur main :
```bash
git checkout main
git merge --squash feat/v1-6-bibliotheques
git commit -m "feat: V1.6 — Bibliothèques restreintes + Planches"
git push origin main
```

---

## Self-Review (faite au moment de l'écriture du plan)

**Spec coverage** — pointage section/spec ↔ task :

- Spec §1 Modèle de données → Task 1.1, 1.2, 1.3
- Spec §2 Helper visibility → Task 2.1, 2.2, 2.3
- Spec §3 API nouvelles → Task 5.1, 5.2, 5.3, 5.4
- Spec §3 API adaptations → Task 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8
- Spec §4 UX/Sidebar → Task 6.2
- Spec §4 UX/AddBookFlow + Planche → Task 7.1, 7.2, 7.3, 7.4
- Spec §4 UX/Bib pages → Task 8.1, 8.2, 8.3
- Spec §4 UX/Badge bib + fiche Planche → Task 9.1, 9.2, 9.3
- Spec §5 Permissions → couverte par helpers Task 2.3 + matrice appliquée dans 5.* et 4.*
- Spec §6 Cas limites → couverts par Tasks 4.7 (loans), 4.8 (invites), 5.2 (DELETE bib vide), 5.3 (anti-lockout)
- Spec §7 Migration → Task 1.2, 1.3, 1.4
- Spec §8 Fichiers impactés → tous couverts par les phases 1-9
- Spec §10 Smoke E2E → Task 10.2 (14 scénarios)

**Placeholder scan** : aucun "TBD", "implement later", code non spécifié. Les ⚠️ inline (SWR vs fetch, server-only, etc.) sont des branches conditionnelles avec recettes complètes.

**Type consistency** : `LibrarySelector` value/onChange cohérents entre Task 6.1, 7.2, 7.3. `MemberPicker` props alignés avec API PUT Task 5.3. `getVisibleLibraryIds` signature identique partout (Task 2.1 → utilisée dans 4.x et 5.x).

**Risque connu** : la Task 4.4 modifie le check de duplicate format (scope à la bib). Comportement V1.3 = check global sur Book. Risque que des tests/comportements implicites s'appuient sur l'ancien check. Atténué par Task 10.2 S5 qui force le comportement attendu.

---

## Notes pour l'engineer

- **Commits fréquents** : chaque task = 1 commit. Si une task est trop grosse à mémoriser, split en sub-commits cohérents.
- **Pas de `npm run lint`** : casse Next 16 (mémoire `feedback_gotchas`). Utiliser `npm run typecheck`.
- **Mode 100755 sur Synology** : si `git status` montre des fichiers modifiés sans diff de contenu, c'est un changement de permissions dû à Synology Drive. Ne pas commiter ces "modifs". Utiliser `git diff --stat` pour confirmer (taille 0). Cf. mémoire `feedback_gotchas`.
- **Logger** : utiliser `lib/logger.ts` (pas de `console.log` en prod). Cf. mémoire `feedback_conventions`.
- **Texte UI** : tout en français. Zéro emoji UI. Lucide icons uniquement.
- **Couleurs** : tokens CSS uniquement (`var(--accent)`, etc.). Zéro hex hardcodé.
- **Si une étape ne passe pas le type-check** : ne pas commit. Investiguer la cause. Possibles : `params` async dans Next 16 (toujours `await params`), import cyclique, prop mismatch entre TSX et hook.
- **Login dev sans SMTP** : `npx tsx scripts/dev-magic-link.ts <email>` génère un magic link console (mémoire `reference_dev_environment`).

