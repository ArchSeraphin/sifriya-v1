"use client"

import * as React from "react"
import { useBulkImportUploads } from "@/lib/use-bulk-import-uploads"
import { SESSION_POLL_INTERVAL_MS } from "@/lib/bulk-import-limits"
import { ImportTable } from "./ImportTable"
import { ImportFilters } from "./ImportFilters"
import { ImportProgressBar } from "./ImportProgressBar"
import type { BulkImportItem, BulkImportSessionStatus } from "@prisma/client"

type Props = {
  sessionId: string
  totalFiles: number
  initialStatus: BulkImportSessionStatus
}

export type ItemForUI = Omit<BulkImportItem, "candidatesJson" | "chosenCandidate"> & {
  candidatesJson: unknown
  chosenCandidate: unknown
}

export function ImportClient({ sessionId, totalFiles, initialStatus }: Props) {
  // Files presents en window global (poses par DropZone). Si la page est rechargee
  // sans files (reprise apres crash navigateur), on ne re-upload pas — l'admin reprend la review.
  const initialFiles = React.useMemo<File[]>(() => {
    if (typeof window === "undefined") return []
    const stash = (window as unknown as Record<string, unknown>).__bulkImportFiles
    if (Array.isArray(stash)) {
      delete (window as unknown as Record<string, unknown>).__bulkImportFiles
      return stash as File[]
    }
    return []
  }, [])

  useBulkImportUploads(sessionId, initialFiles)

  const [items, setItems] = React.useState<ItemForUI[]>([])
  const [status, setStatus] = React.useState<BulkImportSessionStatus>(initialStatus)
  const [filter, setFilter] = React.useState<string>("ALL")

  const refetch = React.useCallback(async () => {
    const res = await fetch(`/api/admin/bulk-imports/${sessionId}`)
    if (!res.ok) return
    const body = (await res.json()) as {
      session: { status: BulkImportSessionStatus; items: ItemForUI[] }
    }
    setItems(body.session.items)
    setStatus(body.session.status)
  }, [sessionId])

  // Polling tant qu'il reste des items en PENDING/PROCESSING.
  React.useEffect(() => {
    // Stop si la session est deja terminale
    if (status === "COMMITTED" || status === "ABANDONED") return

    let stopped = false
    const tick = async () => {
      if (stopped) return
      await refetch()
    }
    void tick()
    const interval = window.setInterval(tick, SESSION_POLL_INTERVAL_MS)
    return () => {
      stopped = true
      window.clearInterval(interval)
    }
  }, [refetch, status])

  const counts = React.useMemo(() => {
    const buckets: Record<string, number> = {}
    for (const i of items) buckets[i.status] = (buckets[i.status] ?? 0) + 1
    return buckets
  }, [items])

  const visibleItems = filter === "ALL" ? items : items.filter((i) => i.status === filter)
  const processedCount = items.filter(
    (i) => i.status !== "PENDING" && i.status !== "PROCESSING"
  ).length

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-xl text-ink">Import #{sessionId.slice(0, 8)}</h1>
          <p className="text-[12px] text-ink-3">
            {totalFiles} fichiers · {status}
          </p>
        </div>
      </header>

      <ImportProgressBar processed={processedCount} total={totalFiles} />
      <ImportFilters
        counts={counts}
        total={items.length}
        active={filter}
        onChange={setFilter}
        sessionId={sessionId}
        onCommitted={refetch}
      />
      <ImportTable items={visibleItems} sessionId={sessionId} />
    </div>
  )
}
