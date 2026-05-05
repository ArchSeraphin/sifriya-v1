import type { Metadata } from "next"
import { db } from "@/lib/db"
import { Avatar } from "@/components/ui/Avatar"
import { Badge } from "@/components/ui/Badge"
import { MembersToolbar } from "@/components/admin/MembersToolbar"
import { MemberRoleSelect } from "@/components/admin/MemberRoleSelect"

export const metadata: Metadata = {
  title: "Membres"
}

export default async function MembresPage() {
  const users = await db.user.findMany({
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      avatarColor: true,
      createdAt: true,
      emailVerified: true
    }
  })

  return (
    <section className="mx-auto max-w-5xl">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-serif text-3xl text-ink">Membres</h1>
          <p className="mt-1 text-sm text-ink-3">
            {users.length} {users.length > 1 ? "membres invites" : "membre invite"}.
          </p>
        </div>
        <MembersToolbar />
      </header>

      <div className="overflow-hidden rounded-2xl border border-[var(--rule)] bg-paper-2/60">
        <table className="w-full text-sm">
          <thead className="text-left text-[12px] uppercase tracking-widest text-ink-4">
            <tr className="border-b border-[var(--rule-2)]">
              <th className="px-4 py-3 font-medium">Membre</th>
              <th className="px-4 py-3 font-medium">Statut</th>
              <th className="px-4 py-3 font-medium">Invite le</th>
              <th className="px-4 py-3 font-medium text-right">Role</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-[var(--rule-2)] last:border-0">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={u.name} email={u.email} color={u.avatarColor} size="md" />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink">
                        {u.name ?? u.email.split("@")[0]}
                      </p>
                      <p className="truncate text-[12px] text-ink-3">{u.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  {u.emailVerified ? (
                    <Badge tone="ok">Actif</Badge>
                  ) : (
                    <Badge tone="warn">En attente</Badge>
                  )}
                </td>
                <td className="px-4 py-3 text-ink-3">
                  {new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(u.createdAt)}
                </td>
                <td className="px-4 py-3 text-right">
                  <MemberRoleSelect id={u.id} role={u.role} email={u.email} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
