import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { Avatar } from "@/components/ui/Avatar"
import { Badge } from "@/components/ui/Badge"
import { SignOutButton } from "@/components/auth/SignOutButton"

export const metadata: Metadata = {
  title: "Profil"
}

export default async function ProfilPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) redirect("/login")

  const { name, email, role, avatarColor } = session.user

  return (
    <section className="mx-auto max-w-2xl">
      <header className="mb-8">
        <h1 className="font-serif text-3xl text-ink">Profil</h1>
        <p className="mt-1 text-sm text-ink-3">Vos informations de compte.</p>
      </header>

      <div className="rounded-2xl border border-[var(--rule)] bg-paper-2/60 p-6">
        <div className="flex items-center gap-4">
          <Avatar name={name} email={email} color={avatarColor} size="lg" />
          <div className="min-w-0">
            <p className="truncate font-serif text-xl text-ink">
              {name ?? email.split("@")[0]}
            </p>
            <div className="mt-1 flex items-center gap-2">
              <span className="truncate text-[13px] text-ink-3">{email}</span>
              <Badge tone={role === "ADMIN" ? "accent" : "neutral"}>
                {role === "ADMIN" ? "Administrateur" : "Membre"}
              </Badge>
            </div>
          </div>
        </div>

        <dl className="mt-6 grid grid-cols-1 gap-4 border-t border-[var(--rule-2)] pt-6 sm:grid-cols-2">
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-widest text-ink-4">Email</dt>
            <dd className="mt-1 text-sm text-ink-2">{email}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-widest text-ink-4">Role</dt>
            <dd className="mt-1 text-sm text-ink-2">
              {role === "ADMIN" ? "Administrateur" : "Membre"}
            </dd>
          </div>
        </dl>

        <div className="mt-6 flex justify-end">
          <SignOutButton />
        </div>
      </div>
    </section>
  )
}
