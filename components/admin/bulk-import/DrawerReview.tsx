"use client"

import * as React from "react"
import { Cover } from "@/components/ui/Cover"
import { Button } from "@/components/ui/Button"
import type { ItemForUI } from "./ImportClient"

type Cand = {
  source: string
  externalId: string
  title: string
  author: string | null
  year: number | null
  publisher: string | null
  coverUrl: string | null
  isbn: string | null
  description: string | null
  language: string | null
  genre: string | null
}

type Props = { item: ItemForUI; sessionId: string; onUpdated: () => void }

export function DrawerReview({ item, sessionId, onUpdated }: Props) {
  const candidates = (item.candidatesJson as Cand[] | null) ?? []
  const [picked, setPicked] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)

  const validate = async () => {
    if (!picked) return
    setPending(true)
    const cand = candidates.find((c) => c.externalId === picked)
    await fetch(`/api/admin/bulk-imports/${sessionId}/items/${item.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision: "CREATE", chosenCandidate: cand })
    })
    setPending(false)
    onUpdated()
  }

  const skip = async () => {
    setPending(true)
    await fetch(`/api/admin/bulk-imports/${sessionId}/items/${item.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision: "SKIP" })
    })
    setPending(false)
    onUpdated()
  }

  return (
    <div className="space-y-3">
      <p className="text-[12px] text-ink-3">
        Titre extrait : <em>{item.extractedTitle ?? "—"}</em>
      </p>

      <div className="space-y-2">
        {candidates.map((c) => (
          <button
            type="button"
            key={c.externalId}
            onClick={() => setPicked(c.externalId)}
            className={`flex w-full gap-2 rounded-md border p-2 text-left text-[12px] ${
              picked === c.externalId ? "border-[color:var(--accent)] bg-accent-soft/40" : "border-[var(--rule)] bg-paper"
            }`}
          >
            <div className="w-10 shrink-0">
              <Cover title={c.title} src={c.coverUrl} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-serif text-ink">{c.title}</p>
              <p className="truncate text-ink-3">{c.author ?? "—"} · {c.year ?? "—"}</p>
              <p className="truncate text-[10px] text-ink-3">{c.source} {c.isbn ? "· ISBN " + c.isbn : ""}</p>
            </div>
          </button>
        ))}
      </div>

      <div className="flex justify-between gap-2 pt-2">
        <Button variant="primary" onClick={validate} disabled={!picked || pending}>Valider</Button>
        <Button variant="ghost" onClick={skip} disabled={pending}>Ignorer</Button>
      </div>
    </div>
  )
}
