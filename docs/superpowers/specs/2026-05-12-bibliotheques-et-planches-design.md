# Bibliothèques restreintes & Planches — Design

**Date** : 2026-05-12
**Statut** : design validé, en attente de plan d'implémentation
**Version cible** : V1.6

## Contexte

Aujourd'hui Sifriya fonctionne avec un catalogue unique, visible à tous les users authentifiés. CLAUDE.md §13 liste deux features non démarrées qui partagent le même mécanisme sous-jacent :

- **Bibliothèques avec accès restreint par groupe d'users** : permettre de scoper la visibilité d'un sous-ensemble de livres à un set d'users (cercles type famille, club de lecture, etc.).
- **PDF personnels avec propriétaire** ("Planches") : permettre d'uploader un écrit personnel (notes, dossiers, planches) avec un propriétaire affiché, à la différence d'un livre numérique publié qui n'a pas de propriétaire.

Les deux convergent sur un même système de visibilité scopée. La V1.6 livre l'infrastructure de bibliothèques restreintes et le mode d'ajout "Planche" qui s'en sert naturellement.

**Aucune feature "demande d'adhésion"** : un user qui n'est pas membre ne sait pas que la bibliothèque existe. Privacy stricte côté découverte.

## Récapitulatif des choix de design

| Décision | Choix | Justification |
|---|---|---|
| Structure | 1 bibliothèque "Générale" par défaut (tous users) + N bibliothèques restreintes | Préserve le catalogue existant, ajoute la granularité |
| Gouvernance | Admin global crée la bib + nomme un gérant | Top-down mais délégation possible |
| Membres | Gérant + admin peuvent ajouter/retirer via cases à cocher (batch) | Rapide pour beaucoup d'users à la fois |
| Ajout de livres | Tout membre peut ajouter dans une bib dont il est membre | Modèle collaboratif, cohérent avec l'usage actuel |
| Scope DB | `BookCopy.libraryId` (œuvre `Book` partagée, copies scopées) | Pas d'inflation de fiches doublons, dédup ISBN reste globale |
| Navigation | Sidebar liste les bibs accessibles sous "Prêt" | Visible, simple, ≤ 10 bibs typique |
| Recherche topbar | Transverse à toutes les bibs visibles | UX naturelle |
| Suppression d'une bib | Bloquée si non-vide (gérant doit vider d'abord) | Aucune surprise (privacy préservée) |
| Mode "Planche" | 4e mode dans AddBookFlow, label UI **"Planche"** | Distingue l'écrit perso d'un livre numérique publié |
| Dédup Planche | Désactivée (`Book.isPersonal=true` skip `lib/match.ts`) | Une Planche est unique par construction |

---

## 1. Modèle de données

### Nouveaux modèles

```prisma
model Library {
  id          String   @id @default(cuid())
  name        String
  description String?
  isDefault   Boolean  @default(false)   // true uniquement pour "Bibliothèque générale"
  managerId   String?                     // user nommé gérant (null = admin global uniquement)
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

  library   Library  @relation(fields: [libraryId], references: [id], onDelete: Cascade)
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([libraryId, userId])
  @@index([userId])
}
```

### Modifs des modèles existants

```prisma
model Book {
  // ... champs existants
  isPersonal Boolean @default(false)   // true = "Planche" (écrit personnel)
}

model BookCopy {
  // ... champs existants
  libraryId String
  library   Library @relation(fields: [libraryId], references: [id])

  @@index([libraryId])
}

model User {
  // ... champs existants
  managedLibraries Library[]            @relation("LibraryManager")
  memberships      LibraryMembership[]
}
```

### Points clés

- `BookCopy.libraryId` est **obligatoire** (chaque copie dans 1 et 1 seule bib). Backfill nécessaire à la migration (cf. §7).
- `Book.isbn` reste `@unique`. Les Planches ont `isbn = null` (Postgres autorise plusieurs nulls sur un index unique).
- `Book.isPersonal=true` désactive la dédup ISBN/matchKey dans `lib/match.ts`. Chaque Planche est traitée comme une œuvre nouvelle.
- Un seul flag `isDefault` identifie la Générale — pas d'enum `LibraryType` (YAGNI).
- `Library.managerId` peut être null (bib gérée uniquement par admin global).
- Cascade : suppression d'un user supprime ses memberships (mais pas les copies qu'il a ajoutées — `BookCopy.addedBy` n'a pas `onDelete` aujourd'hui, comportement V1.3 inchangé).

---

## 2. Visibilité — helper centralisé (`lib/libraries.ts`)

