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
  onCommitted
}: Props) {
  const [pending, setPending] = React.useState(false)
  const autoOkCount = counts.AUTO_OK ?? 0

  const bulkImportAutoOk = async () => {
    if (autoOkCount === 0) return
    setPending(true)
    try {
      const res = await fetch(`/api/admin/bulk-imports/${sessionId}/commit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}) // commit tous les items decides (CREATE pre-rempli pour AUTO_OK)
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

      <Button onClick={bulkImportAutoOk} disabled={pending || autoOkCount === 0}>
        Importer {autoOkCount} OK
      </Button>
    </div>
  )
}
