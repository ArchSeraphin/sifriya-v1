# Sifriya — CLAUDE.md

Bibliothèque en ligne privée, invitation-only. Centralise livres numériques et physiques pour un cercle fermé de 50–100 utilisateurs. Ce fichier est la source de vérité pour Claude Code : ne jamais dévier des choix techniques, du modèle de données et des conventions définis ici.

---

## 1. Contexte & contraintes

| Paramètre | Valeur |
|---|---|
| Domaine production | `sifriya.fr` |
| Hébergement | VPS Debian 13 — Coolify (Docker) |
| CI/CD | GitHub → Coolify (auto-deploy sur `main`) |
| Utilisateurs | 50–100, âges 20–80 ans |
| Volume V1 | 500–1 000 livres la première année |
| Fichiers max | 50 Mo par fichier, formats EPUB et PDF uniquement |
| Icônes | Lucide React uniquement — **zéro emoji dans l'UI** |
| Langue UI | Français |
| Usage | Cercle privé — aucune page publique, aucun moteur d'indexation |

---

## 2. Stack technique

Toutes les versions (V0 → V1.2) utilisent exactement cette stack. Ne pas introduire de librairies tierces sans raison explicite.

```
Framework      Next.js 16 (App Router, TypeScript strict)
CSS            Tailwind CSS v4 + CSS custom properties (tokens du design system)
Icônes         lucide-react@1
ORM            Prisma 7 (schema-first)
Base de données PostgreSQL 17 (container Coolify séparé)
Auth           next-auth v4 (NextAuth) — stratégie magic-link par email
Email          Resend v6 (magic links + notifications prêt)
Storage        Système de fichiers local — volume Docker monté sur /data/uploads
Métadonnées    Google Books API (priorité) + Open Library API (fallback)
Validation     Zod v4 (schémas partagés client/serveur)
Runtime        Node.js 24 LTS
```

### Pourquoi ces choix

- **Next.js fullstack** : une seule image Docker, Route Handlers pour l'API, App Router pour le SSR. Scalable vers un backend séparé plus tard sans refonte.
- **next-auth v4** (pas v5) : la v5 (Auth.js) est toujours en beta (`5.0.0-beta.31`). Pour une app de production, utiliser la v4 stable (`4.24.x`). Migrer vers v5 quand elle sera stable.
- **Tailwind v4** : config CSS-first, plus de `tailwind.config.js`. Les tokens du design system sont déclarés dans `globals.css` via `@theme`. Voir section 7.
- **Volume Docker local** : les fichiers restent sur le VPS. Pas de dépendance externe pour la V1. Extensible vers S3/MinIO plus tard en changeant uniquement `lib/storage.ts`.
- **Resend** : gratuit jusqu'à 3 000 mails/mois, largement suffisant pour 50–100 users. Fournisseur actuel, mais `lib/email.ts` est une abstraction — changer de fournisseur (Brevo, Postmark, SMTP générique…) ne touche que ce fichier. Voir section Email.

---

## 3. Structure du projet