Toutes les routes qui touchent à `Book` ou `BookCopy` passent par ce helper. Source unique de vérité, zéro duplication.

```typescript
import type { PrismaClient } from "@prisma/client"

// Retourne tous les libraryId visibles par l'user.
// - ADMIN global : retourne TOUTES les Library de la DB (super-visibilité).
// - USER : retourne uniquement les libraryId où il a un LibraryMembership.
// La Générale est incluse comme tout autre membership (créé au seed/invite pour les USER).
export async function getVisibleLibraryIds(
  db: PrismaClient,
  userId: string
): Promise<string[]>

// True si l'user est ADMIN global OU gérant de la bib.
export async function canManageLibrary(
  db: PrismaClient,
  userId: string,
  libraryId: string
): Promise<boolean>

// True si l'user est ADMIN global OU membre de la bib.
export async function canAddBookToLibrary(
  db: PrismaClient,
  userId: string,
  libraryId: string
): Promise<boolean>

// True si l'user est ADMIN global OU membre de la bib.
export async function isLibraryVisible(
  db: PrismaClient,
  userId: string,
  libraryId: string
): Promise<boolean>
```

### Helpers d'authentification (`lib/auth.ts`)

Ajout de :
- `requireLibraryManager(libraryId)` — guard pour les routes de gestion (admin global ou gérant).
- `requireLibraryMember(libraryId)` — guard pour ajouter livres/membres en tant que membre.

---

## 3. API

### Nouvelles routes

```
GET    /api/libraries                          Liste des bibs visibles + count membres/livres
GET    /api/libraries/[id]                     Détails (memberships exposées si gérant/admin)
POST   /api/libraries                          ADMIN only — crée une bib
PATCH  /api/libraries/[id]                     ADMIN only — rename, description, change manager
DELETE /api/libraries/[id]                     ADMIN only — 409 si copies présentes, interdit si isDefault

PUT    /api/libraries/[id]/members             ADMIN ou gérant — body: { userIds: string[] }
                                               Remplacement atomique de l'ensemble des memberships
                                               (= calcule le diff côté serveur : insert manquants,
                                               delete en trop). Cohérent avec l'UX cases à cocher.
DELETE /api/libraries/[id]/members/[userId]    ADMIN ou gérant — retire un membre (one-off)
```

Tous les endpoints valident le payload avec Zod (cohérent avec les conventions existantes).

### Routes existantes adaptées

```
GET    /api/books?libraryId=<id>               Filtre WHERE copies.some.libraryId IN visibleLibs
                                               Si libraryId fourni : vérifie que c'est visible, sinon 403
POST   /api/books                              body inclut libraryId obligatoire (Zod)
                                               Vérifie canAddBookToLibrary
GET    /api/books/[id]                         404 si aucune copie visible
                                               copies[] de la réponse filtrée aux bibs visibles
POST   /api/books/[id]/copies                  body inclut libraryId obligatoire
                                               Vérifie canAddBookToLibrary
DELETE /api/books/[id]/copies/[cid]            Autorisé pour : owner OR addedBy OR gérant de la bib OR admin
POST   /api/books/match                        Skip dédup si payload.isPersonal === true
                                               Sinon dédup ISBN/slug classique sur l'œuvre globale
GET    /api/books/[id]/download?format=X       403 si la copie résolue n'est pas dans une bib visible
POST   /api/loans                              403 si la copie n'est pas dans une bib visible
GET    /api/metadata                           Inchangé — pas de notion de bib (API externe)
POST   /api/admin/invites                      Crée user + LibraryMembership Générale
                                               + memberships optionnels (UI : cases à cocher des bibs)
                                               Transactionnel
```

### Réponse type `GET /api/libraries`

```json
{
  "libraries": [
    { "id": "lib_generale", "name": "Bibliothèque générale", "isDefault": true,
      "managerId": null, "bookCount": 237, "memberCount": 47 },
    { "id": "lib_xxx", "name": "Famille", "isDefault": false,
      "managerId": "user_marie", "bookCount": 12, "memberCount": 5 }
  ]
}
```

---

## 4. UX & navigation

### Sidebar

```
─── (sans titre, comme aujourd'hui)
• Bibliothèque              → /bibliotheque (= Générale)
• Prêt                      → /pret

─── Mes Bibliothèques ───   (visible si ≥ 1 bib restreinte accessible)
• Famille                   → /bibliotheques/[id]
• Club Histoire             → /bibliotheques/[id]

─── Ma Bibliothèque ───
• Mes livres                → /mes-livres
• Mes lectures              → /mes-lectures

[Avatar] Prénom             → /profil
Paramètres                  → /admin (admin only)
```

