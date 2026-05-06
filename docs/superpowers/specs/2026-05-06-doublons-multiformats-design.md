# Doublons & multi-formats — Design

**Date** : 2026-05-06
**Statut** : design validé, en attente de plan d'implémentation
**Version cible** : V1.3

## Contexte

Identifié en condition réelle d'usage le 2026-05-05 (premier test prod avec amis) :

1. **Doublons** : rien n'empêche actuellement d'ajouter deux fois le même livre (même ISBN ou même titre+auteur). Aucune contrainte d'unicité sur `Book.isbn`.
2. **Multi-formats** : chaque upload crée une nouvelle row `Book`. Candide en EPUB puis Candide en PDF = deux entrées distinctes dans le catalogue. UX dégradée et duplication de métadonnées.

Ces deux limitations sont liées : un schéma multi-formats résout structurellement la moitié des cas de doublons digitaux.

**Note prod** : la base actuelle ne contient que quelques livres de test ajoutés par les amis du cercle. La DB peut être réinitialisée — pas de migration data complexe à gérer.

## Récapitulatif des choix de design

| Décision | Choix | Justification rapide |
|---|---|---|
| Ampleur du chantier | Refactor `Book` ↔ `BookCopy` en une release | Résout multi-formats *et* doublons d'un seul coup, modèle propre une bonne fois |
| Critère de détection | ISBN strict, fallback slug titre+auteur normalisés | ISBN = identifiant fiable et présent grâce aux APIs (Google/BnF/OL), slug pour les ajouts manuels |
| UX du match | Hybride : auto-merge si ISBN, confirmation si slug, blocage si conflit format/owner | Confiance variable selon le critère, friction proportionnelle au risque |
| Migration data | DB reset | Early prod, livres de test uniquement |
| Affichage fiche | Boutons par format + modal pour prêt physique, détails copies repliables | Anticipe la conversion EPUB↔PDF côté serveur (feature future) |
| Édition métadonnées Book | `addedBy` d'au moins une copie + admin | Évite les blocages quand le créateur original est inactif |
| Suppression copie | `addedBy` de la copie + admin | Pas de droit sur les copies des autres |
| Cascade dernière copie | Book + Readings supprimés | Si plus personne n'a le livre, l'historique de lecture perd son sens |
| Conversion EPUB↔PDF | Feature future, hors scope V1.3 | Le download API (`?format=`) prépare la voie sans bloquer |

---

## 1. Modèle de données

### Schéma Prisma

```prisma
model Book {
  id           String     @id @default(cuid())
  title        String
  author       String?
  isbn         String?    @unique           // strict si renseigné, null autorisé multiple fois (Postgres)
  description  String?    @db.Text
  genre        String?
  year         Int?
  publisher    String?
  language     String?    @default("fr")
  coverUrl     String?
  sourceApi    String?                       // "google_books" | "open_library" | "bnf" | "manual"
  externalId   String?
  matchKey     String                        // slug normalisé (titre+auteur), index pour lookup
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
  id           String      @id @default(cuid())
  bookId       String
  book         Book        @relation(fields: [bookId], references: [id], onDelete: Cascade)

  type         CopyType                       // DIGITAL | PHYSICAL

  // DIGITAL only
  format       FileFormat?                    // EPUB | PDF
  filePath     String?                        // "copies/{copyId}.{ext}"
  fileSize     Int?

  // PHYSICAL only
  ownerId      String?
  owner        User?       @relation("CopyOwner", fields: [ownerId], references: [id])

  // Toujours
  addedById    String
  addedBy      User        @relation("CopyAdder", fields: [addedById], references: [id])
  addedAt      DateTime    @default(now())
  updatedAt    DateTime    @updatedAt

  loans        Loan[]

  @@index([bookId])
  @@index([ownerId])
  @@index([addedById])
}

enum CopyType   { DIGITAL  PHYSICAL }
enum FileFormat { EPUB     PDF }
```

### Notes

