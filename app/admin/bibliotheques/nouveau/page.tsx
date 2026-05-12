import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { db } from "@/lib/db"
import { CreateLibraryForm } from "@/components/libraries/CreateLibraryForm"

export const metadata: Metadata = {
  title: "Nouvelle bibliotheque"
}

export const dynamic = "force-dynamic"

export default async function NewLibraryPage() {
  const users = await db.user.findMany({
    select: { id: true, name: true, email: true },
    orderBy: [{ name: "asc" }, { email: "asc" }]
  })

  return (
    <section className="mx-auto max-w-2xl">
      <Link
        href="/admin/bibliotheques"
        className="mb-4 inline-flex items-center gap-1 text-[13px] text-ink-3 hover:text-ink"
      >
        <ArrowLeft size={14} />
        Retour
      </Link>
      <header className="mb-6">
        <h1 className="font-serif text-3xl text-ink">Nouvelle bibliotheque</h1>
        <p className="mt-1 text-sm text-ink-3">
          Cree une bibliotheque restreinte. Les membres choisis pourront voir les livres qui y sont ajoutes.
        </p>
      </header>
      <CreateLibraryForm users={users} />
    </section>
  )
}
