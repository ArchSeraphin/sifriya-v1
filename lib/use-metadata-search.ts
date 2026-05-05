"use client"

import * as React from "react"
import type { BookMetadata, MetadataSource } from "@/lib/metadata"

type ApiResponse = {
  results: BookMetadata[]
  hasMore: boolean
  source: MetadataSource | "mixed"
}

type State = {
  query: string
  results: BookMetadata[]
  source: MetadataSource | "mixed" | null
  hasMore: boolean
  searching: boolean
  loadingMore: boolean
  error: string | null
  hasSearched: boolean
}

const INITIAL: State = {
  query: "",
  results: [],
  source: null,
  hasMore: false,
  searching: false,
  loadingMore: false,
  error: null,
  hasSearched: false
}

export type MetadataSearch = State & {
  search: (q: string) => Promise<void>
  loadMore: () => Promise<void>
  reset: () => void
}

export function useMetadataSearch(): MetadataSearch {
  const [state, setState] = React.useState<State>(INITIAL)
  // Ref miroir de l'etat : permet de lire la valeur courante depuis loadMore
  // sans dependre du closure du dernier render (evite des bugs de "stale state"
  // si le composant n'a pas re-rendu entre deux clics sur "Charger plus").
  const stateRef = React.useRef<State>(INITIAL)
  React.useEffect(() => {
    stateRef.current = state
  }, [state])
  // On annule les requetes obsoletes (tap rapide + course conditions).
  const seqRef = React.useRef(0)

  const search = React.useCallback(async (q: string) => {
    const trimmed = q.trim()
    const seq = ++seqRef.current
    if (trimmed.length < 2) {
      const next = { ...INITIAL, query: q, hasSearched: false }
      stateRef.current = next
      setState(next)
      return
    }
    setState((s) => {
      const next = { ...s, query: q, searching: true, loadingMore: false, error: null, hasSearched: true }
      stateRef.current = next
      return next
    })
    const res = await fetch(`/api/metadata?q=${encodeURIComponent(trimmed)}&limit=5&offset=0`)
    if (seq !== seqRef.current) return
    if (!res.ok) {
      setState((s) => {
        const next = { ...s, searching: false, error: "Echec de la recherche." }
        stateRef.current = next
        return next
      })
      return
    }
    const body = (await res.json()) as ApiResponse
    const next: State = {
      query: q,
      results: body.results,
      source: body.source,
      hasMore: body.hasMore,
      searching: false,
      loadingMore: false,
      error: null,
      hasSearched: true
    }
    stateRef.current = next
    setState(next)
  }, [])

  const loadMore = React.useCallback(async () => {
    const s = stateRef.current
    if (s.loadingMore || s.searching || !s.hasMore || !s.source || s.source === "mixed") {
      return
    }
    setState((cur) => {
      const next = { ...cur, loadingMore: true, error: null }
      stateRef.current = next
      return next
    })

    const params = new URLSearchParams({
      q: s.query.trim(),
      limit: "5",
      offset: String(s.results.length),
      source: s.source
    })
    const seq = seqRef.current
    const res = await fetch(`/api/metadata?${params.toString()}`)
    if (seq !== seqRef.current) return
    if (!res.ok) {
      setState((cur) => {
        const next = { ...cur, loadingMore: false, error: "Echec du chargement." }
        stateRef.current = next
        return next
      })
      return
    }
    const body = (await res.json()) as ApiResponse
    setState((cur) => {
      // Dedup : Google Books peut renvoyer des resultats qui chevauchent les
      // pages precedentes (tri non strictement stable). Filtre par
      // externalId+source.
      const seen = new Set(cur.results.map((r) => `${r.source}:${r.externalId}`))
      const fresh = body.results.filter((r) => !seen.has(`${r.source}:${r.externalId}`))
      const next = {
        ...cur,
        results: [...cur.results, ...fresh],
        hasMore: body.hasMore && fresh.length > 0,
        loadingMore: false
      }
      stateRef.current = next
      return next
    })
  }, [])

  const reset = React.useCallback(() => {
    seqRef.current++
    stateRef.current = INITIAL
    setState(INITIAL)
  }, [])

  return { ...state, search, loadMore, reset }
}