```
sifriya-v1/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── verify/page.tsx
│   ├── (app)/
│   │   ├── layout.tsx           ← Shell : TopBar + Sidebar + contenu central
│   │   ├── bibliotheque/page.tsx
│   │   ├── pret/page.tsx
│   │   ├── mes-livres/page.tsx
│   │   ├── mes-lectures/page.tsx
│   │   └── profil/page.tsx
│   ├── admin/
│   │   ├── membres/page.tsx
│   │   └── parametres/page.tsx
│   └── api/
│       ├── auth/[...nextauth]/route.ts
│       ├── books/route.ts
│       ├── books/[id]/route.ts
│       ├── books/[id]/download/route.ts
│       ├── uploads/route.ts
│       ├── metadata/route.ts    ← proxy Google Books + Open Library
│       ├── loans/route.ts
│       └── admin/
│           ├── users/route.ts
│           └── invites/route.ts
├── components/
│   ├── layout/
│   │   ├── TopBar.tsx
│   │   ├── Sidebar.tsx
│   │   └── AppShell.tsx
│   ├── books/
│   │   ├── BookCard.tsx
│   │   ├── BookGrid.tsx
│   │   ├── BookList.tsx
│   │   ├── BookDetail.tsx
│   │   └── UploadFlow.tsx
│   ├── loans/
│   │   └── LoanRequest.tsx
│   └── ui/
│       ├── Button.tsx
│       ├── Input.tsx
│       ├── Badge.tsx
│       ├── Avatar.tsx
│       ├── Cover.tsx
│       └── Modal.tsx
├── lib/
│   ├── auth.ts                  ← config Auth.js
│   ├── db.ts                    ← singleton Prisma client
│   ├── storage.ts               ← read/write/delete fichiers (abstraction)
│   ├── metadata.ts              ← Google Books + Open Library
│   └── email.ts                 ← Resend templates
├── prisma/
│   └── schema.prisma
├── public/
│   └── logo.svg
├── middleware.ts                 ← protection routes auth
├── .env.local                   ← secrets (ne jamais committer)
├── .env.example                 ← template variables (committer)
├── Dockerfile
├── docker-compose.yml           ← dev local uniquement
└── next.config.ts
```

---

## 4. Modèle de données (Prisma)

```prisma
model User {
  id            String    @id @default(cuid())
  email         String    @unique
  name          String?
  role          Role      @default(USER)
  avatarColor   String    @default("#6b6354")
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  ownedBooks    Book[]    @relation("BookOwner")
  addedBooks    Book[]    @relation("BookAdder")
  loanRequests  Loan[]    @relation("LoanRequester")
  loansReceived Loan[]    @relation("LoanOwner")
  readings      Reading[]
  invitedBy     User?     @relation("UserInvites", fields: [invitedById], references: [id])
  invitedById   String?
  invitedUsers  User[]    @relation("UserInvites")
}

enum Role {
  ADMIN
  USER
}

model Book {
  id          String      @id @default(cuid())
  title       String
  author      String?
  isbn        String?
  coverUrl    String?     // URL externe (API) ou chemin local /data/uploads/covers/
  description String?
  genre       String?
  year        Int?
  publisher   String?
  language    String?     @default("fr")
  type        BookType    @default(DIGITAL)
  format      FileFormat? // null si physique
  filePath    String?     // null si physique. Jamais exposé publiquement.
  fileSize    Int?        // bytes
  sourceApi   String?     // "google_books" | "open_library" | "manual"
  externalId  String?     // ID dans l'API source
  addedAt     DateTime    @default(now())
  updatedAt   DateTime    @updatedAt

  addedById   String
  addedBy     User        @relation("BookAdder", fields: [addedById], references: [id])

  ownerId     String?     // null si numérique (pas de propriétaire)
  owner       User?       @relation("BookOwner", fields: [ownerId], references: [id])

  loans       Loan[]
  readings    Reading[]

  @@index([title])
  @@index([author])
  @@index([type])
  @@index([addedAt])
}

enum BookType {
  DIGITAL
  PHYSICAL
}

enum FileFormat {
  EPUB
  PDF
}

model Loan {
  id          String     @id @default(cuid())
  bookId      String
  book        Book       @relation(fields: [bookId], references: [id])
  requesterId String
  requester   User       @relation("LoanRequester", fields: [requesterId], references: [id])
  ownerId     String
  owner       User       @relation("LoanOwner", fields: [ownerId], references: [id])
  status      LoanStatus @default(PENDING)
  token       String?    @unique // JWT usage-unique pour liens email accepter/refuser
  tokenExpiry DateTime?           // expiration du token (72h)
  returnedAt  DateTime?           // renseigné quand status passe à RETURNED
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt
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
  user      User          @relation(fields: [userId], references: [id])
  bookId    String
  book      Book          @relation(fields: [bookId], references: [id])
  status    ReadingStatus @default(TO_READ)
  addedAt   DateTime      @default(now())
  updatedAt DateTime      @updatedAt  // horodatage du dernier changement de statut

  @@unique([userId, bookId])
}

enum ReadingStatus {
  TO_READ
  READING
  READ
}
```

