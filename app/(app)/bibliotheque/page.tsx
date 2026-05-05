import type { Metadata } from "next"
import { Library } from "lucide-react"

export const metadata: Metadata = {
  title: "Bibliotheque"
}

export default function BibliothequePage() {
  return (
    <section className="mx-auto max-w-6xl">
      <header className="mb-8">
        <h1 className="font-serif text-3xl text-ink">Bibliotheque</h1>
        <p className="mt-1 text-sm text-ink-3">
          Tous les livres ajoutes par les membres.
        </p>
      </header>

      <EmptyState />
    </section>
  )
}

function EmptyState() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center rounded-2xl border border-dashed border-[var(--rule)] bg-paper-2/40 px-6 py-14 text-center">
      <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-[#5a4711]">
        <Library size={20} />
      </div>
      <h2 className="mt-4 font-serif text-xl text-ink">La bibliotheque est vide</h2>
      <p className="mt-2 text-[13px] text-ink-3">
        Le catalogue numerique sera disponible des la version 1.0.
      </p>
    </div>
  )
}
