"use client"

import { Cover } from "@/components/ui/Cover"
import type { ItemForUI } from "./ImportClient"

type Props = { item: ItemForUI; sessionId: string; onUpdated: () => void }

export function DrawerAutoOk({ item }: Props) {
  const c = item.chosenCandidate as
    | { title?: string; author?: string | null; coverUrl?: string | null; year?: number | null; publisher?: string | null }
    | null
  if (!c) return <p className="text-[13px] text-ink-3">Pas de candidat retenu.</p>
  return (
    <div className="space-y-3">
      <div className="flex gap-3">
        <Cover title={c.title ?? ""} src={c.coverUrl ?? null} className="h-28 w-20" />
        <div>
          <p className="font-serif text-base text-ink">{c.title}</p>
          <p className="text-[12px] text-ink-3">{c.author ?? "Auteur inconnu"}</p>
          <p className="mt-1 text-[11px] text-ink-3">
            {c.year ?? ""} {c.year && c.publisher ? "·" : ""} {c.publisher ?? ""}
          </p>
        </div>
      </div>
      <p className="text-[12px] text-ink-3">
        Match retenu automatiquement. Sera importe comme nouvelle fiche au prochain commit.
      </p>
    </div>
  )
}
