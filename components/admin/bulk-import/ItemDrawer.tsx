"use client"

import * as React from "react"
import { X } from "lucide-react"
import { DrawerAutoOk } from "./DrawerAutoOk"
import { DrawerReview } from "./DrawerReview"
import { DrawerManual } from "./DrawerManual"
import { DrawerDuplicate } from "./DrawerDuplicate"
import type { ItemForUI } from "./ImportClient"

type Props = {
  item: ItemForUI
  sessionId: string
  onClose: () => void
  onPrev: (() => void) | null
  onNext: (() => void) | null
  onUpdated: () => void
  // Appele par les drawer variants apres une decision admin (Valider / Ignorer / Merger).
  // Saute au prochain item du meme status encore non decide, ou ferme le drawer.
  onAdvance: () => void
}

export function ItemDrawer({ item, sessionId, onClose, onPrev, onNext, onUpdated, onAdvance }: Props) {
  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handleEscape)
    return () => window.removeEventListener("keydown", handleEscape)
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed right-0 top-0 z-40 h-full w-full max-w-md overflow-y-auto border-l border-[var(--rule)] bg-paper shadow-[var(--shadow-2)]"
    >
      <header className="sticky top-0 flex items-center justify-between border-b border-[var(--rule-2)] bg-paper px-4 py-3">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-ink-3">{item.status}</p>
          <p className="font-mono text-[12px] text-ink">{item.filename}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="text-ink-3 transition hover:text-ink"
        >
          <X size={18} />
        </button>
      </header>

      <div className="p-4">
        {item.status === "AUTO_OK" ? <DrawerAutoOk item={item} sessionId={sessionId} onUpdated={onUpdated} /> : null}
        {item.status === "TO_REVIEW" ? <DrawerReview item={item} sessionId={sessionId} onUpdated={onUpdated} onAdvance={onAdvance} /> : null}
        {item.status === "MANUAL" ? <DrawerManual item={item} sessionId={sessionId} onUpdated={onUpdated} onAdvance={onAdvance} /> : null}
        {item.status === "DUPLICATE" ? <DrawerDuplicate item={item} sessionId={sessionId} onUpdated={onUpdated} onAdvance={onAdvance} /> : null}
      </div>

      <footer className="sticky bottom-0 flex justify-between border-t border-[var(--rule-2)] bg-paper px-4 py-3 text-[11px] text-ink-3">
        <button
          type="button"
          onClick={onPrev ?? undefined}
          disabled={!onPrev}
          className="disabled:opacity-30"
        >
          ← Precedent
        </button>
        <button
          type="button"
          onClick={onNext ?? undefined}
          disabled={!onNext}
          className="disabled:opacity-30"
        >
          Suivant →
        </button>
      </footer>
    </div>
  )
}
