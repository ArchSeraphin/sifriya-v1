import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Mes lectures"
}

export default function MesLecturesPage() {
  return (
    <section className="mx-auto max-w-6xl">
      <header className="mb-6">
        <h1 className="font-serif text-3xl text-ink">Mes lectures</h1>
        <p className="mt-1 text-sm text-ink-3">
          Suivez les livres que vous voulez lire, lisez ou avez lus.
        </p>
      </header>
      <p className="text-sm text-ink-3">
        Disponible des la version 1.0, en meme temps que le catalogue numerique.
      </p>
    </section>
  )
}
