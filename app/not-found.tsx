import Link from "next/link"

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-6">
      <div className="max-w-md text-center">
        <p className="font-mono text-xs uppercase tracking-widest text-ink-3">404</p>
        <h1 className="mt-3 font-serif text-3xl text-ink">Introuvable</h1>
        <p className="mt-2 text-sm text-ink-2">
          Cette page n&apos;existe pas, ou elle est reservee.
        </p>
        <Link
          href="/bibliotheque"
          className="mt-6 inline-flex h-9 items-center rounded-md bg-accent px-4 text-sm text-accent-ink shadow-[var(--shadow-1)] transition hover:opacity-90"
        >
          Retour a la bibliotheque
        </Link>
      </div>
    </main>
  )
}
