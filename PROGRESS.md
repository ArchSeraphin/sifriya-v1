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

## Surface fonctionnelle

### Pages
```
/login                          magic-link (formulaire)
/verify                         "vérifiez vos emails"
/bibliotheque                   catalogue paginé, filtres, vues grille/liste
/bibliotheque/[id]              fiche livre
/bibliotheque/[id]/modifier     édition fiche (auteur ou admin)
/mes-livres                     livres ajoutés par l'utilisateur
/mes-lectures                   placeholder V0 (aucune logique métier encore)
/pret                           demandes envoyées + reçues
/profil                         nom éditable + email + rôle + déconnexion
/admin/membres                  liste users + invitation + toggle rôle
```

### API (toutes les routes sont dynamiques, sous `/api/...`)
```
GET  /api/health                  liveness + DB ping
GET  /api/auth/[...nextauth]      NextAuth (email magic link)
PATCH /api/me                     édition nom utilisateur (Zod strict)
GET  /api/books                   liste paginée + filtres q/type/format/sort
POST /api/books                   crée DIGITAL (uploadId) ou PHYSICAL
GET  /api/books/[id]              fiche
PATCH /api/books/[id]             édition métadonnées (auteur ou admin)
DELETE /api/books/[id]            suppression + delete fichier
GET  /api/books/[id]/download     stream natif Web, attachment
POST /api/uploads                 dépôt EPUB/PDF (validation magic bytes)
POST /api/covers                  upload couverture (JPG/PNG/WEBP)
GET  /api/covers/[...path]        sert les couvertures (auth requise)
GET  /api/metadata                recherche Google + BnF + OL, paginée
POST /api/loans                   demande prêt + email JWT 72h
GET  /api/loans                   sent + received
GET  /api/loans/[id]/respond      atterrissage email (HTML public)
PATCH /api/loans/[id]/return      owner marque comme rendu
POST /api/admin/invites           crée user + magic link (admin only)
PATCH /api/admin/users/[id]       toggle rôle (admin only)
```

### Modèle de données
Conforme à `CLAUDE.md` section 4. Migration init : `prisma/migrations/20260505142536_init/`.

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

## Variables d'environnement

`.env.example` à jour. En dev local, `RESEND_API_KEY` peut rester vide — `lib/email.ts` logge alors les emails à la console (très pratique pour récupérer les liens accept/refuse de prêt).

## Reste à faire (en attente de demande)

**À arbitrer avec le user (identifié en prod, 2026-05-05) :**
- **Doublons** : aucun garde-fou actuellement. Définir critère (ISBN ? titre+auteur normalisés ? hash de fichier ?) et UX (bloquer / confirmer / proposer "autre copie"). Cas légitime à préserver : même œuvre en NUMERIQUE + PHYSIQUE.
- **Multi-formats** : aujourd'hui Candide EPUB + Candide PDF = 2 livres distincts. Refactor schéma possible : `Book` a `0..N BookFile` (chacun son format/filePath). Impact : migration data + refonte UploadFlow / BookDetail / API download. Décision schéma à prendre avant d'implémenter.

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