---

## 5. Variables d'environnement

Créer `.env.local` (ne jamais committer) et `.env.example` (committer avec valeurs vides).

```bash
# Base de données
DATABASE_URL="postgresql://sifriya:password@localhost:5432/sifriya"

# next-auth v4 (NEXTAUTH_SECRET et NEXTAUTH_URL, pas AUTH_SECRET/AUTH_URL qui sont v5)
NEXTAUTH_SECRET="generate-with-openssl-rand-base64-32"
NEXTAUTH_URL="https://sifriya.fr"       # en dev : http://localhost:3000

# Email — config SMTP pour next-auth EmailProvider
EMAIL_SERVER_HOST="smtp.resend.com"     # ou smtp-relay.brevo.com, etc.
EMAIL_SERVER_PORT=465
EMAIL_SERVER_USER="resend"
EMAIL_SERVER_PASSWORD="re_xxxxxxxxxxxx"
EMAIL_FROM="Sifriya <noreply@sifriya.fr>"

# Email — Resend SDK pour emails transactionnels (lib/email.ts)
RESEND_API_KEY="re_xxxxxxxxxxxx"

# Storage
UPLOAD_DIR="/data/uploads"              # monté comme volume Docker en prod
                                        # en dev local : ./uploads (créer le dossier)

# APIs livre
GOOGLE_BOOKS_API_KEY="AIzaXXXXXXXXXXXXXX"  # optionnel, augmente le quota

# Seed
ADMIN_EMAIL="admin@sifriya.fr"          # compte admin créé au premier démarrage
```

---

## 6. Layout UI (invariant pour toutes les versions)

### Topbar (fixe, hauteur 56px)

```
[Logo + "Sifriya"]          [Barre de recherche]          [+ Ajouter un Livre]
 (gauche, font serif)        (centre, 40% de la largeur)   (droite, btn primary)
```

- Logo : `Source Serif 4`, 20px, poids 600
- Recherche : cherche dans la bibliothèque en temps réel (debounce 300ms)
- CTA "Ajouter un Livre" : ouvre un drawer/modal de sélection du type (numérique ou physique)

### Sidebar (fixe, largeur 240px)

```
Navigation :
  • Bibliothèque         (v1.0.0 — onglet par défaut)
  • Prêt                 (v1.2.0 — masqué jusqu'à implémentation)

  ─── Ma Bibliothèque ───
  • Mes livres
  • Mes lectures

Bas de sidebar :
  • [Avatar] Prénom Nom  → lien vers /profil
  • Paramètres           → lien vers /profil#settings ou /admin si ADMIN
```

- Onglets désactivés (versions futures) affichés en `--ink-4`, non cliquables, sans icône de verrou — ils disparaissent jusqu'à implémentation.
- L'onglet actif : fond `--paper-2`, texte `--ink`.

### Zone centrale

Prend tout l'espace restant. Padding intérieur : 32px. Scroll vertical uniquement.

---

## 7. Design System — Tokens

**Ne pas hardcoder de couleurs hexadécimales dans les composants.** Toujours utiliser les variables CSS.

### Configuration Tailwind v4 (CSS-first)

Tailwind v4 abandonne `tailwind.config.js`. La config se fait entièrement dans `app/globals.css` :

```css
/* app/globals.css */
@import "tailwindcss";

@theme {
  /* Les tokens custom sont déclarés ici — Tailwind les expose comme utilities */
  --color-paper:      #f5f1e8;
  --color-paper-2:    #ede7d8;
  --color-ink:        #1f1b13;
  --color-accent:     #8a6b1f;
  /* ... etc. */
}

/* Les variables CSS restent dans :root pour être utilisées directement en CSS/inline */
:root {
  --paper:      #f5f1e8;
  --paper-2:    #ede7d8;
  /* ... */
}
```

