# Upload en masse — Design

**Date** : 2026-05-06
**Statut** : design validé, en attente de plan d'implémentation
**Version cible** : V1.4

## Contexte

Aujourd'hui l'upload de livres numériques se fait fichier par fichier via `DigitalUploadFlow.tsx` (3 étapes : dépôt → match métadonnées → fiche). Acceptable pour 5 livres, infaisable pour 100.

Cas d'usage déclencheur : un admin a un dossier de 100 livres numériques (mix EPUB/PDF) à ingérer. Le défi UX central est de **valider la correspondance des métadonnées de chaque livre sans imposer 100 confirmations manuelles**.

Le modèle `Book ↔ BookCopy[]` (issu de la V1.3) facilite la chose : un même livre peut héberger plusieurs copies (EPUB + PDF du même titre), et la détection de doublons par ISBN/matchKey est déjà implémentée dans `lib/match.ts`.

## Périmètre V1.4

- **Admin uniquement**. Pas d'accès users V1, mais l'architecture (limite configurable) doit permettre une extension users en V1.5+ avec cap à 10-20 fichiers.
- **Inputs** : drag & drop dossier (HTML5 `webkitdirectory`) ou multi-sélection fichiers. Filtrage client à `.epub` / `.pdf`.
- **Doublons** : politique automatique avec override par ligne (cf. section Décisions).
- **Reprise** : session persistée en DB, reprise possible après crash navigateur.
- **Commit partiel** : autorisé (importer les Auto OK pendant que le reste est en revue).

Hors scope V1.4 :
- Upload bulk pour les users non-admin (V1.5+, design extensible)
- Inbox serveur (dépôt SCP / Synology Drive) — power-feature future
- Conversion EPUB↔PDF post-import — déjà hors scope général

## Récapitulatif des décisions

| Décision | Choix | Justification |
|---|---|---|
| Accès | Admin only V1.4 | Cap users en V1.5 (10-20 fichiers) — design ne doit pas se peindre dans un coin |
| Input fichiers | Drag & drop dossier OU multi-sélection | Pas de ZIP (étape de prep inutile), pas de SSH (couple à infra) |
| Stratégie review | Tableau triable + drill-down drawer | Vue dense + bulk-action pour Auto OK, drawer spécialisé par type de problème |
| Auto-accept | ISBN strict OU titre+auteur avec match unique fort | Levenshtein ≥ 0.85 sur titre ET auteur, et pas d'autre candidat top 3 ≥ 0.7 |
| Doublon ISBN strict | Auto-merge sur Book existant (status `DUPLICATE`, decision `MERGE` pré-remplie) | Comportement actuel single upload |
| Doublon titre+auteur | Status `DUPLICATE`, decision à valider manuellement | Risque de faux positif sur titres communs |
| Doublons internes au lot | Auto-grouper si 2 items pointent vers le même match proposé | Résultat = 1 Book + N BookCopy |
| Persistence | Session en DB (`BulkImportSession` + `BulkImportItem`) | Reprise après crash + audit |
| Commit | Partiel autorisé (par sélection ou par status) | L'admin peut traiter les Auto OK sans attendre la fin |
| Concurrent uploads client | 3 simultanés | Compromis entre vitesse et saturation réseau |
| Polling | Toutes les 3s tant qu'items en `PENDING`/`PROCESSING` | Pas de WebSocket V1, suffisant à l'échelle attendue |
| Cleanup | Sessions abandonnées > 7j → purge pending files | Étension du script `cleanup-pending` existant |

---

## 1. Architecture & flow utilisateur

### Page admin

```
/admin/bulk-import          → écran de drop + liste des sessions IN_PROGRESS
/admin/bulk-import/[id]     → tableau de review d'une session
```

### Phases

**Phase 1 — Drop**

L'admin dépose un dossier (ou multi-sélection). Le client filtre les fichiers à `.epub` / `.pdf`. Affichage récap (`98 EPUB + 47 PDF, 612 Mo`). CTA "Démarrer".

Avertissement si > 200 fichiers ; refus si > 500 fichiers (limite serveur, ajustable).

**Phase 2 — Processing**