- "Bibliothèque" (Générale) reste sous `/bibliotheque` — pas de breaking change.
- Les bibs restreintes vivent sous `/bibliotheques/[id]` (pluriel pour distinguer).
- La section "Mes Bibliothèques" est masquée si l'user n'est membre d'aucune bib restreinte.
- "Mes livres" et "Mes lectures" restent transverses (toutes bibs visibles).

### Page bib restreinte (`/bibliotheques/[id]`)

Composant principal réutilise `BookGrid` / `BookList` / filtres / tri existants, scopés à `libraryId` côté API.

- **Header** : nom de la bib + gérant + compteur (`N livres · M membres`)
- **Catalogue** : identique à `/bibliotheque` mais sans filtre "Bibliothèque" (redondant)
- **Bouton "Gérer la bibliothèque"** visible si l'user est gérant ou admin → `/admin/bibliotheques/[id]`

### Recherche topbar

Inchangée côté composant. L'API `/api/books?q=...` applique le helper visibility donc résultats automatiquement filtrés.

### AddBookFlow

**Step 1 — Mode** :

```
┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐
│ Numérique  │ │  Physique  │ │  Planche   │ │  Annuler   │
│  EPUB/PDF  │ │  ISBN/...  │ │ écrit perso│ │            │
└────────────┘ └────────────┘ └────────────┘ └────────────┘
```

**Step commun à tous les modes — choix de la bibliothèque cible** :
- Select : bibs où l'user peut ajouter (= toutes celles dont il est membre).
- Pré-sélection : la bib courante si on déclenche depuis `/bibliotheques/[id]`, sinon Générale.
- Si une seule bib accessible : champ masqué, valeur figée.