PostCSS (`postcss.config.mjs`) :
```js
export default { plugins: { "@tailwindcss/postcss": {} } }
```

**Règle** : utiliser les classes Tailwind (`bg-paper`, `text-ink`) pour le layout et l'espacement ; utiliser les variables CSS (`var(--accent)`) pour les composants custom et les pseudo-éléments.

### Couleurs

```css
--paper:       #f5f1e8   /* fond principal */
--paper-2:     #ede7d8   /* fond hover, sidebar active, inputs */
--paper-3:     #e3dcc8   /* fond pressed */
--ink:         #1f1b13   /* texte principal */
--ink-2:       #3a342a   /* texte secondaire */
--ink-3:       #6b6354   /* texte tertiaire, labels */
--ink-4:       #9a9180   /* texte désactivé, placeholders */
--rule:        rgba(31, 27, 19, 0.12)  /* bordures */
--rule-2:      rgba(31, 27, 19, 0.06) /* séparateurs légers */
--accent:      #8a6b1f   /* doré — boutons primary, liens actifs */
--accent-ink:  #faf7ef   /* texte sur fond accent */
--accent-soft: #e8dcb8   /* fond pills accent */
--ok:          #4a6b3e   /* succès */
--warn:        #a86a1f   /* avertissement */
--err:         #8a3030   /* erreur */
--shadow-1:    0 1px 0 rgba(255,255,255,.4) inset, 0 1px 2px rgba(31,27,19,.06)
--shadow-2:    0 1px 0 rgba(255,255,255,.5) inset, 0 6px 24px rgba(31,27,19,.10)
```

### Typographie

```
--serif:  "Source Serif 4", Georgia, serif     → titres, noms de livres, logo
--sans:   "Inter", -apple-system, sans-serif   → tout le reste (UI)
--mono:   "JetBrains Mono", ui-monospace       → formats fichier, métadonnées techniques
```

Importer depuis Google Fonts :
```
Source Serif 4: opsz 8..60, poids 300 400 500 600 700
Inter: poids 400 500 600
JetBrains Mono: poids 400 500
```

### Composants UI de base

**Boutons** (hauteur 36px, border-radius 6px, font-size 14px, gap 8px avec icône) :
- `primary` : fond `--accent`, texte `--accent-ink`
- `secondary` : fond `--paper`, border `--rule`, shadow-1
- `ghost` : transparent, texte `--ink-2`
- `danger` : transparent, texte `--err`, border `rgba(138,48,48,.3)`
- `sm` : hauteur 28px, padding `0 12px`, font 13px
- `lg` : hauteur 44px, padding `0 22px`, font 15px
- `disabled` : opacity 0.4

**Inputs / Select** (hauteur 36px, border-radius 6px, padding `0 12px`) :
- border `--rule`, fond `--paper`, shadow-1
- focus : border `--ink-3`, shadow `0 0 0 3px rgba(31,27,19,.05)`

**Pills / Badges** (hauteur 24px, border-radius 12px, font 12px, padding `0 10px`) :
- neutre : fond `--paper-2`, texte `--ink-2`
- ok : fond `rgba(74,107,62,.12)`, texte `--ok`
- warn : fond `rgba(168,106,31,.14)`, texte `--warn`
- accent : fond `--accent-soft`, texte `#5a4711`

**Cover de livre** (ratio 2:3, fond `#3d2f17`, border-radius 3px) :
- Ombre portée : `0 1px 1px rgba(31,27,19,.15), 0 8px 18px rgba(31,27,19,.18)`
- Bande de reliure : pseudo `::before`, 5px à gauche, `rgba(0,0,0,.18)`
- Titre : `--serif`, 13px, en bas de la cover
- Auteur : 10px, opacity 0.75
- Format (EPUB/PDF) : `--mono`, 9px, en haut à droite, opacity 0.7
- Si pas de couverture image : fond généré par couleur (basé sur titre hashé)

