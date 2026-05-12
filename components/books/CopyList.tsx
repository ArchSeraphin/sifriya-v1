"use client"

import * as React from "react"
import { Trash2, FileText, BookOpen } from "lucide-react"
import { Avatar } from "@/components/ui/Avatar"
import { Button } from "@/components/ui/Button"
import type { CopyDTO } from "@/lib/books"
import { formatBytes } from "@/lib/books"
import { useRouter } from "next/navigation"

type Props = {
  bookId: string
  copies: CopyDTO[]
  currentUser: { id: string; role: "ADMIN" | "USER" }
  isPersonal?: boolean
}

export function CopyList({ bookId, copies, currentUser, isPersonal }: Props) {
  const router = useRouter()
  const [deletingId, setDeletingId] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const onDelete = async (copyId: string) => {
    if (!confirm("Supprimer cette copie ?")) return
    setDeletingId(copyId)
    setError(null)
    const res = await fetch(`/api/books/${bookId}/copies/${copyId}`, {
      method: "DELETE"
    })
    setDeletingId(null)
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null
      setError(body?.error ?? "Echec de la suppression.")
      return
    }
    router.refresh()
  }

  return (
    <section className="border-t border-[var(--rule-2)] pt-6">
      <h2 className="font-serif text-lg text-ink">Copies disponibles</h2>
      <ul className="mt-3 space-y-2">
        {copies.map((c) => {
          const canDelete = currentUser.role === "ADMIN" || c.addedBy.id === currentUser.id
          return (
            <li
              key={c.id}
              className="flex items-center gap-3 rounded-md border border-[var(--rule-2)] bg-paper-2/30 px-3 py-2"
            >
              {c.type === "DIGITAL" ? (
                <FileText size={16} className="text-ink-3" />
              ) : (
                <BookOpen size={16} className="text-ink-3" />
              )}
              <div className="flex-1 min-w-0 text-[13px]">
                {c.type === "DIGITAL" ? (
                  <span className="text-ink-2">
                    <span className="font-mono uppercase tracking-widest">{c.format}</span>
                    {c.fileSize ? ` · ${formatBytes(c.fileSize)}` : ""} · {isPersonal && c.owner ? (
                      <>Auteur : <PersonInline person={c.owner} /></>
                    ) : (
                      <>ajoute par <PersonInline person={c.addedBy} /></>
                    )}
                  </span>
                ) : c.owner ? (
                  <span className="text-ink-2">
                    Physique chez <PersonInline person={c.owner} />
                  </span>
                ) : null}
              </div>
              {canDelete ? (
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => onDelete(c.id)}
                  disabled={deletingId === c.id}
                  aria-label="Supprimer cette copie"
                >
                  <Trash2 size={14} />
                </Button>
              ) : null}
            </li>
          )
        })}
      </ul>
      {error ? <p className="mt-2 text-[12px] text-[color:var(--err)]">{error}</p> : null}
    </section>
  )
}

function PersonInline({
  person
}: {
  person: { id: string; name: string | null; email: string; avatarColor: string }
}) {
  return (
    <span className="inline-flex items-center gap-1.5 align-middle">
      <Avatar name={person.name} email={person.email} color={person.avatarColor} size="sm" />
      <span className="text-ink">{person.name ?? person.email.split("@")[0]}</span>
    </span>
  )
}
