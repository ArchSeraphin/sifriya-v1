# Sifriya — état du projet

> Source de vérité produit : `CLAUDE.md`. Ce fichier ne fait que tracer ce qui a été livré.

## Versions livrées (toutes en `main`)

| Tag | Commit | Contenu |
|---|---|---|
| V0 | `bf04a6b` | Stack + auth magic-link + shell + invitations admin |
| V1.0 | `55c7af9` | Catalogue numérique : upload 3 étapes, fiche, téléchargement |
| V1.1 + V1.2 | `d2203df` | Livres physiques (3 modes + cover) + prêts JWT 72h via email |
| Fix | `18ded0b` | `/api/covers/...` : 404 propre sur path traversal (au lieu de 500) |
| Fix | `ced4e0b` | Modale coupée en haut : `calc(100dvh_-_2rem)` + Portal vers `body` |
| UI | `6710929` | Pilules format toujours visibles (EPUB doré / PDF beige), typo plus compacte |
| Feature | `93d7204` | Page `/bibliotheque/[id]/modifier` + `PATCH /api/books/[id]` |
| Feature | `017b62b` | API **BnF SRU** + pagination "Charger plus" sur les recherches métadonnées |
| Fix | `603da82` | `loadMore` null state (capture via `stateRef` au lieu d'un setState lecteur) |
| Feature | `a4245ac` | Édition du nom affiché sur `/profil` (`PATCH /api/me`, JWT resync) |
| **V1.3** | branche `feat/v1-3-book-copies` | **Refactor `Book` → `Book` (œuvre) + `BookCopy` (exemplaire)**. Multi-formats par fiche, dédup à l'ajout (ISBN strict puis slug titre+auteur), modale de fusion vs fiche distincte, blocage 409 sur conflit format/owner. DB resetée. Plan : `docs/superpowers/plans/2026-05-06-doublons-multiformats.md`. Spec : `docs/superpowers/specs/2026-05-06-doublons-multiformats-design.md`. |
| Fix | `35181c9` | Couvertures haute résolution (Google Books `zoom=0`, retire `edge=curl`, helper `lib/cover-url.ts` utilisé en API et au rendu). |
| **V1.4** | branche `feat/v1-4-mes-lectures` | **Mes Lectures** : sélecteur 4 chips sur la fiche (`Aucun · À lire · En cours · Lu`), bookmark rapide sur les BookCard pour la wishlist, page `/mes-lectures` avec 3 onglets et compteurs. Privé strict. Plan : `docs/superpowers/plans/2026-05-06-mes-lectures.md`. Spec : `docs/superpowers/specs/2026-05-06-mes-lectures-design.md`. |

## Surface fonctionnelle

### Pages
```
/login                          magic-link (formulaire)
/verify                         "vérifiez vos emails"
/bibliotheque                   catalogue paginé, filtres, vues grille/liste
/bibliotheque/[id]              fiche livre
/bibliotheque/[id]/modifier     édition fiche (auteur ou admin)
/mes-livres                     livres ajoutés par l'utilisateur
/mes-lectures                   3 onglets À lire / En cours / Lu (?tab=...) avec compteurs
/pret                           demandes envoyées + reçues
/profil                         nom éditable + email + rôle + déconnexion
/admin/membres                  liste users + invitation + toggle rôle
```

### API (toutes les routes sont dynamiques, sous `/api/...`)
```
GET    /api/health                            liveness + DB ping
GET    /api/auth/[...nextauth]                NextAuth (email magic link)
PATCH  /api/me                                édition nom utilisateur (Zod strict)
GET    /api/books                             liste paginée + filtres (filtres traduits via copies.some)
POST   /api/books                             crée Book + 1ère BookCopy (DIGITAL avec uploadId, ou PHYSICAL)
GET    /api/books/[id]                        fiche (inclut copies[])
PATCH  /api/books/[id]                        édition métadonnées Book (addedBy d'au moins une copie + admin)
DELETE /api/books/[id]                        admin only (route nucléaire, normalement on supprime via copie)
GET    /api/books/[id]/download?format=EPUB   stream natif Web, attachment, 404 si format absent
POST   /api/books/match                       lookup ISBN/slug, retourne match | null (V1.3)
POST   /api/books/[id]/copies                 ajoute une copie à un Book existant (V1.3)
DELETE /api/books/[id]/copies/[cid]           supprime une copie (cascade Book si dernière) (V1.3)
PUT    /api/readings/[bookId]                 upsert statut Reading (TO_READ | READING | READ) (V1.4)
DELETE /api/readings/[bookId]                 retire la Reading (idempotent) (V1.4)
GET    /api/readings                          3 listes groupées (toRead, reading, read) (V1.4)
POST   /api/uploads                           dépôt EPUB/PDF (validation magic bytes)
POST   /api/covers                            upload couverture (JPG/PNG/WEBP)
GET    /api/covers/[...path]                  sert les couvertures (auth requise)
GET    /api/metadata                          recherche Google + BnF + OL, paginée
POST   /api/loans                             demande prêt sur copie physique (copyId) + email JWT 72h
GET    /api/loans                             sent + received (traverse copy.book)
GET    /api/loans/[id]/respond                atterrissage email (HTML public)
PATCH  /api/loans/[id]/return                 owner marque comme rendu
POST   /api/admin/invites                     crée user + magic link (admin only)
PATCH  /api/admin/users/[id]                  toggle rôle (admin only)
```

### Modèle de données
V1.3 : `Book` (œuvre) ↔ `0..N BookCopy` (exemplaire numérique ou physique). `Loan.copyId`, `Reading.bookId` (avec cascade). Migration : `prisma/migrations/20260506094857_v1_3_book_copies_init/`. Détail : `docs/superpowers/specs/2026-05-06-doublons-multiformats-design.md`.

## Écarts vs `CLAUDE.md` (tous documentés en commit)

1. **`middleware.ts` → `proxy.ts`** — Next 16 a renommé.
2. **`@next-auth/prisma-adapter@1.0.7`** au lieu de `@auth/prisma-adapter` (incompatibilité de types avec next-auth v4).
3. **Prisma 7** : `url` retiré de `datasource`, vit dans `prisma.config.ts` + adapter `@prisma/adapter-pg`.
4. **Port DB** : `5433` en local (5432 occupé par un autre projet).
5. **Tailwind v4** : arbitrary values avec opérateurs CSS exigent des `_` (sinon CSS invalide).
6. **Sources métadonnées** : ajout de **BnF SRU** (primary pour ISBN, complément pour titres) au-delà des Google + OpenLibrary spécifiés.
7. **Extraction titre EPUB/PDF** : non implémentée. Fallback : nom de fichier comme requête de recherche (suffisant en pratique).

## Démarrage rapide

```bash
docker compose up -d                     # Postgres 17 sur localhost:5433
npx prisma migrate deploy                # applique les migrations
npm run db:seed                          # crée admin@sifriya.fr (ADMIN_EMAIL de .env.local)
npm run dev                              # http://localhost:3000
```

**Login dev sans SMTP :**
```bash
npx tsx scripts/dev-magic-link.ts                  # admin
npx tsx scripts/dev-magic-link.ts toi@exemple.fr   # crée le user en USER si absent
```
Coller l'URL imprimée dans le navigateur.

**Cleanup uploads orphelins :**
```bash
npm run cleanup:pending                          # purge uploads/_pending/ (TTL 1h)
PENDING_TTL_MS=60000 npm run cleanup:pending     # TTL 1min pour test
```
En prod (Coolify) : Scheduled Task `npm run cleanup:pending` toutes les heures.

## Variables d'environnement

`.env.example` à jour. En dev local, `RESEND_API_KEY` peut rester vide — `lib/email.ts` logge alors les emails à la console (très pratique pour récupérer les liens accept/refuse de prêt).

## Reste à faire (en attente de demande)

**Polish potentiel non demandé :**
- Extraction auto du titre depuis EPUB (jszip → OPF) / PDF (pdf-lib → info dict)
- Cron de nettoyage `_pending/` des uploads orphelins (>1h)
- Tests automatisés (au-delà du smoke E2E manuel via curl)
- Édition de l'`avatarColor` sur `/profil` (palette à choix)

**Listés comme "ne pas anticiper" en `CLAUDE.md` section 13 :**
- Upload en masse de fichiers numériques
- Liseuse en ligne (annotations, marque-pages)
- Articles / vidéos par lien
- Bibliothèques avec accès restreint par groupes
- PDF personnels avec propriétaire