**Avatar** (32px, border-radius 50%, initiales, fond `avatarColor` de l'user) :
- sm : 22px, font 10px
- lg : 44px, font 14px

---

## 8. Specs par version

### V0 — Fondations (implémenter en premier)

**Objectif** : app shell fonctionnelle, auth, rôles, invitations.

#### Auth & rôles

- Pas de page d'inscription publique.
- L'admin crée le premier compte via seed Prisma (`prisma/seed.ts`).
- L'admin invite un user par email → `POST /api/admin/invites` → Resend envoie un magic link valable 24h.
- Le lien magic-link arrive sur `/auth/verify?token=xxx` → next-auth crée la session.
- **ADMIN** : accès à toutes les pages + `/admin/*`
- **USER** : accès à `/(app)/*` uniquement

```typescript
// middleware.ts — syntaxe next-auth v4 (pas v5)
export { default } from "next-auth/middleware"
export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|public|login|verify).*)"]
}
```

```typescript
// app/api/auth/[...nextauth]/route.ts — config next-auth v4
import NextAuth from "next-auth"
import EmailProvider from "next-auth/providers/email"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { db } from "@/lib/db"

const handler = NextAuth({
  adapter: PrismaAdapter(db),
  providers: [EmailProvider({ server: { /* Resend SMTP */ }, from: process.env.EMAIL_FROM })],
  callbacks: {
    session: async ({ session, user }) => {
      session.user.id = user.id
      session.user.role = user.role
      return session
    }
  }
})
export { handler as GET, handler as POST }
```

#### Pages V0

| Route | Description |
|---|---|
| `/login` | Champ email + bouton "Recevoir mon lien" |
| `/auth/verify` | Page d'attente pendant validation du token |
| `/(app)/` | Redirect vers `/bibliotheque` |
| `/admin/membres` | Liste users + bouton inviter + toggle role |
| `/profil` | Nom, email (lecture seule), déconnexion |

#### Seed admin

```typescript
// prisma/seed.ts
await prisma.user.upsert({
  where: { email: process.env.ADMIN_EMAIL! },
  update: {},
  create: { email: process.env.ADMIN_EMAIL!, name: "Admin", role: "ADMIN" }
})
```

Ajouter `ADMIN_EMAIL` dans `.env.example`.

---

### V1.0.0 — Catalogue numérique

**Objectif** : upload, récupération métadonnées, catalogue, téléchargement.

#### Upload flow (modale/drawer en 3 étapes)

1. **Dépôt fichier** — drag & drop ou input file. Validation client : EPUB ou PDF, max 50 Mo. Afficher une barre de progression.
2. **Concordance API** — dès upload terminé, extraire le titre depuis les métadonnées du fichier (epub: `metadata.title`, pdf: `pdf.info.Title`) et interroger Google Books puis Open Library. Afficher max 5 suggestions avec couverture, titre, auteur, année. L'user choisit ou clique "Aucune correspondance".
3. **Fiche livre** — formulaire pré-rempli (si concordance choisie) ou vide. Champs : titre*, auteur, ISBN, genre (select), année, langue, description. Bouton "Ajouter à la bibliothèque". Si une couverture est disponible depuis l'API, l'afficher en preview.

```typescript
// lib/metadata.ts
export async function searchBooks(query: string): Promise<BookMetadata[]> {
  // 1. Google Books API
  const gb = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=5&key=${process.env.GOOGLE_BOOKS_API_KEY}`)
  // 2. Si < 3 résultats, fallback Open Library
  // Normaliser en BookMetadata[]
}
```

#### Catalogue (`/bibliotheque`)

- **Vue grille** (défaut) : BookCard — couverture (ratio 2:3), titre (`--serif`), auteur en dessous, badge format (EPUB/PDF).
- **Vue liste** : tableau avec colonnes Titre, Auteur, Format, Date d'ajout.
- Bascule vue grille/liste : icônes `LayoutGrid` et `List` (Lucide) en haut à droite.
- **Tri** : Récent, Titre A→Z, Auteur A→Z (select en haut à gauche).
- **Filtres** : Format (Tous / EPUB / PDF), Genre (multi-select si des genres existent).
- Barre de recherche globale (topbar) : debounce 300ms → appel `GET /api/books?q=...` côté serveur. Pas de filtre client-side.

#### Pagination

La route `GET /api/books` est paginée côté serveur. Ne jamais renvoyer tous les livres d'un coup.

```typescript
// GET /api/books?page=1&limit=24&q=&type=&format=&sort=recent
// Réponse : { books: Book[], total: number, page: number, totalPages: number }
const DEFAULT_PAGE_SIZE = 24 // 3 rangées de 8 en grille desktop
```

Le composant `BookGrid` affiche un bouton "Charger plus" (infinite scroll ou pagination numérique — au choix à l'implémentation). L'état de page est dans l'URL (`?page=2`) pour que le lien soit partageable.

#### Téléchargement

- Bouton "Télécharger" sur la fiche livre (`GET /api/books/[id]/download`).
- L'API vérifie la session, lit le fichier depuis `UPLOAD_DIR`, renvoie en stream avec `Content-Disposition: attachment`.
- **Jamais exposer le chemin physique du fichier** dans les URLs publiques.

#### Validation serveur des uploads (obligatoire)

La validation client (EPUB/PDF, 50 Mo) n'est pas suffisante — elle peut être bypassée. `POST /api/uploads` doit impérativement vérifier côté serveur :

```typescript
// app/api/uploads/route.ts
const ALLOWED_MIME = ["application/epub+zip", "application/pdf"]
const MAX_SIZE = 50 * 1024 * 1024 // 50 Mo

