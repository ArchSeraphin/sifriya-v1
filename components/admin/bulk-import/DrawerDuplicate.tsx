"use client"

import * as React from "react"
import { Button } from "@/components/ui/Button"
import type { ItemForUI } from "./ImportClient"

type Props = { item: ItemForUI; sessionId: string; onUpdated: () => void }

export function DrawerDuplicate({ item, sessionId, onUpdated }: Props) {
  const [pending, setPending] = React.useState(false)

  const choose = async (decision: "MERGE" | "CREATE" | "SKIP") => {
    setPending(true)
    await fetch(`/api/admin/bulk-imports/${sessionId}/items/${item.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        decision,
        chosenCandidate: item.chosenCandidate,
        mergeIntoBookId: decision === "MERGE" ? item.mergeIntoBookId : null
      })
    })
    setPending(false)
    onUpdated()
  }

  return (
    <div className="space-y-3">
      <p className="text-[13px] text-ink-2">
        Ce livre semble correspondre a une fiche deja presente dans la bibliotheque.
      </p>
      {item.mergeIntoBookId ? (
        <a
          href={`/bibliotheque/${item.mergeIntoBookId}`}
          target="_blank"
          rel="noreferrer"
          className="inline-block text-[12px] text-[color:var(--accent)] underline"
        >
          Voir la fiche existante →
        </a>
      ) : null}

      <div className="space-y-2 pt-2">
        <Button variant="primary" onClick={() => choose("MERGE")} disabled={pending || !item.mergeIntoBookId}>
          Ajouter ma copie a la fiche existante
        </Button>
        <Button variant="secondary" onClick={() => choose("CREATE")} disabled={pending}>
          Creer une nouvelle fiche distincte
        </Button>
        <Button variant="ghost" onClick={() => choose("SKIP")} disabled={pending}>
          Ignorer ce fichier
        </Button>
      </div>
    </div>
  )
}
