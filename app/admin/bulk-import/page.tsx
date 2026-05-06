import { redirect } from "next/navigation"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { DropZone } from "@/components/admin/bulk-import/DropZone"
import { SessionList } from "@/components/admin/bulk-import/SessionList"

export const dynamic = "force-dynamic"

export default async function BulkImportPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== "ADMIN") redirect("/bibliotheque")

  const active = await db.bulkImportSession.findMany({
    where: { ownerId: session.user.id, status: "IN_PROGRESS" },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      totalFiles: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { items: true } }
    }
  })

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-6">
      <header>
        <h1 className="font-serif text-2xl text-ink">Import en masse</h1>
        <p className="mt-1 text-[13px] text-ink-3">
          Deposez un dossier de livres numeriques (EPUB / PDF). Maximum 500 fichiers par session.
        </p>
      </header>

      <DropZone />

      {active.length > 0 ? (
        <section>
          <h2 className="mb-3 font-serif text-lg text-ink">Sessions en cours</h2>
          <SessionList sessions={active} />
        </section>
      ) : null}
    </div>
  )
}