**Mode "Planche" — flow spécifique** :
1. Upload PDF (max 50 Mo, validation magic bytes côté serveur — réutilise `/api/uploads`).
2. Fiche **sans recherche métadonnées** (pas de BnF / Google / OpenLibrary).
3. Champs : titre*, auteur (pré-rempli avec le nom de l'uploader), description, année, cover optionnelle.
4. À la soumission : `POST /api/books` avec `isPersonal: true` et `libraryId` choisi. Le BookCopy est créé avec `ownerId = uploader`.
5. La fiche affiche un badge "Planche" et le propriétaire avatar+nom.

### Fiche livre (`/bibliotheque/[id]`)

- Badge "Planche" si `Book.isPersonal === true`. Affiche le propriétaire (BookCopy.owner) en avatar + nom.
- Pour les livres non-perso : pas de badge, comportement actuel inchangé.

### Page admin de gestion

**`/admin/bibliotheques`** — index :

```
Famille          12 livres   5 membres   Gérant : Marie         [Gérer]
Club Histoire    34 livres   8 membres   Gérant : —             [Gérer]
──────────────────────────────────────────────────────────────────
Bibliothèque générale   237 livres   47 membres   (par défaut)  [Voir]
                                                                [Éditer nom]
```

**`/admin/bibliotheques/[id]`** — gestion :

- Édition nom + description (admin only)
- Select "Gérant" (n'importe quel user, ou aucun)
- **Membres** : grille de cases à cocher (1 user par ligne, avatar + nom + email). À la validation, un seul `PUT /api/libraries/[id]/members` avec `{ userIds: [...] }` remplace l'ensemble des memberships (diff calculé côté serveur). L'utilisateur courant (gérant ou admin) ne peut pas se décocher lui-même côté UI — protection anti-lockout.
- Livres (lecture seule, lien vers `/bibliotheques/[id]`)
- Bouton "Supprimer" greyed avec tooltip si copies > 0 ou si `isDefault=true`

### Badge biblio sur les BookCard

- Sur `/bibliotheque` (Générale) : aucun badge bib (= contexte par défaut, évite le bruit).
- Sur `/bibliotheques/[id]` : aucun badge non plus (déjà scopé).
- Sur `/mes-livres`, `/mes-lectures`, résultats de recherche transverse : badge `--paper-2` avec le nom de la bib si != Générale.

---

## 5. Permissions

| Action | Admin global | Gérant | Membre | Non-membre |
|---|---|---|---|---|
| Voir la bib + son catalogue | ✓ | ✓ | ✓ | ✗ |
| Créer une bib | ✓ | ✗ | ✗ | ✗ |
| Renommer / éditer description | ✓ | ✗ | ✗ | ✗ |
| Changer le gérant | ✓ | ✗ | ✗ | ✗ |
| Supprimer la bib (si vide, non-Générale) | ✓ | ✗ | ✗ | ✗ |
| Ajouter / retirer membres | ✓ | ✓ | ✗ | ✗ |
| Ajouter un livre dans la bib | ✓ | ✓ | ✓ | ✗ |
| Supprimer une copie | ✓ (toutes) | ✓ (dans sa bib) | ✓ (owner OU addedBy) | — |
| Emprunter (Loan) | ✓ | ✓ | ✓ | ✗ |
| Voir les noms des membres d'une bib | ✓ | ✓ | ✓ | ✗ |

---

## 6. Cas limites & comportements

- **Retrait d'un membre** : il perd l'accès au catalogue de la bib. Ses copies y restent (visibles aux autres membres). Ses prêts en cours continuent jusqu'à `RETURNED` (cohérence physique). Ses Reading restent (privé, déjà découplé).
- **Suppression d'un user** : cascade existante sur Account / Session ; ajoute cascade sur `LibraryMembership`. Copies BookCopy gardent `addedBy=user` (comportement V1.3 inchangé).
- **Générale** : ne peut pas être supprimée. Renommable par l'admin global. La suppression d'un user retire sa membership (cascade).
- **Nouveau user invité** : `/api/admin/invites` crée le user **et** un `LibraryMembership` sur la Générale dans la même transaction. Si l'admin coche des bibs restreintes au moment de l'invitation, idem dans la transaction.
- **Suppression d'une bib non-vide** : 409. Le gérant doit d'abord supprimer toutes les copies. Pas de migration automatique vers Générale — c'est une feature, pas un bug (évite qu'une Planche privée bascule en public par accident).
- **Téléchargement après retrait** : fichier déjà téléchargé reste chez l'user. Le retrait du membership empêche les futurs téléchargements et masque la fiche. Cohérent avec le modèle "pas de DRM" actuel.
- **Search topbar** : retourne uniquement les Books ayant ≥ 1 copie visible. Un user non-membre de Famille ne trouvera jamais un livre exclusif à Famille.
- **Match ISBN cross-bib** : un user ajoute un livre avec un ISBN qui existe déjà dans une bib qu'il ne voit pas. `findMatchingBook` retourne le Book global (œuvre unique), et la nouvelle copie est créée dans la bib choisie. Résultat : la fiche Book agrège plusieurs copies dans plusieurs bibs ; chaque observateur ne voit que celles auxquelles il a accès.

---

## 7. Migration

### Migration Prisma

Nom : `add_libraries_and_personal_books`.

Étapes (dans le `migration.sql` de Prisma) :

1. **Schema** : crée tables `Library`, `LibraryMembership`. Ajoute `Book.isPersonal` (default false), `BookCopy.libraryId` (nullable en première étape pour permettre le backfill).
2. **Data backfill** :
   ```sql
   INSERT INTO "Library" (id, name, "isDefault", "createdAt", "updatedAt")
   VALUES ('lib_generale', 'Bibliothèque générale', true, NOW(), NOW());

   INSERT INTO "LibraryMembership" (id, "libraryId", "userId", "addedAt")
     SELECT gen_random_uuid()::text, 'lib_generale', id, NOW() FROM "User";

   UPDATE "BookCopy" SET "libraryId" = 'lib_generale' WHERE "libraryId" IS NULL;
   ```
3. **Schema lock** : passer `BookCopy.libraryId` à `NOT NULL` une fois le backfill terminé (dans la même migration).

### Seed (`prisma/seed.ts`)

Modifs :
- Si la Générale n'existe pas (`isDefault=true`), la créer avec id stable `lib_generale`.
- À l'upsert de l'admin, créer aussi son `LibraryMembership` sur la Générale (idempotent via `@@unique([libraryId, userId])`).

---

## 8. Fichiers impactés

### Nouveaux fichiers
- `prisma/migrations/<date>_add_libraries_and_personal_books/migration.sql`
- `lib/libraries.ts` — helpers visibility & permissions
- `app/api/libraries/route.ts` — GET (list) + POST (create)
- `app/api/libraries/[id]/route.ts` — GET (detail) + PATCH + DELETE
- `app/api/libraries/[id]/members/route.ts` — POST (batch)
- `app/api/libraries/[id]/members/[userId]/route.ts` — DELETE
- `app/(app)/bibliotheques/[id]/page.tsx` — page bib restreinte
- `app/admin/bibliotheques/page.tsx` — index admin
- `app/admin/bibliotheques/[id]/page.tsx` — gestion d'une bib
- `components/libraries/LibrarySelector.tsx` — select de la bib cible
- `components/libraries/MemberPicker.tsx` — cases à cocher batch
- `components/libraries/LibraryBadge.tsx` — pill nom de bib
- `components/books/PlancheFlow.tsx` — flow d'ajout mode Planche

### Fichiers modifiés
- `prisma/schema.prisma` — modèles + relations
- `prisma/seed.ts` — Générale + membership admin
- `lib/match.ts` — early-return null si isPersonal
- `lib/auth.ts` — `requireLibraryManager`, `requireLibraryMember`
- `lib/books-mutations.ts` — `createBookWithCopy` / `addCopyToBook` reçoivent `libraryId`
- `app/api/admin/invites/route.ts` — création membership Générale + bibs cochées (transaction)
- `app/api/books/route.ts` — filtre visibility
- `app/api/books/[id]/route.ts` — 404 si aucune copie visible, copies[] filtrée
- `app/api/books/[id]/download/route.ts` — vérifie visibility
- `app/api/books/[id]/copies/route.ts` — libraryId obligatoire
- `app/api/books/[id]/copies/[cid]/route.ts` — permission étendue (gérant)
- `app/api/books/match/route.ts` — skip dédup si isPersonal
- `app/api/loans/route.ts` — vérifie visibility de la copie
- `components/layout/Sidebar.tsx` — section "Mes Bibliothèques"
- `components/books/AddBookFlow.tsx` — ajout mode Planche + intégration LibrarySelector
- `components/books/DigitalUploadFlow.tsx` — propage libraryId
- `components/books/PhysicalFlow.tsx` — propage libraryId
- `components/books/BookDetail.tsx` — badge Planche + affichage propriétaire pour les Planches
- `components/books/BookCard.tsx` — badge bib sur les vues transverses

---

## 9. Hors scope V1.6

À acter explicitement, à reconsidérer en V1.7+ :

- **Déplacement** d'une copie d'une bib à l'autre sans suppression/ré-ajout.
- **Demande d'adhésion** : un user demande à rejoindre une bib qu'il voit pas — incompatible avec le choix "privacy stricte" de cette spec. Si jamais activé, il faudra repenser la découverte.
- **Transfert de propriété** d'une copie ou d'une Planche.
- **Bibliothèques hiérarchiques** (sous-bibs).
- **Adaptation du bulk-import V1.5 aux bibs restreintes** : le bulk-upload admin continue de cibler la Générale. Sélection de bib cible à l'étape commit = follow-up V1.7+ (admin-only, archi déjà extensible).
- **Bibliothèques publiques en lecture seule** : actuellement toute bib visible permet d'emprunter / télécharger. Pas de notion "consultation seule".

---

## 10. Smoke E2E (à dérouler manuellement après livraison)

1. Admin crée une bib "Famille", nomme Marie gérante, ajoute 3 membres via cases à cocher → la bib apparaît dans la sidebar des 3 membres + Marie + admin.
2. Un non-membre ne voit pas "Famille" en sidebar, ni les livres exclusifs à Famille via recherche topbar.
3. Marie (gérante) retire un membre → ce membre perd l'accès au catalogue mais ses prêts en cours restent.
4. Un membre de Famille ajoute "Madame Bovary" en Famille → visible aux 3 membres + Marie + admin uniquement.
5. Un non-membre ajoute "Madame Bovary" (même ISBN) en Générale → le Book est dédupliqué (1 Book en DB), 2 BookCopy dans 2 bibs différentes. Le non-membre voit 1 copie sur la fiche, les membres de Famille voient les 2.
6. Création d'une Planche : upload PDF, fiche sans recherche métadonnées, propriétaire = uploader, badge "Planche" visible sur la fiche, dédup ISBN désactivée.
7. Tentative de suppression de la bib "Famille" pleine → 409, message clair, bouton greyed.
8. Le gérant supprime toutes les copies de "Famille" puis supprime la bib → OK, cascade des memberships.
9. Tentative de DELETE sur la bib Générale → 403 (interdit isDefault).
10. Invitation d'un nouvel user via `/api/admin/invites` avec case "Famille" cochée → user créé + 2 memberships (Générale + Famille) dans une seule transaction.
11. Téléchargement par un non-membre d'une copie en Famille → 403.
12. POST `/api/loans` sur une copie en Famille par un non-membre → 403.
13. Recherche topbar par un non-membre sur un titre exclusif Famille → 0 résultat.
14. Renommage Générale par admin global → OK, isDefault préservé. Suppression Générale → 403.
