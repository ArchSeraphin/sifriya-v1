import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { LOAN_INCLUDE } from "@/lib/loans"
import { LoanRow } from "@/components/loans/LoanRow"
import { HandHelping } from "lucide-react"

export const metadata: Metadata = {
  title: "Pret"
}

export const dynamic = "force-dynamic"

export default async function PretPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect("/login")
  const userId = session.user.id

  const [sent, received] = await Promise.all([
    db.loan.findMany({
      where: { requesterId: userId },
      orderBy: { createdAt: "desc" },
      include: LOAN_INCLUDE
    }),
    db.loan.findMany({
      where: { ownerId: userId },
      orderBy: { createdAt: "desc" },
      include: LOAN_INCLUDE
    })
  ])

  return (
    <section className="mx-auto max-w-5xl">
      <header className="mb-8">
        <h1 className="font-serif text-3xl text-ink">Pret</h1>
        <p className="mt-1 text-sm text-ink-3">
          Vos demandes envoyees et les demandes que vous avez recues.
        </p>
      </header>

      <div className="grid gap-8 md:grid-cols-2">
        <Column
          title="Mes demandes envoyees"
          empty="Vous n'avez pas encore demande de livre en pret."
          loans={sent}
          perspective="sent"
        />
        <Column
          title="Mes demandes recues"
          empty="Aucune demande pour vos livres pour le moment."
          loans={received}
          perspective="received"
        />
      </div>
    </section>
  )
}

function Column({
  title,
  empty,
  loans,
  perspective
}: {
  title: string
  empty: string
  loans: Awaited<ReturnType<typeof db.loan.findMany>>
  perspective: "sent" | "received"
}) {
  return (
    <div>
      <h2 className="mb-3 font-serif text-lg text-ink">{title}</h2>
      {loans.length === 0 ? (
        <div className="flex items-center gap-3 rounded-2xl border border-dashed border-[var(--rule)] bg-paper-2/40 p-4 text-[13px] text-ink-3">
          <HandHelping size={16} className="text-ink-4" />
          <span>{empty}</span>
        </div>
      ) : (
        <ul className="space-y-3">
          {loans.map((loan) => (
            <LoanRow
              key={loan.id}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              loan={loan as any}
              perspective={perspective}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