// 1. Vérifier le Content-Type ou lire les magic bytes du fichier
if (!ALLOWED_MIME.includes(file.type)) return Response.json({ error: "Format non supporté" }, { status: 400 })

// 2. Vérifier la taille
if (file.size > MAX_SIZE) return Response.json({ error: "Fichier trop volumineux" }, { status: 413 })

// 3. Sanitiser le nom de fichier avant stockage (protection path traversal)
import path from "path"
const safeFilename = path.basename(file.name).replace(/[^a-zA-Z0-9.\-_]/g, "_")
```

#### Storage abstraction

```typescript
// lib/storage.ts
export async function saveFile(buffer: Buffer, filename: string): Promise<string>
export async function getFile(filePath: string): Promise<ReadableStream>
export async function deleteFile(filePath: string): Promise<void>
// saveFile utilise path.join(UPLOAD_DIR, path.basename(filename)) — jamais de path traversal.
// Implémentation V1 : fs local. Extensible vers S3 sans changer les appelants.
```

#### Email abstraction

`lib/email.ts` expose uniquement des fonctions métier. Le fournisseur (Resend, Brevo, SMTP…) est un détail d'implémentation interne à ce fichier. **Ne jamais importer Resend directement dans les Route Handlers ou composants.**

```typescript
// lib/email.ts — contrat public (ne pas modifier les signatures)
//
// Note : sendMagicLink n'est PAS appelée manuellement — next-auth gère les magic links
// via son EmailProvider SMTP. Cette fonction est documentée ici uniquement pour référence,
// et peut servir pour des invitations admin hors flux next-auth.
export async function sendMagicLink(to: string, url: string): Promise<void>
export async function sendLoanRequest(opts: {
  ownerEmail: string
  ownerName: string
  requesterName: string
  bookTitle: string
  acceptUrl: string
  refuseUrl: string
}): Promise<void>
export async function sendLoanAccepted(opts: {
  requesterEmail: string
  requesterName: string
  bookTitle: string
  ownerName: string
}): Promise<void>
export async function sendLoanRefused(opts: {
  requesterEmail: string
  requesterName: string
  bookTitle: string
}): Promise<void>

