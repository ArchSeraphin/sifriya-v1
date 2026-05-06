"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import type { ReadingStatus } from "@prisma/client"

type Props = {
  bookId: string
  currentStatus: ReadingStatus | null
}

const OPTIONS: ReadonlyArray<{ value: ReadingStatus | null; label: string }> = [
  { value: null, label: "Aucun statut" },
  { value: "TO_READ", label: "A lire" },
  { value: "READING", label: "En cours" },
  { value: "READ", label: "Lu" }
]

export function ReadingStatusPicker({ bookId, currentStatus }: Props) {
  const router = useRouter()
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const setStatus = async (next: ReadingStatus | null) => {
    if (next === currentStatus) return
    setPending(true)
    setError(null)
    const res =
      next === null
        ? await fetch(`/api/readings/${bookId}`, { method: "DELETE" })
        : await fetch(`/api/readings/${bookId}`, {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ status: next })
          })
    setPending(false)
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null
      setError(body?.error ?? "Echec de la mise a jour.")
      return
    }
    router.refresh()
  }

  return (
    <div className="space-y-1">
      <p className="text-[11px] font-medium uppercase tracking-widest text-ink-4">Mes lectures</p>
      <div className="flex flex-wrap gap-1.5">
        {OPTIONS.map((opt) => {
          const active = opt.value === currentStatus
          return (
            <button
              key={opt.value ?? "none"}
              type="button"
              onClick={() => setStatus(opt.value)}
              disabled={pending}
              className={
                active
                  ? "inline-flex h-7 items-center rounded-full bg-accent px-3 text-[12px] font-medium text-accent-ink shadow-[var(--shadow-1)]"
                  : "inline-flex h-7 items-center rounded-full border border-[var(--rule)] bg-paper px-3 text-[12px] text-ink-2 shadow-[var(--shadow-1)] transition hover:bg-paper-2 hover:text-ink disabled:opacity-60"
              }
              style={pending ? { opacity: 0.6 } : undefined}
              aria-pressed={active}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
      {error ? <p className="text-[12px] text-[color:var(--err)]">{error}</p> : null}
    </div>
  )
}
