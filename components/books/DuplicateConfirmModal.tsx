"use client"

import * as React from "react"
import Link from "next/link"
import { Cover } from "@/components/ui/Cover"
import { Button } from "@/components/ui/Button"
import type { BookListed } from "@/lib/books"
import { digitalFormats, physicalCount } from "@/lib/books"

type Props = {
  book: BookListed
  intentLabel: string // ex. "Ajouter votre PDF" / "Declarer votre exemplaire physique"
  onMerge: () => void
  onCreateNew: () => void
  onCancel: () => void
  pending?: boolean
}

export function DuplicateConfirmModal({
  book,
  intentLabel,
  onMerge,
  onCreateNew,
  onCancel,
  pending
}: Props) {
  const formats = digitalFormats(book)
  const physicals = physicalCount(book)

  return (
    <div className="space-y-5">
      <p className="text-[13px] text-ink-3">
        On a trouve un livre similaire dans la bibliotheque.
      </p>

      <div className="flex gap-4 rounded-xl border border-[var(--rule)] bg-paper-2/30 p-4">
        <div className="w-20 shrink-0">
          <Cover title={book.title} author={book.author} src={book.coverUrl} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-serif text-lg leading-tight text-ink">{book.title}</h3>
          {book.author ? <p className="text-sm text-ink-2">{book.author}</p> : null}
          {book.year ? <p className="mt-0.5 text-[12px] text-ink-3">{book.year}</p> : null}
          {book.isbn ? (
            <p className="mt-0.5 font-mono text-[11px] text-ink-3">ISBN : {book.isbn}</p>
          ) : null}

          <ul className="mt-3 space-y-1 text-[13px] text-ink-2">
            {formats.map((f) => (
              <li key={f}>Numerique {f} disponible</li>
            ))}
            {physicals > 0 ? (
              <li>
                {physicals === 1 ? "1 exemplaire physique" : `${physicals} exemplaires physiques`}
              </li>
            ) : null}
          </ul>
          <Link
            href={`/bibliotheque/${book.id}`}
            target="_blank"
            className="mt-2 inline-block text-[12px] text-accent underline hover:opacity-80"
          >
            Voir la fiche existante
          </Link>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Button onClick={onMerge} disabled={pending} variant="primary">
          {pending ? "Ajout en cours..." : intentLabel}
        </Button>
        <Button onClick={onCreateNew} disabled={pending} variant="secondary">
          Creer une fiche distincte
        </Button>
        <Button onClick={onCancel} disabled={pending} variant="ghost">
          Annuler
        </Button>
      </div>
    </div>
  )
}