// Implémentation V1 : Resend SDK.
// Pour changer de fournisseur (Brevo SMTP, Postmark…) :
//   1. Remplacer uniquement le corps des fonctions ci-dessus
//   2. Mettre à jour les variables d'env dans .env.example
//   3. Aucun autre fichier à toucher
```

**Config SMTP pour next-auth v4** (indépendante de `lib/email.ts`) :
```bash
# .env.local — variables next-auth EmailProvider
EMAIL_SERVER_HOST="smtp.resend.com"     # ou smtp-relay.brevo.com, etc.
EMAIL_SERVER_PORT=465
EMAIL_SERVER_USER="resend"
EMAIL_SERVER_PASSWORD="re_xxxxxxxxxxxx"
EMAIL_FROM="Sifriya <noreply@sifriya.fr>"
```

---

### V1.1.0 — Livres physiques

**Objectif** : ajouter des livres physiques au catalogue, avec propriétaire.

#### 3 modes d'ajout (modale unifiée, sélection du mode en step 1)

**ISBN** : input → `GET /api/metadata?isbn=XXXXXXX` → concordance auto (une seule) → confirmation obligatoire par l'user avant d'enregistrer (afficher la fiche complète avec un bouton "Confirmer" et "Modifier").

**Recherche titre** : input texte → liste de résultats API (max 5) → l'user sélectionne → confirmation.

**Manuel** : formulaire vide — tous les champs, upload optionnel d'une image de couverture (JPG/PNG max 5 Mo, stockée dans `UPLOAD_DIR/covers/`).

#### Fiche livre physique

Même composant `BookDetail` que numérique, mais :
- Champ **Propriétaire** : avatar + nom de l'user owner.
- Pas de bouton "Télécharger".
- Bouton "Demander en prêt" (V1.2.0 — désactivé pour l'instant avec tooltip "Bientôt disponible").

#### Catalogue — différenciation visuelle

- Badge "Physique" sur les cards (`--warn` pill).
- Filtre Type : Tous / Numérique / Physique.

---

### V1.2.0 — Système de prêt

**Objectif** : demande de prêt par email, suivi statut.

#### Flow

1. User clique "Demander en prêt" sur fiche d'un livre physique.
2. `POST /api/loans` → crée un `Loan` en statut `PENDING`.
3. Générer un JWT signé avec `NEXTAUTH_SECRET`, payload `{ loanId, exp: now+72h }`. Stocker le token haché sur `Loan.token`, l'expiry sur `Loan.tokenExpiry`.
4. Resend envoie un email au propriétaire avec deux CTA : "Accepter" et "Refuser" (`GET /api/loans/[id]/respond?action=accept&token=xxx`).
5. À la réception : vérifier signature JWT, vérifier expiry, vérifier que `Loan.status === PENDING` (idempotence). Si valide → mettre à jour le statut, invalider le token (`Loan.token = null`), envoyer email de confirmation au demandeur.
6. L'échange physique se fait entre les deux (hors app).

#### Page Prêt (`/pret`)

Deux colonnes :
- **Mes demandes envoyées** : liste des prêts demandés par l'user connecté.
- **Mes demandes reçues** : liste des prêts de ses livres.
- Statuts affichés en pills : En attente (`warn`), Accepté (`ok`), Refusé (`err`), Rendu (`neutre`).

#### Fiche livre physique V1.2.0

Deux champs supplémentaires :
- **Propriétaire** : avatar + nom
- **Actuellement chez** : avatar + nom si prêt accepté en cours, sinon "Disponible" (pill `ok`)

---

## 9. Responsive

L'app doit fonctionner sur mobile, tablette et desktop. Breakpoints Tailwind standards :

| Breakpoint | Comportement |
|---|---|
| `< md` (< 768px) | Sidebar masquée → icône hamburger dans TopBar, drawer overlay |
| `md` → `lg` | Sidebar collapsée (icônes seules, largeur 60px) |
| `> lg` | Sidebar complète (240px) |

---

## 10. Conventions de code

- **TypeScript strict** : `"strict": true` dans `tsconfig.json`. Pas de `any` sans commentaire justificatif.
- **Server Components par défaut** — passer en Client Component (`"use client"`) uniquement si nécessaire (interactivité, hooks).
- **Validation Zod** : tout payload d'API validé avec Zod côté serveur. Réutiliser les schémas côté client pour les formulaires.
- **Gestion d'erreurs** : les Route Handlers retournent `{ error: string }` avec le status HTTP approprié. Les composants affichent un état d'erreur inline (pas de toast global).
- **Nommage fichiers** : `PascalCase.tsx` pour composants, `camelCase.ts` pour utilitaires.
- **Prisma** : toujours utiliser le singleton `lib/db.ts`. Ne jamais instancier `new PrismaClient()` ailleurs.
- **Pas de `console.log`** en production. Utiliser un logger minimal (`lib/logger.ts`) qui désactive en prod.
- **Accessibilité** : labels sur tous les inputs, `aria-label` sur les boutons icon-only, navigation clavier.

---

## 11. Docker & déploiement

### Dockerfile (production)

```dockerfile
# Stage 1 : toutes les dépendances (dev incluses) pour le build
FROM node:24-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