Au clic "Démarrer" :
1. `POST /api/admin/bulk-imports` crée une `BulkImportSession` (status `IN_PROGRESS`).
2. Le client uploade les fichiers en parallèle (concurrence 3) via `POST /api/admin/bulk-imports/[id]/upload`. Chaque upload crée un `BulkImportItem` lié à la session.
3. Pour chaque upload réussi, le client appelle `POST /api/admin/bulk-imports/[id]/items/[itemId]/process` (fire-and-forget) qui :
   - Extrait métadonnées internes (EPUB → `metadata.opf` ; PDF → `pdf.info`)
   - Cherche dans BnF / Google Books / Open Library via `lib/metadata.ts` existant
   - Applique le scoring (ISBN strict → AUTO_OK ; titre+auteur match unique fort → AUTO_OK ; sinon TO_REVIEW ou MANUAL)
   - Détecte les doublons via `lib/match.ts` existant → status `DUPLICATE` si match
   - Persiste le résultat (`candidatesJson`, `chosenCandidate`, `mergeIntoBookId`, `status`)

Throttle : délai 100ms entre 2 calls API metadata pour ne pas hammer Google Books.

**Phase 3 — Review**

Le tableau s'affiche dès le premier item disponible. L'admin peut :
- Filtrer par status (pills cliquables)
- Bulk-importer les Auto OK pendant que le processing continue
- Drill-down dans un drawer pour résoudre les TO_REVIEW / MANUAL / DUPLICATE
- Naviguer entre items du même status dans le drawer (Précédent / Suivant)

**Phase 4 — Commit**

`POST /api/admin/bulk-imports/[id]/commit` (avec ou sans `itemIds`) déroule l'algorithme suivant en transaction :

1. Charger les items concernés (par `itemIds` ou tous ceux de la session avec `decision != NONE`)
2. Séparer en 3 buckets : `CREATE`, `MERGE`, `SKIP`
3. **Bucket SKIP** : pour chaque item, `deletePending(uploadId)` puis update item (sans `committedBookId`)
4. **Bucket MERGE** : pour chaque item, `addCopyToBook(mergeIntoBookId, copyInput, ownerId)` (réutilise la logique de `POST /api/books/[id]/copies`), update `committedBookId` + `committedCopyId`
5. **Bucket CREATE** : 
   - Regrouper par signature commune (cf. section 5 — détection doublons internes)
   - Pour chaque groupe : `createBookWithCopy(metadata, ownerId)` pour le 1er item (crée Book + BookCopy), puis `addCopyToBook(book.id, ...)` pour les N-1 autres
   - Update `committedBookId` + `committedCopyId` sur chaque item du groupe
6. Re-vérifier l'état de la session : si TOUS les items ont une `decision != NONE`, set `status = COMMITTED` et `committedAt = now()`. Sinon laisser `IN_PROGRESS` (commit partiel).

Réponse : `{ created, merged, skipped, errors: { itemId, error }[] }`.

---

## 2. Modèle de données (Prisma)

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
  mergeIntoBook   Book? @relation(fields: [mergeIntoBookId], references: [id])

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

**Notes** :
- `candidatesJson` stocke les résultats API tels quels (max 5) pour ne pas re-quérir au reload de la page
- Séparation `status` (machine sait) / `decision` (admin a choisi) : permet de réviser une decision sans re-process
- `committedBookId` / `committedCopyId` : trace ce qui a été créé par l'item, utile pour audit ou rollback futur

**Relations Book/User à ajouter (autre fichier prisma) pour la backref** :
```prisma
model User { ... bulkImportSessions BulkImportSession[] }
model Book { ... bulkImportItems    BulkImportItem[] @relation("BulkImportBook") }
```

---

## 3. UI — Composants

### Routes & pages

```
app/admin/bulk-import/
├── page.tsx                    # écran de drop + liste sessions IN_PROGRESS
└── [id]/
    └── page.tsx                # tableau de review
```

### Composants nouveaux

