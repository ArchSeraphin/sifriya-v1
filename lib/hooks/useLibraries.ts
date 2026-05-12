"use client"
import { useCallback, useEffect, useState } from "react"

export type LibraryListItem = {
  id: string
  name: string
  description: string | null
  isDefault: boolean
  manager: { id: string; name: string | null; email: string; avatarColor: string } | null
  bookCount: number
  memberCount: number
}

export function useLibraries() {
  const [libraries, setLibraries] = useState<LibraryListItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch("/api/libraries", { signal })
      if (!res.ok) {
        throw new Error(`GET /api/libraries failed (${res.status})`)
      }
      const json = await res.json()
      if (signal?.aborted) return
      setLibraries(json.libraries ?? [])
      setError(null)
    } catch (e) {
      if ((e as Error).name === "AbortError") return
      setError(e as Error)
    } finally {
      if (!signal?.aborted) setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    const ctrl = new AbortController()
    void refresh(ctrl.signal)
    return () => ctrl.abort()
  }, [refresh])

  return { libraries, error, isLoading, mutate: refresh }
}
