import type { Metadata } from "next"
import Link from "next/link"
import { Mail } from "lucide-react"

export const metadata: Metadata = {
  title: "Verifiez vos emails"
}

export default function VerifyPage() {
  return (
    <div className="rounded-2xl border border-[var(--rule)] bg-paper-2 p-6 text-center shadow-[var(--shadow-1)]">
      <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-[#5a4711]">
        <Mail size={20} />
      </div>
      <h1 className="mt-4 font-serif text-2xl text-ink">Verifiez vos emails</h1>
      <p className="mt-2 text-sm text-ink-3">
        Un lien de connexion vient de vous etre envoye. Il est valable 24 heures.
      </p>
      <p className="mt-4 text-[13px] text-ink-4">
        Pas d&apos;email recu ?{" "}
        <Link href="/login" className="text-ink-2 underline underline-offset-2 hover:text-ink">
          Renvoyer le lien
        </Link>
      </p>
    </div>
  )
}