```
components/admin/bulk-import/
├── DropZone.tsx                # drag & drop dossier + multi-select
├── SessionList.tsx             # liste des sessions IN_PROGRESS (page index)
├── ImportTable.tsx             # tableau principal de review
├── ImportTableRow.tsx          # une ligne du tableau
├── ImportFilters.tsx           # pills de filtre par status + bulk CTA
├── ImportProgressBar.tsx       # barre de progression processing
├── ItemDrawer.tsx              # drawer drill-down (router selon status)
├── ItemDrawerReview.tsx        # contenu drawer pour TO_REVIEW (grille candidats)
├── ItemDrawerManual.tsx        # contenu drawer pour MANUAL (formulaire libre)
├── ItemDrawerDuplicate.tsx    # contenu drawer pour DUPLICATE (preview existant + actions)
└── ItemDrawerAutoOk.tsx        # contenu drawer pour AUTO_OK (preview match + bouton modifier)
```

### Composants réutilisés

- `MetadataResultsList` — déjà utilisé en single upload, réutilisable dans `ItemDrawerReview`
- `DuplicateConfirmModal` — logique reprise dans `ItemDrawerDuplicate` (mais drawer plutôt que modal)
- `Cover`, `Badge`, `Button`, `Input` — tokens existants
- Composants d'icône Lucide React (cohérent avec CLAUDE.md "zéro emoji UI")

### Layout tableau

| Colonne | Source |
|---|---|
| Checkbox sélection | état local |
| Nom de fichier | `BulkImportItem.filename` |
| Match proposé | `chosenCandidate.title — chosenCandidate.author` ou `"N candidats"` ou `"Aucun"` |
| Status badge | `BulkImportItem.status` (couleur selon enum) |
| Drill-down `→` | ouvre `ItemDrawer` |

Filtre actif → highlight de la pill, le tableau filtre côté client (toutes les rows sont déjà chargées).

### Drawer drill-down

- Slide-in latéral (largeur ~ 400px)
- Header : status + filename
- Body : composant spécialisé selon `BulkImportItemStatus`
- Footer : navigation Précédent / Suivant (parcourt les items du même status)

Le tableau principal reste interactif pendant que le drawer est ouvert.

---

## 4. Endpoints API

Tous protégés par admin check inline (pattern existant `session.user.role !== "ADMIN"` → 403). Optionnel : extraire dans `lib/auth.ts` un helper `requireAdmin(): Promise<{ session, userId }>` pour DRY (utilisé 6 fois ici + déjà 2 fois dans `app/api/admin/`).

### `POST /api/admin/bulk-imports`
Crée une nouvelle session.
- Body : `{ totalFiles: number }`
- Response : `{ sessionId: string }`

### `POST /api/admin/bulk-imports/[id]/upload`
Upload un fichier dans la session.
- Body : `FormData(file)`
- Response : `{ itemId: string, status: "PENDING" }`
- Réutilise `validateUpload` + `savePending` de `lib/storage.ts`
- Crée le `BulkImportItem` en `PENDING`. **Ne lance PAS le process automatiquement** — le client appelle `/process` séparément après l'upload (fire-and-forget). Cette séparation simplifie : pas de queue serveur, le client orchestre la concurrence.

