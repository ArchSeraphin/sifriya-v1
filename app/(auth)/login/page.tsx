import type { Metadata } from "next"
import { LoginForm } from "@/components/auth/LoginForm"

export const metadata: Metadata = {
  title: "Connexion"
}

type SearchParams = { error?: string; callbackUrl?: string }

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  return (
    <div className="rounded-2xl border border-[var(--rule)] bg-paper-2 p-6 shadow-[var(--shadow-1)]">
      <header className="mb-6 text-center">
        <p className="font-mono text-[11px] uppercase tracking-widest text-ink-3">Sifriya</p>
        <h1 className="mt-2 font-serif text-2xl text-ink">Bibliotheque privee</h1>
        <p className="mt-1 text-[13px] text-ink-3">
          Saisissez votre email pour recevoir un lien de connexion.
        </p>
      </header>
      <LoginForm callbackUrl={params.callbackUrl} initialError={params.error} />
    </div>
  )
}
