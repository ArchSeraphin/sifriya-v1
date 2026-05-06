"use client"

import { ImportTableRow } from "./ImportTableRow"
import type { ItemForUI } from "./ImportClient"

export function ImportTable({
  items,
  sessionId
}: {
  items: ItemForUI[]
  sessionId: string
}) {
  return (
    <div className="overflow-hidden rounded-md border border-[var(--rule)]">
      <div className="grid grid-cols-[1fr_180px_100px_24px] gap-2 bg-paper-2 px-4 py-2 text-[11px] font-medium text-ink-2">
        <div>Fichier</div>
        <div>Match propose</div>
        <div>Status</div>
        <div></div>
      </div>
      {items.length === 0 ? (
        <p className="px-4 py-8 text-center text-[12px] text-ink-3">
          Aucun item dans ce filtre.
        </p>
      ) : (
        items.map((item) => (
          <ImportTableRow key={item.id} item={item} sessionId={sessionId} />
        ))
      )}
    </div>
  )
}
