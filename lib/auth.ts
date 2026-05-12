import type { NextAuthOptions } from "next-auth"
import EmailProvider from "next-auth/providers/email"
import { PrismaAdapter } from "@next-auth/prisma-adapter"
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { db } from "@/lib/db"
import { pickAvatarColor } from "@/lib/avatar"
import { renderMagicLinkEmail } from "@/lib/email"

// On lit les variables d'env de maniere defensive : un module qui throw a
// l'import casse les builds Next.js (collecte de page data). Les erreurs reelles
// remonteront au moment du signin, ou la transport SMTP sera reellement utilisee.
const env = (key: string, fallback = ""): string => process.env[key] ?? fallback

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(db),
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    verifyRequest: "/verify",
    error: "/login"
  },
  providers: [
    EmailProvider({
      server: {
        host: env("EMAIL_SERVER_HOST"),
        port: Number(env("EMAIL_SERVER_PORT", "465")),
        auth: {
          user: env("EMAIL_SERVER_USER"),
          pass: env("EMAIL_SERVER_PASSWORD")
        }
      },
      from: env("EMAIL_FROM", "Sifriya <noreply@sifriya.fr>"),
      maxAge: 24 * 60 * 60, // lien valable 24h
      sendVerificationRequest: async ({ identifier, url, provider }) => {
        const nodemailer = await import("nodemailer")
        const transport = nodemailer.createTransport(provider.server as never)
        const { html, text, subject } = renderMagicLinkEmail({ url })
        await transport.sendMail({
          to: identifier,
          from: provider.from,
          subject,
          text,
          html
        })
      }
    })
  ],
  callbacks: {
    signIn: async ({ user }) => {
      // Cercle ferme : seuls les emails deja en base peuvent se connecter.
      // L'admin cree les comptes via /admin/membres avant que la personne
      // ne demande son magic link.
      if (!user.email) return false
      const existing = await db.user.findUnique({ where: { email: user.email } })
      return Boolean(existing)
    },
    jwt: async ({ token, user, trigger }) => {
      if (user) {
        token.id = user.id
        token.role = user.role
        token.avatarColor = user.avatarColor
      } else if (trigger === "update" || !token.role) {
        // Trigger "update" : declenche par useSession().update() apres une
        // modification de profil. On rafraichit nom + role + avatarColor depuis
        // la DB pour que l'UI reflete instantanement la nouvelle valeur.
        const fresh = token.email
          ? await db.user.findUnique({ where: { email: token.email } })
          : null
        if (fresh) {
          token.id = fresh.id
          token.role = fresh.role
          token.avatarColor = fresh.avatarColor
          token.name = fresh.name
        }
      }
      return token
    },
    session: async ({ session, token }) => {
      if (session.user) {
        session.user.id = token.id
        session.user.role = token.role
        session.user.avatarColor = token.avatarColor
      }
      return session
    }
  },
  events: {
    createUser: async ({ user }) => {
      if (!user.avatarColor && user.email) {
        await db.user.update({
          where: { id: user.id },
          data: { avatarColor: pickAvatarColor(user.email) }
        })
      }
    }
  }
}

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

// Guard pour les routes de gestion d'une biblio (ADMIN global ou gerant).
// Retourne la session si OK, sinon NextResponse 401/403 sous la cle `error`.
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
