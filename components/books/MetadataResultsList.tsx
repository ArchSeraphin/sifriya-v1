"use client"

import * as React from "react"
import { Loader2 } from "lucide-react"
import type { BookMetadata, MetadataSource } from "@/lib/metadata"
import { Button } from "@/components/ui/Button"

const SOURCE_LABEL: Record<MetadataSource, string> = {
  google_books: "Google",
  bnf: "BnF",
  open_library: "OpenLibrary",
  manual: "Manuel"
}

const SOURCE_PILL: Record<MetadataSource, string> = {
  // Code couleur discret aligne sur la palette du design system.
  google_books: "bg-paper-3 text-ink-2",
  bnf: "bg-accent-soft text-[#5a4711]",
  open_library: "bg-paper-2 text-ink-3",
  manual: "bg-paper-2 text-ink-3"
}

type Props = {
  results: BookMetadata[]
  hasMore: boolean
  loadingMore: boolean
  searching: boolean
  emptyLabel?: string
  onPick: (m: BookMetadata) => void
  onLoadMore: () => void
}

export function MetadataResultsList({
  results,
  hasMore,
  loadingMore,
  searching,
  emptyLabel = "Aucune fiche trouvee. Affinez votre recherche ou continuez en saisie manuelle.",
  onPick,
  onLoadMore
}: Props) {
  if (searching && results.length === 0) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--rule)] bg-paper-2/40 px-4 py-8 text-[13px] text-ink-3">
        <Loader2 size={14} className="animate-spin" />
        Recherche en cours...
      </div>
    )
  }
  if (results.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--rule)] bg-paper-2/40 px-4 py-6 text-center text-[13px] text-ink-3">
        {emptyLabel}
      </div>
    )
  }
  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {results.map((m) => (
          <li key={`${m.source}-${m.externalId}`}>
            <button
              type="button"
              onClick={() => onPick(m)}
              className="flex w-full items-start gap-3 rounded-xl border border-[var(--rule)] bg-paper p-3 text-left transition hover:border-ink-3 hover:bg-paper-2"
            >
              <div className="h-20 w-14 shrink-0 overflow-hidden rounded-sm bg-paper-3">
                {m.coverUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={m.coverUrl}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                    onError={(e) => {
                      // Certaines couvertures BnF / OL renvoient des placeholders ;
                      // on cache l'image en cas d'erreur de chargement.
                      ;(e.target as HTMLImageElement).style.visibility = "hidden"
                    }}
                  />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 font-serif text-[14px] leading-tight text-ink">
                  {m.title}
                </p>
                {m.author ? (
                  <p className="mt-0.5 line-clamp-1 text-[12px] text-ink-2">{m.author}</p>
                ) : null}
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-ink-3">
                  {m.year ? <span>{m.year}</span> : null}
                  {m.publisher ? <span className="truncate">{m.publisher}</span> : null}
                  <span
                    className={`ml-auto inline-flex h-5 items-center rounded-full px-2 text-[10px] font-medium uppercase tracking-wider ${SOURCE_PILL[m.source]}`}
                  >
                    {SOURCE_LABEL[m.source]}
                  </span>
                </div>
              </div>
            </button>
          </li>
        ))}
      </ul>
      {hasMore ? (
        <div className="flex justify-center pt-1">
          <Button variant="ghost" size="sm" onClick={onLoadMore} disabled={loadingMore}>
            {loadingMore ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Chargement...
              </>
            ) : (
              <>Charger plus</>
            )}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