- **`@@unique([matchKey])` retiré** : un user peut explicitement vouloir une fiche distincte malgré un slug identique (édition différente, traduction). Le slug *suggère*, ne *contraint* pas. L'ISBN reste strict — deux Books avec le même ISBN = bug.
- **Contraintes copies** : implémentées en check applicatif côté API (Zod + `findFirst`). Postgres traite les nulls comme distincts dans `@@unique` partiels, donc des contraintes natives `WHERE format IS NOT NULL` seraient possibles mais alourdiraient la migration. Le check applicatif suffit pour V1.3 et reste correct vu le volume.
  - Digital : `(bookId, format)` doit être unique
  - Physical : `(bookId, ownerId)` doit être unique avec `type = PHYSICAL`

### Modèles impactés en cascade

```prisma
model Loan {
  id          String     @id @default(cuid())
  copyId      String                          // ← remplace bookId
  copy        BookCopy   @relation(fields: [copyId], references: [id], onDelete: Cascade)
  // … reste inchangé (requesterId, ownerId, status, token, tokenExpiry, returnedAt, createdAt, updatedAt)
}

model Reading {
  id        String        @id @default(cuid())
  userId    String
  user      User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  bookId    String
  book      Book          @relation(fields: [bookId], references: [id], onDelete: Cascade)  // ← AJOUT cascade
  status    ReadingStatus @default(TO_READ)
  addedAt   DateTime      @default(now())
  updatedAt DateTime      @updatedAt
  @@unique([userId, bookId])
  @@index([userId, status])
}
```

`Reading` reste sur `Book` car la lecture concerne l'œuvre, pas un exemplaire précis. Ajout de `onDelete: Cascade` requis : avec le nouveau modèle, un Book peut désormais disparaître (cascade depuis la suppression de sa dernière copie) — sans cascade, on aurait une violation de FK.

### Modèle `User` — relations à mettre à jour

Les relations actuelles `ownedBooks: Book[] @relation("BookOwner")` et `addedBooks: Book[] @relation("BookAdder")` disparaissent du `User`. Elles sont remplacées par :

```prisma
model User {
  // … champs existants inchangés …

  ownedCopies   BookCopy[]  @relation("CopyOwner")    // ← remplace ownedBooks
  addedCopies   BookCopy[]  @relation("CopyAdder")    // ← remplace addedBooks
  loanRequests  Loan[]      @relation("LoanRequester")  // inchangé
  loansReceived Loan[]      @relation("LoanOwner")      // inchangé
  readings      Reading[]                                // inchangé
  // … reste inchangé …
}
```

---

## 2. Détection des doublons

### Calcul de la `matchKey`

```typescript
// lib/match.ts
export function computeMatchKey(title: string, author: string | null): string {
  const norm = (s: string) =>
    s.normalize("NFD")
     .replace(/[\u0300-\u036f]/g, "")  // diacritiques
     .toLowerCase()
     .replace(/[^a-z0-9 ]+/g, " ")        // ponctuation -> espace
     .replace(/\s+/g, " ")                 // collapse espaces
     .trim()
  return `${norm(title)}--${norm(author ?? "")}`
}
```

Calculée à chaque `INSERT`/`UPDATE` du `Book`. Stockée et indexée.

