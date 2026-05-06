"use client"

import * as React from "react"
import { CONCURRENT_UPLOADS } from "@/lib/bulk-import-limits"

export type UploadJobStatus = "queued" | "uploading" | "processing" | "done" | "error"

export type UploadJob = {
  file: File
  status: UploadJobStatus
  itemId?: string
  error?: string
}

export function useBulkImportUploads(
  sessionId: string,
  files: File[]
): { jobs: UploadJob[] } {
  const [jobs, setJobs] = React.useState<UploadJob[]>(() =>
    files.map((f) => ({ file: f, status: "queued" }))
  )
  const startedRef = React.useRef(false)

  React.useEffect(() => {
    if (startedRef.current) return
    if (files.length === 0) return
    startedRef.current = true

    const queue = files.map((_, idx) => idx)
    let active = 0
    let cursor = 0

    const updateJob = (idx: number, patch: Partial<UploadJob>) =>
      setJobs((prev) => prev.map((j, i) => (i === idx ? { ...j, ...patch } : j)))

    const next = (): void => {
      while (active < CONCURRENT_UPLOADS && cursor < queue.length) {
        const idx = queue[cursor++]!
        active++
        ;(async () => {
          updateJob(idx, { status: "uploading" })
          try {
            const fd = new FormData()
            fd.append("file", files[idx]!)
            const res = await fetch(`/api/admin/bulk-imports/${sessionId}/upload`, {
              method: "POST",
              body: fd
            })
            if (!res.ok) {
              const body = (await res.json().catch(() => null)) as { error?: string } | null
              throw new Error(body?.error ?? "Upload echoue.")
            }
            const { itemId } = (await res.json()) as { itemId: string }
            updateJob(idx, { status: "processing", itemId })

            // Process fire-and-forget — le polling de la page mettra a jour le tableau
            void fetch(`/api/admin/bulk-imports/${sessionId}/items/${itemId}/process`, {
              method: "POST"
            })
              .then(() => updateJob(idx, { status: "done" }))
              .catch((err) => updateJob(idx, { status: "error", error: String(err) }))
          } catch (err) {
            updateJob(idx, {
              status: "error",
              error: err instanceof Error ? err.message : String(err)
            })
          } finally {
            active--
            void next()
          }
        })()
      }
    }
    void next()
  }, [files, sessionId])

  return { jobs }
}
