"use client"

import * as React from "react"
import { Button } from "@/components/ui/Button"

type Props = {
  counts: Record<string, number>
  total: number
  active: string
  onChange: (k: string) => void
  sessionId: string
  onCommitted: () => void
  // Nombre d'items avec une decision prise (CREATE / MERGE / SKIP) et pas
  // encore commits. C'est exactement ce que le bouton "Importer" va traiter.
  readyToCommit: number
}

const STATUSES: Array<{ key: string; label: string; color: string }> = [
  {
    key: "AUTO_OK",
    label: "Auto OK",
    color: "bg-[rgba(74,107,62,0.12)] text-[color:var(--ok)]"
  },
  {
    key: "TO_REVIEW",
    label: "A voir",
    color: "bg-[rgba(168,106,31,0.14)] text-[color:var(--warn)]"
  },
  {
    key: "DUPLICATE",
    label: "Doublon",
    color: "bg-accent-soft text-[#5a4711]"
  },
  {
    key: "MANUAL",
    label: "Manuel",
    color: "bg-[rgba(138,48,48,0.10)] text-[color:var(--err)]"
  },
  {
    key: "ERROR",
    label: "Erreur",
    color: "bg-[rgba(138,48,48,0.18)] text-[color:var(--err)]"
  }
]

export function ImportFilters({
  counts,
  total,
  active,
  onChange,
  sessionId,
  onCommitted,
  readyToCommit
}: Props) {
  const [pending, setPending] = React.useState(false)

  const bulkCommit = async () => {
    if (readyToCommit === 0) return
    setPending(true)
    try {
      const res = await fetch(`/api/admin/bulk-imports/${sessionId}/commit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}) // commit tous les items decides
      })
      if (!res.ok) throw new Error("Echec du commit.")
      onCommitted()
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => onChange("ALL")}
          className={`rounded-full px-3 py-1 text-[12px] ${
            active === "ALL" ? "bg-paper-3 text-ink" : "bg-paper-2 text-ink-2"
          }`}
        >
          Tous {total}
        </button>
        {STATUSES.map((s) => (
          <button
            key={s.key}
            onClick={() => onChange(s.key)}
            className={`rounded-full px-3 py-1 text-[12px] ${s.color} ${
              active === s.key ? "ring-1 ring-ink-3" : ""
            }`}
          >
            {s.label} {counts[s.key] ?? 0}
          </button>
        ))}
      </div>

      <Button onClick={bulkCommit} disabled={pending || readyToCommit === 0}>
        Importer {readyToCommit}
      </Button>
    </div>
  )
}
