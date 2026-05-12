import type { Metadata } from "next"
import Link from "next/link"
import { Plus } from "lucide-react"
import { db } from "@/lib/db"

export const metadata: Metadata = {
  title: "Bibliotheques"
}

export const dynamic = "force-dynamic"

export default async function AdminLibrariesPage() {
  const libraries = await db.library.findMany({
    include: {
      manager: { select: { id: true, name: true, email: true } },
      _count: { select: { copies: true, memberships: true } }
    },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }]
  })

  return (
    <section className="mx-auto max-w-5xl">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-serif text-3xl text-ink">Bibliotheques</h1>
          <p className="mt-1 text-sm text-ink-3">
            {libraries.length} {libraries.length > 1 ? "bibliotheques" : "bibliotheque"} au total.
          </p>
        </div>
        <Link
          href="/admin/bibliotheques/nouveau"
          className="inline-flex h-9 items-center gap-2 rounded-md bg-[var(--accent)] px-4 text-[14px] font-medium text-[var(--accent-ink)] transition hover:opacity-90"
        >
          <Plus size={16} />
          Creer une bibliotheque
        </Link>
      </header>

      <ul className="divide-y divide-[var(--rule-2)] overflow-hidden rounded-2xl border border-[var(--rule)] bg-paper">
        {libraries.map((lib) => (
          <li key={lib.id} className="flex items-center justify-between gap-4 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-ink">{lib.name}</span>
                {lib.isDefault ? (
                  <span className="rounded-full bg-paper-2 px-2 py-0.5 text-[11px] uppercase tracking-wide text-ink-3">
                    Par defaut
                  </span>
                ) : null}
              </div>
              <p className="mt-0.5 text-[13px] text-ink-3">
                {lib._count.copies} {lib._count.copies > 1 ? "exemplaires" : "exemplaire"}
                {" - "}
                {lib._count.memberships} {lib._count.memberships > 1 ? "membres" : "membre"}
                {lib.manager ? <> - Gerant : {lib.manager.name ?? lib.manager.email}</> : null}
              </p>
            </div>
            <Link
              href={`/admin/bibliotheques/${lib.id}`}
              className="text-[13px] font-medium text-[var(--accent)] hover:underline"
            >
              {lib.isDefault ? "Voir" : "Gerer"}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
