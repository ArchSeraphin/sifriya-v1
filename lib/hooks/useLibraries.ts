"use client"
import { useEffect, useState } from "react"

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

  const refresh = async () => {
    try {
      const res = await fetch("/api/libraries")
      const json = await res.json()
      setLibraries(json.libraries ?? [])
    } catch (e) {
      setError(e as Error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { refresh() }, [])

  return { libraries, error, isLoading, mutate: refresh }
}
