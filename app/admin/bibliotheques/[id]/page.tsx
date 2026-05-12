import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { EditLibraryForm } from "@/components/libraries/EditLibraryForm"
import { MemberPicker } from "@/components/libraries/MemberPicker"

export const metadata: Metadata = {
  title: "Bibliotheque"
}

export const dynamic = "force-dynamic"

type Props = { params: Promise<{ id: string }> }

export default async function AdminLibraryDetailPage({ params }: Props) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect("/login")

  const [library, allUsers] = await Promise.all([
    db.library.findUnique({
      where: { id },
      include: {
        memberships: { select: { userId: true } },
        _count: { select: { copies: true, memberships: true } }
      }
    }),
    db.user.findMany({
      select: { id: true, name: true, email: true, avatarColor: true },
      orderBy: [{ name: "asc" }, { email: "asc" }]
    })
  ])

  if (!library) notFound()

  const memberIds = library.memberships.map((m) => m.userId)

  return (
    <section className="mx-auto max-w-3xl">
      <Link
        href="/admin/bibliotheques"
        className="mb-4 inline-flex items-center gap-1 text-[13px] text-ink-3 hover:text-ink"
      >
        <ArrowLeft size={14} />
        Retour
      </Link>
      <header className="mb-6">
        <h1 className="font-serif text-3xl text-ink">{library.name}</h1>
        {library.isDefault ? (
          <p className="mt-1 text-sm text-ink-3">
            Bibliotheque par defaut. Tous les membres y appartiennent automatiquement.
          </p>
        ) : (
          <p className="mt-1 text-sm text-ink-3">
            {library._count.copies} {library._count.copies > 1 ? "exemplaires" : "exemplaire"}
            {" - "}
            {library._count.memberships} {library._count.memberships > 1 ? "membres" : "membre"}
          </p>
        )}
      </header>

      <section className="mb-10 flex flex-col gap-3">
        <h2 className="font-serif text-xl text-ink">Parametres</h2>
        <EditLibraryForm
          library={{
            id: library.id,
            name: library.name,
            description: library.description,
            managerId: library.managerId,
            isDefault: library.isDefault,
            bookCount: library._count.copies
          }}
          users={allUsers}
        />
      </section>

      {!library.isDefault ? (
        <section className="flex flex-col gap-3">
          <h2 className="font-serif text-xl text-ink">Membres</h2>
          <MemberPicker
            libraryId={library.id}
            allUsers={allUsers}
            initialMemberIds={memberIds}
            managerId={library.managerId}
            currentUserId={session.user.id}
          />
        </section>
      ) : null}
    </section>
  )
}