# Stage 2 : uniquement les dépendances de production
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --only=production

# Stage 3 : image finale légère
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
```

Ajouter dans `next.config.ts` :
```typescript
output: "standalone"
```

### Volume Docker

Le dossier `UPLOAD_DIR=/data/uploads` doit être monté comme volume persistant dans Coolify. Sans ça, les fichiers sont perdus à chaque redéploiement.

### Migration en production

Coolify doit exécuter `npx prisma migrate deploy` au démarrage du container (via un entrypoint script ou un `postinstall` conditionnel).

### Health check

Ajouter un endpoint `GET /api/health` qui renvoie `{ status: "ok", db: "ok" }` (vérifie la connexion Prisma). Coolify peut l'utiliser comme health check Docker.

### docker-compose.yml (dev local uniquement)

```yaml
services:
  db:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: sifriya
      POSTGRES_PASSWORD: password
      POSTGRES_DB: sifriya
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

---

## 12. Ordre d'implémentation

Respecter strictement cet ordre. Chaque étape doit être fonctionnelle avant de passer à la suivante.

```
1. Setup projet
   ├── next create, tsconfig strict, tailwind, lucide-react
   ├── Configurer les CSS custom properties dans globals.css
   └── Dockerfile + docker-compose.yml dev

2. Base de données
   ├── Prisma schema complet (tous les modèles dès maintenant)
   ├── Migration initiale
   └── Seed admin

3. Auth (V0)
   ├── Auth.js config (magic link + Resend)
   ├── Pages /login et /verify
   └── Middleware de protection des routes

4. Shell UI (V0)
   ├── TopBar
   ├── Sidebar
   ├── AppShell layout
   └── Pages admin (membres, invitations)

5. Storage & Metadata
   ├── lib/storage.ts
   └── lib/metadata.ts (Google Books + Open Library)

6. Upload numérique (V1.0.0)
   ├── Upload flow 3 étapes
   └── POST /api/uploads

7. Catalogue numérique (V1.0.0)
   ├── GET /api/books (avec filtres, tri, recherche)
   ├── BookCard, BookGrid, BookList
   └── GET /api/books/[id]/download

8. Livres physiques (V1.1.0)
   ├── Ajout ISBN + titre + manuel
   └── Catalogue unifié avec filtre type

9. Prêts (V1.2.0)
   ├── POST /api/loans + emails Resend
   ├── GET /api/loans/[id]/respond
   └── Page /pret

10. Responsive & polish
    └── Tests mobile, a11y, dark mode si demandé
```

---

## 13. Features futures (ne pas implémenter, ne pas préparer de code)

Ces features sont listées pour contexte uniquement. L'architecture choisie (Next.js fullstack, Prisma, storage abstrait) les rend faisables sans refonte. Ne pas anticiper leur implémentation.

- Upload en masse de fichiers numériques
- Liseuse en ligne (annotations, marque-pages, recherche dans le livre)
- Ajout d'articles et vidéos par lien
- Bibliothèques avec accès restreint par groupe d'users
- PDF personnels (articles, écrits perso) avec propriétaire
