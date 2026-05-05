import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Mes livres"
}

export default function MesLivresPage() {
  return (
    <section className="mx-auto max-w-6xl">
      <header className="mb-6">
        <h1 className="font-serif text-3xl text-ink">Mes livres</h1>
        <p className="mt-1 text-sm text-ink-3">
          Les livres que vous avez ajoutes a la bibliotheque.
        </p>
      </header>
      <p className="text-sm text-ink-3">
        Disponible des la version 1.0, quand vous pourrez ajouter votre premier livre.
      </p>
    </section>
  )
}