**Exemples** :
- `"Candide ou l'Optimisme"` + `"Voltaire"` → `candide ou l optimisme--voltaire`
- `"Candide"` + `"Voltaire"` → `candide--voltaire` (slug différent — l'ISBN reste le filet de sécurité)
- `"Les Misérables"` + `"Victor Hugo"` → `les miserables--victor hugo`

### Endpoint `POST /api/books/match`

```
Input  : { title: string, author?: string, isbn?: string }
Output : { match: null | { bookId: string, confidence: "high" | "low", book: BookPublic } }
```

Logique :
1. Si `isbn` fourni et match en DB → `confidence: "high"`
2. Sinon, si `matchKey` calculé match en DB → `confidence: "low"`
3. Sinon → `null`

Lecture seule, idempotent. Le client appelle `/match` *avant* la soumission finale.

### Branching côté client

```
match.confidence === "high"   → POST /api/books/[id]/copies (silencieux + toast)
match.confidence === "low"    → <DuplicateConfirmModal /> :
                                  "Fusionner"        → POST /api/books/[id]/copies
                                  "Fiche distincte"  → POST /api/books
match === null                → POST /api/books
```

### Race conditions

Entre `/match` et la soumission, un autre user peut créer le Book ou la copie. Côté serveur, la soumission catche les violations d'unicité (ISBN dupliqué, copie dupliquée) et retourne un **409 Conflict** propre :
- Pour ISBN dupliqué : "Un autre utilisateur vient d'ajouter ce livre. Voulez-vous y ajouter votre copie ?" (avec `bookId` dans la réponse pour bascule directe)
- Pour copie dupliquée : "Cette bibliothèque contient déjà Candide en EPUB." / "Vous avez déjà déclaré votre exemplaire physique de Candide."

---

## 3. Flow UI d'ajout

Le `/match` s'insère **juste avant le submit final**, après que l'user a confirmé/édité la fiche pré-remplie.

### Digital (`DigitalUploadFlow.tsx`)

```
Step 1  Dépôt fichier (upload temp -> uploadId)        [structure inchangée]
Step 2  Concordance API (Google/BnF/OL)                 [structure inchangée]
Step 3  Fiche pré-remplie + bouton "Ajouter"
        ↓
        POST /api/books/match { title, author, isbn }
        ↓
        confidence "high"  →  POST /api/books/[id]/copies + toast "Ajouté à la fiche existante"
        confidence "low"   →  <DuplicateConfirmModal>
                                "Fusionner"        → POST /api/books/[id]/copies
                                "Fiche distincte"  → POST /api/books
        match: null        →  POST /api/books
```

### Physical (`PhysicalFlow.tsx`)

Même branching après le submit final, sans la partie upload fichier. Les 3 modes (ISBN / recherche / manuel) restent identiques jusqu'à l'étape de confirmation.

### `<DuplicateConfirmModal>` — contenu

```
[Cover Candide]   On a trouvé un livre similaire dans la bibliothèque.

                  Candide ou l'Optimisme
                  Voltaire — 1759
                  ISBN : 978-…

                  Copies déjà disponibles :
                    • EPUB ajouté par Bob
                    • Physique chez Charlie

                  [ Ajouter votre PDF à cette fiche ]   ← primary
                  [ Créer une fiche distincte ]        ← ghost
                  [ Annuler ]
```

L'user voit *exactement* ce qu'il s'apprête à fusionner avant de cliquer.

### Gestion des conflits (409) inline

- Digital : "Cette bibliothèque contient déjà Candide en EPUB. Vous pouvez modifier la fiche existante ou choisir un autre format."
- Physical : "Vous avez déjà déclaré votre exemplaire physique de Candide. Une seule copie physique par utilisateur."

Le fichier temp (`uploadId`) est préservé en cas de 409 — l'user peut corriger ses inputs sans re-uploader. Cleanup via cron `_pending/` (>1h) déjà listé en polish.

### Cas frontière "fiche distincte avec ISBN existant"

Si l'user a fait un match `"low"`, choisi "Créer une fiche distincte", et qu'on détecte un conflit ISBN strict côté serveur (autre Book avec le même ISBN qu'il a saisi), on retourne un 409 avec le `bookId` du Book existant. Le client propose alors de basculer dessus. Protection contre l'utilisateur qui ignorerait délibérément le match.

---

## 4. Impacts API

| Méthode | Endpoint | Changement |
|---|---|---|
| `POST` | `/api/books/match` | **NOUVEAU** — lookup ISBN/slug, retourne `match \| null` |
| `POST` | `/api/books/[id]/copies` | **NOUVEAU** — ajoute une copie à un Book existant |
| `DELETE` | `/api/books/[id]/copies/[cid]` | **NOUVEAU** — supprime une copie (cascade Book si dernière) |
| `POST` | `/api/books` | Modifié — crée Book + 1ère `BookCopy` en transaction |
| `GET` | `/api/books` | Modifié — shape inclut `copies[]`. `?format=EPUB` filtre via copies. `?type=DIGITAL\|PHYSICAL` filtre via `copies.some(type=...)` |
| `GET` | `/api/books/[id]` | Modifié — inclut `copies[]` avec `owner` et `addedBy` |
| `PATCH` | `/api/books/[id]` | Modifié — édite uniquement métadonnées Book. Permission : `addedBy` d'au moins une copie + admin |
| `DELETE` | `/api/books/[id]` | Modifié — admin only (chemin "à la nucléaire") |
| `GET` | `/api/books/[id]/download` | Modifié — prend `?format=EPUB\|PDF`, 404 si format absent. Conversion EPUB↔PDF ajoutée plus tard |
| `POST` | `/api/loans` | Modifié — prend `copyId` au lieu de `bookId` |
| `GET` | `/api/loans` | Modifié — shape : `loan.copy.book.title` (un niveau de plus) |
| `GET` | `/api/loans/[id]/respond` | Modifié — idem |
| `PATCH` | `/api/loans/[id]/return` | Modifié — idem |

### Validation Zod (POST `/api/books`)

```typescript
const Common = z.object({
  title: z.string().trim().min(1).max(500),
  author: z.string().trim().max(300).optional().nullable(),
  isbn: z.string().trim().max(20).optional().nullable(),
  // … description, genre, year, publisher, language, coverUrl, sourceApi, externalId
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
```

### Validation Zod (POST `/api/books/[id]/copies`)

```typescript
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
```

---

## 5. Impacts UI

### Composants à toucher

| Fichier | Changement |
|---|---|
| `components/books/BookCard.tsx` | Badges "EPUB \| PDF \| Physique × 2" via `copies` |
| `components/books/BookGrid.tsx` | Inchangé sauf adaptation du shape |
| `components/books/BookList.tsx` | Colonne "Formats disponibles" remplace "Format" |
| `components/books/BookDetail.tsx` | **REFONTE** : section copies + boutons par format + modal "Demander en prêt" si plusieurs owners physiques + section "Détails copies" repliable |
| `components/books/DigitalUploadFlow.tsx` | Ajout étape `/match` + modale duplicate après submit |
| `components/books/PhysicalFlow.tsx` | Idem |
| `components/books/EditBookForm.tsx` | Édite uniquement métadonnées Book. Format/filePath disparaissent |
| `components/books/LoanRequestButton.tsx` | Prend une copie précise (modal de choix si plusieurs) |
| `components/books/DeleteBookButton.tsx` | Devient `DeleteCopyButton` (1 par copie dans la fiche) |
| `components/books/DuplicateConfirmModal.tsx` | **NOUVEAU** |
| `components/books/CopyList.tsx` | **NOUVEAU** — section liste des copies pour `BookDetail` |

### Lib

| Fichier | Changement |
|---|---|
| `lib/match.ts` | **NOUVEAU** — `computeMatchKey()` + helpers de lookup |
| `lib/books.ts` | `PUBLIC_BOOK_SELECT` inclut `copies` (avec `PUBLIC_COPY_SELECT`) |
| `lib/storage.ts` | Inchangé. La clé fichier passe de `"books/{bookId}.{ext}"` à `"copies/{copyId}.{ext}"` (meilleur nommage sémantique) |

### Pages

- `/mes-livres` : "livres où j'ai au moins une copie" → `Book WHERE copies.some(c => c.addedById = me)`
- `/pret` : envois et réceptions, ajusté pour traverser `Loan.copy.book` au lieu de `Loan.book`
- `/bibliotheque` et `/bibliotheque/[id]` : adaptés au nouveau shape

---

## 6. Permissions consolidées

| Action | Qui |
|---|---|
| Lecture catalogue, fiche, download | Tout user authentifié |
| Créer un nouveau Book (`POST /api/books`) | Tout user authentifié |
| Ajouter une copie (`POST /api/books/[id]/copies`) | Tout user authentifié |
| Éditer métadonnées Book (`PATCH /api/books/[id]`) | `addedBy` d'au moins une copie sur ce Book + admin |
| Supprimer une copie (`DELETE /.../copies/[cid]`) | `addedBy` de la copie + admin |
| Supprimer un Book entier (`DELETE /api/books/[id]`) | Admin only (modération) |
| Demander un prêt sur copie physique | Tout user, sauf si owner = requester |
| Accepter/refuser/marquer rendu un prêt | Owner via JWT (inchangé) |

---

## 7. Suppression et orphelinage

### Cascade Prisma

```prisma
BookCopy → Loan      onDelete: Cascade (perte historique acceptable)
Book     → BookCopy  onDelete: Cascade
Book     → Reading   onDelete: Cascade
```

### `DELETE /api/books/[id]/copies/[cid]` — logique transactionnelle

1. Vérifier qu'il n'y a pas de loan **actif** (`PENDING` ou `ACCEPTED`) sur cette copie.
   - Si oui → 409 "Cette copie est actuellement prêtée à X. Marquez le prêt comme rendu avant de la retirer."
2. Supprimer la copie (cascade automatique sur loans terminés).
3. Si c'était la dernière copie du Book → supprimer le Book (cascade automatique sur readings).
4. Supprimer le fichier physique du disque (digital uniquement).

### Suppression d'une copie digitale

Pas de notion de loan. Pas de blocage. Cascade simple + `deleteByKey()`.

### `DELETE /api/books/[id]` (admin)

Cascade *tout* en une transaction, plus suppression de tous les fichiers digitaux concernés. Réservé aux cas de modération. Ne devrait quasi jamais être utilisé.

---

## 8. Plan de test (smoke E2E manuel)

Conforme à la pratique actuelle (cf. mémoire `feedback_conventions` — pas de tests automatisés au-delà du smoke). Scénarios à dérouler manuellement avant merge :

1. Upload digital nouveau Book → fiche créée
2. Upload digital sur Book existant via match ISBN → auto-merge silencieux + toast
3. Upload digital match slug seulement → modale → "Fusionner" → copie ajoutée
4. Upload digital match slug seulement → modale → "Fiche distincte" → 2 Books distincts
5. Upload digital avec format déjà présent → 409 propre
6. Ajout physique sur Book digital existant → fusion via match
7. Ajout physique alors que l'user a déjà sa copie physique → 409 propre
8. Téléchargement par format depuis `BookDetail`
9. Demande de prêt avec un seul owner physique → flow direct
10. Demande de prêt avec 2 owners physiques → modal de choix
11. Suppression d'une copie digitale → fichier supprimé du disque
12. Suppression d'une copie physique avec loan PENDING → 409 propre
13. Suppression de la dernière copie d'un Book → Book + Readings supprimés en cascade
14. Edit métadonnées Book par un user qui a une copie → OK
15. Edit métadonnées Book par un user sans copie → 403

---

## 9. Hors scope V1.3

- Conversion EPUB↔PDF côté serveur (le download API `?format=` la prépare sans bloquer)
- Outil admin de fusion de Books (pas nécessaire, DB neuve)
- Hash de fichier comme contrainte d'unicité supplémentaire (la combo ISBN + format suffit)
- Extraction auto du titre depuis EPUB/PDF (statu quo : nom de fichier)
- Tests automatisés au-delà du smoke E2E manuel

---

## 10. Reset de DB

Approche dev :
1. `docker compose down -v` (volume Postgres détruit)
2. `docker compose up -d`
3. Suppression de l'ancienne migration `prisma/migrations/20260505142536_init/`
4. Nouvelle migration `prisma/migrations/<timestamp>_book_copies_init/` générée à partir du nouveau schéma
5. `npx prisma migrate deploy`
6. `npm run db:seed`

Approche prod :
- Coolify : reset du volume Postgres avant déploiement de la nouvelle image
- Suppression du volume `UPLOAD_DIR` (les fichiers de test ne sont plus référencés par le nouveau schéma)

---

## Source de vérité produit

`CLAUDE.md` à la racine du repo. Cette spec ajoute une release V1.3 par-dessus, sans contredire les invariants (stack, design system, modèle de données *adapté* mais cohérent — `Book` reste l'œuvre, on enrichit avec `BookCopy`).
