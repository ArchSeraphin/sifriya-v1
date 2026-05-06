# Mes Lectures — Design

**Date** : 2026-05-06
**Statut** : design validé, en attente de plan d'implémentation
**Version cible** : V1.4

## Contexte

Le modèle `Reading` (statut `TO_READ` / `READING` / `READ`) existe en DB depuis V0 mais n'a jamais été câblé côté UI ni API. La page `/mes-lectures` est un placeholder qui annonce mensongèrement "disponible dès V1.0".

Cette release V1.4 livre la feature : permettre à chaque utilisateur de marquer ses livres "à lire / en cours / lu", visualiser ses lectures par statut, et ajouter rapidement à sa wishlist depuis le catalogue.

**Note prod** : `Reading` est privé strict — un user ne voit jamais le statut Reading des autres. Décision validée pour respecter le caractère personnel de la liste de lectures.

## Récapitulatif des choix de design

| Décision | Choix | Justification rapide |
|---|---|---|
| Visibilité | Privé strict | Personne ne voit les lectures des autres, même dans le cercle privé |
| Trigger UX | Sélecteur 4 chips sur la fiche + bookmark rapide sur la BookCard | La fiche pour les changements précis, l'icône pour la wishlist |
| Layout `/mes-lectures` | 3 onglets `À lire / En cours / Lu` | Segmentation claire, défaut "À lire" qui est la vue la plus active |
| Auto-triggers (download, loan accepté…) | Aucun | Pas d'auto-marquage : trop de faux positifs ("téléchargé pour plus tard") |
| Statut sur BookCard du catalogue | Icône `Bookmark / BookOpen / CircleCheck` selon état | Lecture seule pour `READING`/`READ`, toggle pour `TO_READ` |

---

## 1. Modèle de données

**Aucune modification de schéma.** Le modèle `Reading` existe déjà en DB :

```prisma
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

enum ReadingStatus { TO_READ  READING  READ }
```

`onDelete: Cascade` sur `book` et `user` ont été ajoutés en V1.3.

