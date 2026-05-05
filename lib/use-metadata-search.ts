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
  // On annule les requetes obsoletes (tap rapide + course conditions).
  const seqRef = React.useRef(0)

  const search = React.useCallback(async (q: string) => {
    const trimmed = q.trim()
    const seq = ++seqRef.current
    if (trimmed.length < 2) {
      setState({ ...INITIAL, query: q, hasSearched: false })
      return
    }
    setState((s) => ({
      ...s,
      query: q,
      searching: true,
      loadingMore: false,
      error: null,
      hasSearched: true
    }))
    const res = await fetch(`/api/metadata?q=${encodeURIComponent(trimmed)}&limit=5&offset=0`)
    if (seq !== seqRef.current) return
    if (!res.ok) {
      setState((s) => ({ ...s, searching: false, error: "Echec de la recherche." }))
      return
    }
    const body = (await res.json()) as ApiResponse
    setState({
      query: q,
      results: body.results,
      source: body.source,
      hasMore: body.hasMore,
      searching: false,
      loadingMore: false,
      error: null,
      hasSearched: true
    })
  }, [])

  const loadMore = React.useCallback(async () => {
    setState((s) => {
      if (s.loadingMore || s.searching || !s.hasMore || !s.source || s.source === "mixed") {
        return s
      }
      return { ...s, loadingMore: true, error: null }
    })
    // Capture l'etat courant pour construire la requete (en dehors du setState
    // pour eviter les valeurs perimees).
    let snapshot: State | null = null
    setState((s) => {
      snapshot = s
      return s
    })
    const s = snapshot!
    if (!s.hasMore || !s.source || s.source === "mixed") {
      return
    }
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
      setState((cur) => ({ ...cur, loadingMore: false, error: "Echec du chargement." }))
      return
    }
    const body = (await res.json()) as ApiResponse
    setState((cur) => {
      // Dedup : Google Books peut renvoyer des resultats qui chevauchent les
      // pages precedentes (le tri n'est pas strictement stable). On filtre par
      // externalId+source.
      const seen = new Set(cur.results.map((r) => `${r.source}:${r.externalId}`))
      const fresh = body.results.filter((r) => !seen.has(`${r.source}:${r.externalId}`))
      return {
        ...cur,
        results: [...cur.results, ...fresh],
        hasMore: body.hasMore && fresh.length > 0,
        loadingMore: false
      }
    })
  }, [])

  const reset = React.useCallback(() => {
    seqRef.current++
    setState(INITIAL)
  }, [])

  return { ...state, search, loadMore, reset }
}
