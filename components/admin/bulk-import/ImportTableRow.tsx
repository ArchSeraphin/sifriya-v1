"use client"

import { ChevronRight } from "lucide-react"
import type { ItemForUI } from "./ImportClient"

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "En attente", cls: "bg-paper-2 text-ink-3" },
  PROCESSING: { label: "Process...", cls: "bg-paper-2 text-ink-3" },
  AUTO_OK: { label: "Auto OK", cls: "bg-[rgba(74,107,62,0.12)] text-[color:var(--ok)]" },
  TO_REVIEW: { label: "A voir", cls: "bg-[rgba(168,106,31,0.14)] text-[color:var(--warn)]" },
  DUPLICATE: { label: "Doublon", cls: "bg-accent-soft text-[#5a4711]" },
  MANUAL: { label: "Manuel", cls: "bg-[rgba(138,48,48,0.10)] text-[color:var(--err)]" },
  ERROR: { label: "Erreur", cls: "bg-[rgba(138,48,48,0.18)] text-[color:var(--err)]" }
}

// Quand l'admin a tranche, le badge reflete sa decision plutot que le status brut.
// Status reste utilise comme fallback (decision NONE) ou pour ERROR/PENDING/PROCESSING.
const DECISION_LABEL: Record<string, { label: string; cls: string }> = {
  CREATE: { label: "Validé", cls: "bg-[rgba(74,107,62,0.12)] text-[color:var(--ok)]" },
  MERGE: { label: "À merger", cls: "bg-accent-soft text-[#5a4711]" },
  SKIP: { label: "Ignoré", cls: "bg-paper-2 text-ink-3" }
}

function badgeFor(item: ItemForUI): { label: string; cls: string } {
  // 1) Item commit -> badge "Importé"
  if (item.committedBookId) {
    return { label: "Importé", cls: "bg-[rgba(74,107,62,0.18)] text-[color:var(--ok)]" }
  }
  // 2) Status terminal cote machine (rien a faire)
  if (item.status === "ERROR" || item.status === "PENDING" || item.status === "PROCESSING") {
    return STATUS_LABEL[item.status]!
  }
  // 3) Decision admin prise -> badge decision
  if (item.decision !== "NONE" && DECISION_LABEL[item.decision]) {
    return DECISION_LABEL[item.decision]!
  }
  // 4) Fallback : status machine
  return STATUS_LABEL[item.status] ?? { label: item.status, cls: "bg-paper-2" }
}

export function ImportTableRow({
  item,
  sessionId
}: {
  item: ItemForUI
  sessionId: string
}) {
  const meta = badgeFor(item)
  const chosen = item.chosenCandidate as
    | { title?: string; author?: string | null }
    | null
  const candCount = Array.isArray(item.candidatesJson)
    ? (item.candidatesJson as unknown[]).length
    : 0

  const matchSummary = chosen?.title
    ? `${chosen.title}${chosen.author ? " — " + chosen.author : ""}`
    : item.status === "MANUAL"
      ? "Aucun candidat"
      : item.status === "PROCESSING" || item.status === "PENDING"
        ? "..."
        : `${candCount} candidats`

  return (
    <button
      type="button"
      onClick={() => {
        window.dispatchEvent(
          new CustomEvent("bulk-import-open-drawer", {
            detail: { itemId: item.id, sessionId }
          })
        )
      }}
      className="grid w-full cursor-pointer grid-cols-[1fr_180px_100px_24px] items-center gap-2 border-t border-[var(--rule-2)] px-4 py-2 text-left text-[12px] hover:bg-paper-2/50"
    >
      <div className="truncate font-mono text-ink-2">{item.filename}</div>
      <div className="truncate text-ink-2">{matchSummary}</div>
      <div>
        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] ${meta.cls}`}>
          {meta.label}
        </span>
      </div>
      <ChevronRight size={14} className="text-ink-3" />
    </button>
  )
}