**Sémantique** :
- Une row `Reading` = un (user, book) avec un statut.
- Pas de row = "aucun statut" (l'absence est le 4e état, pas un enum `NONE`).
- Suppression d'une row = retour à "aucun statut".

L'index composite `@@unique([userId, bookId])` couvre les queries `WHERE userId AND bookId IN (...)`. Aucun nouvel index nécessaire.

---

## 2. API

Trois endpoints, tous dynamiques, runtime nodejs, session requise.

| Méthode | Endpoint | Description |
|---|---|---|
| `PUT` | `/api/readings/[bookId]` | Upsert Reading (set status) |
| `DELETE` | `/api/readings/[bookId]` | Supprime la Reading (= "aucun statut") |
| `GET` | `/api/readings` | Liste des Readings de l'user courant, groupées par statut |

### `PUT /api/readings/[bookId]`

```typescript
const StatusBody = z.object({ status: z.enum(["TO_READ", "READING", "READ"]) })
```

- Vérifie que le `Book` existe → 404 sinon.
- Upsert sur `(userId, bookId)`. Crée la row si absente, met à jour `status` sinon.
- Retourne `{ reading: { id, status, addedAt, updatedAt } }`.
- Status code : 200 si update, 201 si create.

### `DELETE /api/readings/[bookId]`

- Idempotent : 200 dans tous les cas (même si la row n'existe pas).
- Pas de 404 sur l'absence — le client peut faire un toggle propre sans gérer l'erreur.
- Retourne `{ ok: true }`.

### `GET /api/readings`

Retourne les Readings de l'user courant **groupées par statut** pour éviter trois fetch côté client :

```typescript
{
  toRead: BookListed[],   // status = TO_READ
  reading: BookListed[],  // status = READING
  read: BookListed[]      // status = READ
}
```

Chaque liste est triée par `Reading.addedAt desc` (récents en haut, intuitif pour la wishlist). Le shape `BookListed` réutilise `PUBLIC_BOOK_SELECT` (donc `copies[]` et métadonnées Book complètes).

### Sécurité

- Toutes les routes exigent une session valide (`getServerSession(authOptions)`).
- `userId` est *toujours* dérivé de `session.user.id` — jamais lu depuis le body ou les params.
- Aucun endpoint admin pour consulter les lectures d'autrui (cohérent avec "privé strict").

---

## 3. UI — composants

### Nouveaux

| Fichier | Rôle |
|---|---|
| `components/books/ReadingStatusPicker.tsx` | Sélecteur 4 chips (`Aucun · À lire · En cours · Lu`) sur `BookDetail` |
| `components/books/BookmarkButton.tsx` | Icône Bookmark/BookOpen/CircleCheck sur `BookCard` |

### Modifiés

| Fichier | Changement |
|---|---|
| `components/books/BookCard.tsx` | Ajout `BookmarkButton` en overlay haut droite de la cover, props `readingStatus?: ReadingStatus \| null` |
| `components/books/BookGrid.tsx` | Propage `readingByBookId` aux `BookCard` |
| `components/books/BookList.tsx` | Optionnel : affichage du statut en colonne. Pour V1.4 on garde la colonne actuelle, on n'ajoute pas. |
| `components/books/BookDetail.tsx` | Ajout `ReadingStatusPicker` dans la zone d'actions, sous les badges, avant le titre. Props `currentReading?: { status: ReadingStatus } \| null` |
| `app/(app)/mes-lectures/page.tsx` | Réécriture complète (voir §4) |

### `<ReadingStatusPicker>` — comportement

```
[ Aucun statut ]  [ À lire ]  [ En cours ]  [ Lu ]
```

- Le statut courant = chip remplie (`bg-accent`, texte `accent-ink`).
- Les autres = ghost (`border-rule`, texte `ink-2`).
- Click sur :
  - une chip différente → `PUT /api/readings/[bookId]` avec ce statut, `router.refresh()`
  - la chip courante → no-op
  - "Aucun statut" → `DELETE /api/readings/[bookId]` (no-op si déjà absent côté serveur, idempotent)
- Pendant l'API call : toutes les chips disabled, opacity 0.6.
- Erreur API : toast inline en rouge (`text-[color:var(--err)]`).

### `<BookmarkButton>` — comportement

Bouton overlay haut droite de la cover, taille 28×28 cliquable, padding pour zone tactile mobile (40×40 effective).

| Statut Reading | Icône Lucide | Click |
|---|---|---|
| Pas de Reading | `Bookmark` outlined, opacity 0.7 | `PUT TO_READ` |
| `TO_READ` | `Bookmark` plein doré (`text-accent`) | `DELETE` (toggle off) |
| `READING` | `BookOpen` doré, no-op | aucun (cursor: default), tooltip "Géré depuis la fiche" |
| `READ` | `CircleCheck` doré, no-op | idem |

Pendant l'API call : disabled, opacity 0.5.

Le click sur le bouton **ne propage pas** au `<Link>` parent qui mène à la fiche (`e.stopPropagation()`). Le reste de la card reste cliquable comme avant.

### Page `/mes-lectures`

```
Mes lectures
─────────────────────────────────
[ À lire (12) | En cours (3) | Lu (47) ]    ← onglets, ?tab=to-read|reading|read

<BookGrid books={...} readingByBookId={...} />
```

- Onglet par défaut : `to-read`.
- État dans l'URL (`?tab=...`) — back/forward navigateur cohérent, lien partageable (au sein du cercle, mais sans révéler les lectures de l'auteur du lien — chaque user voit *ses* lectures).
- Compteurs sur les onglets, calculés en SSR via 3 `db.reading.count`.
- Si liste vide pour l'onglet courant : illustration discrète + texte ("Vous n'avez encore rien marqué à lire / en cours / lu").
- Pas de filtre format/type ni de toolbar — la page reste épurée. La toolbar du catalogue couvre déjà ces besoins quand l'user veut filtrer.

---

## 4. Données dans les vues qui affichent des Books

Pour éviter un flicker côté client (icône qui apparaît au mount), le statut Reading est chargé en **SSR en parallèle** des Books :

```typescript
const [books, readings] = await Promise.all([
  db.book.findMany({ ..., select: PUBLIC_BOOK_SELECT }),
  db.reading.findMany({
    where: { userId: session.user.id, bookId: { in: books.map(b => b.id) } },
    select: { bookId: true, status: true }
  })
])
const readingByBookId = new Map(readings.map(r => [r.bookId, r.status] as const))
```

Pages à mettre à jour avec ce pattern :
- `app/(app)/bibliotheque/page.tsx`
- `app/(app)/mes-livres/page.tsx`
- `app/(app)/mes-lectures/page.tsx` (nouveau, par construction)

Pour la fiche `app/(app)/bibliotheque/[id]/page.tsx`, on charge la single Reading :

```typescript
const currentReading = await db.reading.findUnique({
  where: { userId_bookId: { userId: session.user.id, bookId: id } },
  select: { status: true }
})
```

---

## 5. Edge cases

| Cas | Comportement |
|---|---|
| `PUT` avec status identique à l'actuel | Prisma upsert standard. `updatedAt` touché. Pas de bug. |
| `DELETE` sur une Reading inexistante | 200 idempotent. Pas de 404. |
| Book supprimé pendant que l'user a une Reading | Cascade Reading→Book (V1.3). Reading disparaît automatiquement. |
| User supprimé | Cascade User→Reading (V1.3). |
| 2 onglets ouverts marquent des statuts différents | `last-write-wins`. Le dernier `PUT` gagne. Acceptable. |
| Utilisateur clique bookmark vite plusieurs fois | Bouton `disabled` pendant le pending. Évite les double-PUT. |
| Liste très longue dans un onglet `/mes-lectures` (>100 books) | Pas de pagination V1.4. Pour 50–100 users sur 1000 books, on devrait rester sous 200 readings/user. À paginer quand le besoin apparaîtra. |
| Bouton bookmark sans `readingByBookId` passé en prop | Affiche `Bookmark` outlined par défaut, click → `PUT TO_READ`. Mode lecture seule safe. |

---

## 6. Plan de test (smoke E2E manuel)

Conforme à la convention projet (cf. mémoire `feedback_conventions` — pas de tests automatisés au-delà du smoke). Scénarios à dérouler manuellement avant merge :

1. Sur `/bibliotheque`, click bookmark sur une card → icône passe en plein doré, refresh OK.
2. Click à nouveau bookmark sur la même card → icône revient outlined.
3. Sur la fiche d'un livre, click "À lire" dans le picker → chip remplie, bookmark sur la card du catalogue passe en plein doré.
4. Sur la fiche, click "En cours" → chip "En cours" remplie, bookmark sur la card devient `BookOpen` non cliquable (tooltip "Géré depuis la fiche").
5. Sur la fiche, click "Lu" → chip "Lu" remplie, bookmark devient `CircleCheck`.
6. Sur la fiche, click "Aucun statut" → chip "Aucun" remplie, bookmark revient outlined sur la card.
7. Aller sur `/mes-lectures` → onglet "À lire" sélectionné par défaut, livres marqués `TO_READ` listés.
8. Switcher onglet "En cours" via click → URL passe à `?tab=reading`, livres `READING` listés.
9. Onglet "Lu" → livres `READ` listés.
10. Naviguer back/forward navigateur → onglet bien restauré depuis l'URL.
11. Vide d'un onglet → illustration discrète + texte attendu.
12. User B se connecte, marque ses propres lectures → ne voit pas celles de user A (vérification "privé strict").
13. User A supprime un Book qu'il avait marqué `READ` → la Reading disparaît, l'onglet "Lu" met à jour son compteur au refresh.
14. User A et B ouverts en parallèle marquent le même livre à des statuts différents → chacun voit son propre statut sur sa card (pas de croisement).

---

## 7. Hors scope V1.4

- Suggestions auto post-download / post-loan (toast "Tu lis ce livre ?")
- Date de lecture explicite (`finishedAt` champ séparé) — `Reading.updatedAt` peut servir de proxy si besoin plus tard
- Pagination de `/mes-lectures`
- Compteur "X membres du cercle ont lu" sur la fiche (interdit par "privé strict" V1.4)
- Export liste de lectures (JSON/CSV)
- Multi-sélection / actions en lot
- Recherche dans `/mes-lectures` (le user a déjà ses lectures triées par date)
- Statistiques (livres lus en {année}, etc.)
- Import depuis Goodreads / Babelio

---

## Source de vérité produit

`CLAUDE.md` à la racine du repo. Cette spec ajoute une release V1.4 par-dessus, sans contredire les invariants (stack, design system, modèle de données — `Reading` était déjà prévu en V0 §4).