### `POST /api/admin/bulk-imports/[id]/items/[itemId]/process`
Process un item (extraction + recherche API + scoring).
- Idempotent (re-process possible si l'admin force un retry)
- Met à jour le `BulkImportItem` (status, candidatesJson, chosenCandidate, mergeIntoBookId)

### `GET /api/admin/bulk-imports/[id]`
Récupère l'état complet d'une session.
- Response : `{ session, items: BulkImportItem[] }`
- Polling client toutes les 3s tant qu'items en PENDING/PROCESSING

### `PATCH /api/admin/bulk-imports/[id]/items/[itemId]`
Met à jour la decision d'un item (depuis le drawer ou bulk action).
- Body : `{ decision, chosenCandidate?, mergeIntoBookId?, formOverrides?: Partial<FormState> }`

### `POST /api/admin/bulk-imports/[id]/commit`
Commit les items décidés.
- Body : `{ itemIds?: string[] }` (si absent : commit tous les items avec `decision != NONE && != SKIP`)
- Response : `{ created: number, merged: number, skipped: number, errors: { itemId, error }[] }`
- Met à jour `BulkImportSession.status = COMMITTED` si **tous** les items de la session ont une decision finale après ce commit

### `DELETE /api/admin/bulk-imports/[id]`
Abandonne la session.
- `status = ABANDONED`, delete pending files des items non commités
- La row reste en DB pour audit (purgée après 30 jours)

---

## 5. Logique métier — extraction & scoring

### Refacto induite

Extraire la logique métier des Route Handlers existants dans `lib/books.ts` :

```typescript
// lib/books.ts — nouvelles fonctions exportées
export async function createBookWithCopy(input: BookCreateInput, ownerId: string): Promise<Book>
export async function addCopyToBook(bookId: string, copyInput: CopyInput, ownerId: string): Promise<BookCopy>
```

Les Route Handlers `POST /api/books` et `POST /api/books/[id]/copies` deviennent de fines couches HTTP au-dessus.

Pas de breaking change pour les endpoints existants. Bénéfice : le commit du bulk peut appeler les mêmes fonctions sans dupliquer la logique.

### Extraction métadonnées

`lib/metadata.ts` expose déjà `queryFromFilename`. Ajouter :

```typescript
// lib/metadata.ts — nouvelles fonctions
export async function extractFromEpub(buffer: Buffer): Promise<ExtractedMetadata>
export async function extractFromPdf(buffer: Buffer): Promise<ExtractedMetadata>

export type ExtractedMetadata = {
  title: string | null
  author: string | null
  isbn: string | null
  language: string | null
}
```

EPUB : parser le fichier `metadata.opf` (zip → xml). Lib candidate : `epub-metadata-parser` ou parsing manuel léger via `jszip` + `fast-xml-parser` (déjà dans le projet).

PDF : `pdf-parse` ou `pdfjs-dist` pour lire le `pdf.info` dictionary.

Si l'extraction échoue, fallback sur `queryFromFilename`.

### Scoring

```typescript
// lib/bulk-import-scoring.ts — nouveau
export type ScoringResult = {
  status: BulkImportItemStatus
  chosenCandidate: BookMetadata | null
  mergeIntoBookId: string | null
}

export function scoreCandidates(input: {
  extracted: ExtractedMetadata
  candidates: BookMetadata[]
  existingMatch: BookMatch | null  // result of findMatchingBook
}): ScoringResult
```

Règles :
- `existingMatch.confidence === "high"` (ISBN strict avec biblio existante) → `DUPLICATE`, `mergeIntoBookId` set, candidat retenu = celui correspondant
- `existingMatch.confidence === "low"` (titre+auteur avec biblio) → `DUPLICATE`, mergeIntoBookId set, decision à valider
- Sinon, `extracted.isbn` présent ET un candidat API matche cet ISBN → `AUTO_OK`, candidat retenu = ce match ISBN
- Sinon, candidat unique avec **similarité titre ≥ 0.85 ET similarité auteur ≥ 0.85 ET aucun autre candidat top 3 ≥ 0.7** → `AUTO_OK`
- Sinon, ≥ 1 candidat retourné → `TO_REVIEW`
- Sinon → `MANUAL`

**Mesure de similarité** : ratio Levenshtein normalisé `1 - dist / max(a.length, b.length)`, comparaisons sur strings normalisées (lowercase, sans diacritiques — réutilise la fonction de normalisation de `lib/match.ts:computeMatchKey`). Implémentation : `fast-levenshtein` (lib légère, ~1 ko, à ajouter aux dépendances) ou implémentation manuelle dans `lib/bulk-import-scoring.ts` (algo standard, ~30 lignes). Choix tranché au plan d'impl.

**Détection doublons internes au lot** : se fait au moment du **commit**, pas au process item. Le scoring de chaque item est indépendant des autres (parallélisable, idempotent). Au commit :
- Regrouper les items avec `decision=CREATE` par signature : `extractedIsbn` ou `chosenCandidate.externalId` ou `computeMatchKey(title, author)`
- Pour chaque groupe de signature commune : créer **un seul** `Book` (à partir des métadonnées du premier item du groupe), puis attacher **N** `BookCopy` (une par item)
- Items isolés (signature unique) : 1 Book + 1 BookCopy classique

### Cleanup

Étendre `scripts/cleanup-pending.ts` :

```typescript
// 1. Sessions IN_PROGRESS sans updatedAt depuis > 7j
//    → status = ABANDONED, delete pending files des items
// 2. Sessions ABANDONED ou COMMITTED depuis > 30j
//    → suppression complète des items de la session (cascade)
```

La tâche cron Coolify existante `npm run cleanup:pending` couvre déjà cette extension.

---

## 6. Limites & garde-fous

| Limite | Valeur | Implémentation |
|---|---|---|
| Taille fichier | 50 Mo | Existant (`MAX_FILE_BYTES` dans `lib/file-validation.ts`) |
| Format | EPUB / PDF | Existant (`validateUpload`) |
| Fichiers par session (warning) | > 200 | Modal de confirmation côté client phase 1 |
| Fichiers par session (refus) | > 500 | Refus serveur sur `POST /api/admin/bulk-imports` |
| Concurrent uploads client | 3 | Pool dans le client TS |
| Délai entre calls API metadata | 100ms | Throttle dans le process item handler |
| Polling fréquence | 3s | Side effect React, arrêt automatique quand plus rien en PENDING/PROCESSING |
| Sessions IN_PROGRESS expiration | 7j sans update | Cron cleanup |

Les caps fichiers (200/500) sont stockés en constantes exportées depuis `lib/bulk-import-limits.ts` pour facile ajustement V1.5 (passage à 10-20 pour users non-admin).

---

## 7. Réutilisation & refacto

### Code réutilisé tel quel

- `lib/storage.ts` : `savePending`, `commitPending`, `deletePending`
- `lib/file-validation.ts` : `validateUpload`
- `lib/match.ts` : `findMatchingBook`, `computeMatchKey`, `normalizeIsbn`
- `lib/metadata.ts` : `searchBooks`, `queryFromFilename`
- Composants `MetadataResultsList`, `Cover`, `Badge`, `Button`

### Refacto requise

- **`lib/books.ts`** : extraire `createBookWithCopy` et `addCopyToBook` depuis les Route Handlers existants
- **`lib/metadata.ts`** : ajouter `extractFromEpub` et `extractFromPdf`
- **`lib/auth.ts`** (optionnel mais recommandé) : extraire un helper `requireAdmin()` pour DRY (utilisé sur 6 nouvelles routes + 2 existantes)
- **Dépendance npm** à ajouter : `fast-levenshtein` (~1 ko, types via `@types/fast-levenshtein`) OU implémentation manuelle dans `lib/bulk-import-scoring.ts`
- Aucun breaking change pour les endpoints existants

### Code nouveau

- `lib/bulk-import-scoring.ts` (logique de scoring)
- `lib/bulk-import-limits.ts` (constantes de limites)
- 6 endpoints API sous `app/api/admin/bulk-imports/`
- 11 composants React sous `components/admin/bulk-import/`
- 2 pages sous `app/admin/bulk-import/`
- 2 modèles + 3 enums Prisma (migration)

---

## 8. Extensibilité V1.5+ (users non-admin)

Le design ne se peint pas dans un coin pour V1.5 :

- Les routes `app/admin/bulk-import/` peuvent être dupliquées en `app/(app)/bulk-import/` avec autorisation user et cap configurable (10-20 fichiers)
- `BulkImportSession.ownerId` est déjà un User quelconque, pas un Admin
- `lib/bulk-import-limits.ts` expose `MAX_FILES_ADMIN` et `MAX_FILES_USER` séparément
- Les endpoints API peuvent rester sous `/api/admin/` pour V1.4 puis être déplacés sous `/api/bulk-imports/` en V1.5 avec un middleware d'autorisation différent

Pas de feature dev en V1.4 pour l'usage user, juste la séparation propre des constantes et un naming neutre des modèles Prisma.

---

## 9. Tests à prévoir (référence pour le plan d'implémentation)

- Smoke test scoring : matrice de cas (EPUB+ISBN, EPUB sans ISBN, PDF clean, PDF pourri, doublon ISBN, doublon titre)
- Smoke test extraction EPUB / PDF sur fichiers fixtures
- Test E2E happy path : drop 5 fichiers → 4 Auto OK + 1 TO_REVIEW → bulk import des 4 → review du 1 → commit
- Test reprise après crash : créer session, fermer page, recharger → état restauré
- Test commit partiel : commiter 2 Auto OK, vérifier session reste IN_PROGRESS
- Test cleanup : forcer date `updatedAt` > 7j, lancer cleanup, vérifier ABANDONED + pending purgés
